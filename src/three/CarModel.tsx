import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { GLTFLoader } from 'three-stdlib';
import { applyMaterialAdjustments, type ReferenceMaterialMaps } from './materialAdjustments';
import { DoorHotspot } from './DoorHotspot';
import { createDriverDoorAssembly } from './doorAssembly';
import { isInteriorOrbitEnabled, type ExplorePhase, type ExploreViewPhase } from './experienceTypes';
import { DRIVER_DOOR_OPEN_ANGLE } from './interiorTransitionShots';
import { computeModelNormalization } from './modelNormalization';
import { storyVisualState } from './storyState';
import type { ModelTier } from './deviceProfile';
import type { VehicleInteractionRig } from './VehicleInteractionRig';
import { VehicleLightEffects } from './VehicleLightEffects';
import { createVehicleLightAssembly, resolveVehicleLightBlend } from './vehicleLightAssembly';
import { createSteeringWheelAssembly, STEERING_WHEEL_LOCAL_AXIS } from './steeringWheel';

const URLS = {
  original: '/models/norka-r35-original.glb',
  desktop: '/models/norka-r35-desktop.glb',
  mobile: '/models/norka-r35-mobile.glb',
  'mobile-low': '/models/norka-r35-mobile-low.glb',
  'mobile-fallback': '/models/norka-r35-mobile-fallback.glb',
  fallback: '/models/norka-r35-fallback.glb',
} as const;
type ModelVariant = keyof typeof URLS;
const GPU_COMPRESSED_VARIANTS: ReadonlySet<ModelVariant> = new Set(['desktop', 'mobile', 'mobile-low']);
const COMPRESSED_TEXTURE_EXTENSIONS = [
  'WEBGL_compressed_texture_astc',
  'EXT_texture_compression_bptc',
  'WEBGL_compressed_texture_etc',
  'WEBGL_compressed_texture_etc1',
  'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_pvrtc',
  'WEBKIT_WEBGL_compressed_texture_pvrtc',
] as const;

function supportsGpuCompressedTextures(renderer: THREE.WebGLRenderer): boolean {
  return COMPRESSED_TEXTURE_EXTENSIONS.some((extension) => renderer.extensions.has(extension));
}

function selectRuntimeVariant(renderer: THREE.WebGLRenderer, modelTier: ModelTier): ModelVariant {
  const forced = import.meta.env.VITE_MODEL_VARIANT;
  // Overrides are comparison tools only. In production, capability checks must
  // always win so an accidental environment value cannot ship the 8K original.
  if (import.meta.env.DEV && forced && Object.prototype.hasOwnProperty.call(URLS, forced)) return forced as ModelVariant;
  // On GPUs without any compressed target, use the smaller mobile PNG set for
  // either mobile tier. Desktop retains its existing compatibility fallback.
  if (!supportsGpuCompressedTextures(renderer)) return modelTier === 'desktop' ? 'fallback' : 'mobile-fallback';
  // A texture-size ceiling below the desktop hero maps must override viewport
  // heuristics. Mobile GPUs capped at exactly 4096 also use the lower tier to
  // leave headroom for browser and renderer allocations.
  if (renderer.capabilities.maxTextureSize < 4096) return 'mobile-low';
  if (modelTier !== 'desktop' && renderer.capabilities.maxTextureSize === 4096) return 'mobile-low';
  return modelTier;
}
export interface ModelAttribution { readonly title: string; readonly author: string; readonly license: string; }
export const DEFAULT_MODEL_ATTRIBUTION: ModelAttribution = { title: 'unpacked-norka_varis_r35', author: 'MattDoesBlender', license: 'CC BY-NC-SA 4.0' };
export interface ModelReadyDetails { readonly attribution: ModelAttribution; }
interface Props {
  readonly anisotropy: number;
  readonly driveActive: boolean;
  readonly interactionRig: VehicleInteractionRig;
  readonly manualLightsOn: boolean;
  readonly modelTier: ModelTier;
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly onOpenExteriorDoor: () => void;
  readonly onReady: (details: ModelReadyDetails) => void;
}

const MAX_STEERING_ANGLE = Math.PI * 0.75;
const STEERING_DRAG_RADIANS_PER_VIEWPORT = Math.PI * 1.6;
const WHEEL_LOCAL_AXIS = new THREE.Vector3(1, 0, 0);
const WHEEL_PIVOT_NAMES = [
  'WHEEL_LF_74',
  'WHEEL_LR_85',
  'WHEEL_RF_96',
  'WHEEL_RR_107',
] as const;

interface WheelAssembly {
  readonly pivot: THREE.Object3D;
  readonly restQuaternion: THREE.Quaternion;
}

function createWheelAssemblies(root: THREE.Object3D): readonly WheelAssembly[] | null {
  const matches = new Map<string, THREE.Object3D[]>();
  WHEEL_PIVOT_NAMES.forEach((name) => matches.set(name, []));
  root.traverse((object) => {
    const namedMatches = matches.get(object.name);
    if (namedMatches) namedMatches.push(object);
  });

  const wheels: WheelAssembly[] = [];
  for (const name of WHEEL_PIVOT_NAMES) {
    const namedMatches = matches.get(name) ?? [];
    const pivot = namedMatches[0];
    // Exact names are a build-time contract. Refuse partial animation if a
    // variant is stale, duplicated, or has lost the authored mesh subtree.
    if (namedMatches.length !== 1 || !pivot || pivot.children.length === 0) return null;
    wheels.push({ pivot, restQuaternion: pivot.quaternion.clone() });
  }
  return wheels;
}

interface SteeringDragState {
  readonly pointerId: number;
  readonly radiansPerPixel: number;
  lastClientX: number;
}

const KTX2_LOADERS = new WeakMap<THREE.WebGLRenderer, KTX2Loader>();
const GLTF_CLEAR_TIMERS = new Map<string, number>();
const RESOURCE_DISPOSAL_TIMERS = new WeakMap<object, number>();
let meshoptWorkerCount = 0;

interface RuntimeGLTFLoader {
  setKTX2Loader(value: KTX2Loader): void;
  setMeshoptDecoder(value: typeof MeshoptDecoder): void;
}

function setMeshoptWorkerCount(count: number): void {
  if (meshoptWorkerCount === count) return;
  MeshoptDecoder.useWorkers(count);
  meshoptWorkerCount = count;
}

function configureModelDecoders(
  loader: GLTFLoader,
  renderer: THREE.WebGLRenderer,
  modelVariant: ModelVariant,
  modelTier: ModelTier,
): void {
  const runtimeLoader = loader as unknown as RuntimeGLTFLoader;

  if (GPU_COMPRESSED_VARIANTS.has(modelVariant)) {
    let ktx2Loader = KTX2_LOADERS.get(renderer);
    if (!ktx2Loader) {
      ktx2Loader = new KTX2Loader()
        // One worker avoids a second 16-24 MiB WASM heap. Texture transcoding
        // remains off the main thread while keeping mobile memory predictable.
        .setWorkerLimit(1)
        .detectSupport(renderer);
      KTX2_LOADERS.set(renderer, ktx2Loader);
    }
    runtimeLoader.setKTX2Loader(ktx2Loader);
  }

  // Meshopt is required by every optimized GLB. Async workers prevent hundreds
  // of compressed buffer views from stalling the loading animation/main thread.
  setMeshoptWorkerCount(modelTier === 'desktop' ? 2 : 1);
  runtimeLoader.setMeshoptDecoder(MeshoptDecoder);
}

export function releaseModelDecoders(renderer: THREE.WebGLRenderer): void {
  const ktx2Loader = KTX2_LOADERS.get(renderer);
  if (ktx2Loader) {
    ktx2Loader.dispose();
    KTX2_LOADERS.delete(renderer);
  }
  setMeshoptWorkerCount(0);
}

function cleanMetadataValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value.split(' (')[0]?.trim() || fallback;
}
function readAttribution(json: unknown): ModelAttribution {
  const extras = (json as { asset?: { extras?: Record<string, unknown> } }).asset?.extras;
  if (!extras) return DEFAULT_MODEL_ATTRIBUTION;
  const rawLicense = cleanMetadataValue(extras.license, DEFAULT_MODEL_ATTRIBUTION.license);
  return {
    title: cleanMetadataValue(extras.title, DEFAULT_MODEL_ATTRIBUTION.title),
    author: cleanMetadataValue(extras.author, DEFAULT_MODEL_ATTRIBUTION.author),
    license: rawLicense.replace('CC-BY-NC-SA-4.0', 'CC BY-NC-SA 4.0'),
  };
}

function readEmbeddedReferenceMaps(root: THREE.Object3D): ReferenceMaterialMaps {
  let paint: THREE.Texture | undefined;
  let carbon: THREE.Texture | undefined;
  let carbonNormal: THREE.Texture | undefined;
  let glass: THREE.Texture | undefined;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      if (material.name === 'ext_body' && material.map) paint = material.map;
      if (material.name === 'ext_carbon') {
        if (material.map) carbon = material.map;
        if (material.normalMap) carbonNormal = material.normalMap;
      }
      if (material.name === 'ext_glass' && material.map) glass = material.map;
    });
  });
  if (!paint || !carbon || !carbonNormal || !glass) {
    throw new Error('The GLB is missing one or more embedded NORKA reference textures.');
  }
  return { paint, carbon, carbonNormal, glass };
}

function listMaterialTextures(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture);
}

function isolateSceneMaterials(root: THREE.Object3D): void {
  const materialClones = new Map<THREE.Material, THREE.Material>();
  const textureClones = new Map<THREE.Texture, THREE.Texture>();
  const copyMaterial = (source: THREE.Material): THREE.Material => {
    const cached = materialClones.get(source);
    if (cached) return cached;
    const material = source.clone();
    const writable = material as unknown as Record<string, unknown>;
    Object.entries(writable).forEach(([key, value]) => {
      if (!(value instanceof THREE.Texture)) return;
      let texture = textureClones.get(value);
      if (!texture) {
        texture = value.clone();
        textureClones.set(value, texture);
      }
      writable[key] = texture;
    });
    materialClones.set(source, material);
    return material;
  };
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(copyMaterial)
      : copyMaterial(object.material);
  });
}

export function CarModel({ anisotropy, driveActive, interactionRig, manualLightsOn, modelTier, phase, viewPhase, onOpenExteriorDoor, onReady }: Props) {
  const renderer = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const modelVariant = useMemo(() => selectRuntimeVariant(renderer, modelTier), [modelTier, renderer]);
  const modelUrl = URLS[modelVariant];
  const extendLoader = useCallback((loader: GLTFLoader) => {
    configureModelDecoders(loader, renderer, modelVariant, modelTier);
  }, [modelTier, modelVariant, renderer]);
  // Decoder configuration is explicit above. Keeping both Drei switches false
  // avoids its shared CDN Draco loader and keeps this model's Meshopt worker
  // lifecycle under local control.
  const gltf = useGLTF(modelUrl, false, false, extendLoader);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  // Texture sampling is deliberately fixed for this mounted model. Responsive
  // changes must not invalidate the prepared scene, clone its materials/textures,
  // and schedule the previous owned resources for disposal. A Canvas/model
  // remount will apply the newly measured sampling level.
  const textureAnisotropy = useRef(Math.min(anisotropy, maxAnisotropy));
  const reportedSelection = useRef<string | null>(null);
  const renderedGlassOpacity = useRef(Number.NaN);
  const prepared = useMemo(() => {
    const scene = clone(gltf.scene) as THREE.Group;
    // SkeletonUtils keeps materials and textures shared with useGLTF's cache.
    // Isolate them before applying runtime profiles or per-frame glass fades.
    isolateSceneMaterials(scene);
    const driverDoor = createDriverDoorAssembly(scene);
    const steeringWheel = createSteeringWheelAssembly(scene);
    const wheels = createWheelAssemblies(scene);
    const normalization = computeModelNormalization(scene);
    const referenceMaps = readEmbeddedReferenceMaps(scene);
    applyMaterialAdjustments(
      scene,
      referenceMaps,
      textureAnisotropy.current,
      modelTier !== 'desktop',
    );
    // Resolve and isolate exact semantic lamps only after their final PBR
    // profiles have been applied. Contract drift fails closed with all lights off.
    const vehicleLights = createVehicleLightAssembly(scene);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const glassMaterials: Array<{ readonly material: THREE.MeshStandardMaterial; readonly baseOpacity: number }> = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
        if (materials.has(material)) return;
        materials.add(material);
        if (material instanceof THREE.MeshStandardMaterial && (material.name === 'ext_glass' || material.name === 'black_glass')) {
          glassMaterials.push({ material, baseOpacity: material.opacity });
        }
      });
    });
    const attribution = readAttribution(gltf.parser.json);
    const textures = new Set<THREE.Texture>();
    materials.forEach((material) => listMaterialTextures(material).forEach((texture) => textures.add(texture)));
    const ownedMaterials = new Set(materials);
    vehicleLights?.detachedMaterials.forEach((material) => ownedMaterials.add(material));
    return {
      scene,
      normalization,
      attribution,
      driverDoor,
      steeringWheel,
      wheels,
      glassMaterials,
      vehicleLights,
      ownedGeometries: [...geometries],
      ownedMaterials: [...ownedMaterials],
      ownedTextures: [...textures],
    };
  }, [gltf.parser.json, gltf.scene, modelTier]);
  const steeringInteractive = isInteriorOrbitEnabled(phase, viewPhase);
  const steeringDrag = useRef<SteeringDragState | null>(null);
  const steeringRaycaster = useRef(new THREE.Raycaster());
  const steeringPointer = useRef(new THREE.Vector2());
  const steeringTurnQuaternion = useRef(new THREE.Quaternion());
  const wheelTurnQuaternion = useRef(new THREE.Quaternion());
  useEffect(() => {
    const canvas = renderer.domElement;
    const ownerDocument = canvas.ownerDocument;

    const finishDrag = (pointerId?: number): void => {
      const drag = steeringDrag.current;
      if (!drag || (pointerId !== undefined && pointerId !== drag.pointerId)) return;
      steeringDrag.current = null;
      if (canvas.hasPointerCapture?.(drag.pointerId)) {
        canvas.releasePointerCapture(drag.pointerId);
      }
      canvas.style.removeProperty('cursor');
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (steeringDrag.current) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (!steeringInteractive) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const steeringWheel = prepared.steeringWheel;
      if (!steeringWheel) return;

      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      steeringPointer.current.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      camera.updateMatrixWorld();
      steeringWheel.pivot.updateWorldMatrix(true, true);
      steeringRaycaster.current.setFromCamera(steeringPointer.current, camera);
      if (steeringRaycaster.current.intersectObject(steeringWheel.pivot, true).length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      steeringDrag.current = {
        pointerId: event.pointerId,
        radiansPerPixel: STEERING_DRAG_RADIANS_PER_VIEWPORT
          / THREE.MathUtils.clamp(Math.min(bounds.width, bounds.height), 320, 900),
        lastClientX: event.clientX,
      };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const drag = steeringDrag.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.lastClientX;
      drag.lastClientX = event.clientX;
      if (Math.abs(deltaX) < 0.01) return;
      interactionRig.steeringAngle = THREE.MathUtils.clamp(
        interactionRig.steeringAngle + deltaX * drag.radiansPerPixel,
        -MAX_STEERING_ANGLE,
        MAX_STEERING_ANGLE,
      );
      invalidate();
    };

    const handlePointerEnd = (event: PointerEvent): void => {
      const drag = steeringDrag.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.pointerId !== drag.pointerId) return;
      finishDrag(event.pointerId);
    };
    const handleLostPointerCapture = (event: PointerEvent): void => finishDrag(event.pointerId);
    const handleWindowBlur = (): void => finishDrag();
    const handleVisibilityChange = (): void => {
      if (ownerDocument.visibilityState === 'hidden') finishDrag();
    };
    const handleOrientationChange = (): void => finishDrag();

    canvas.addEventListener('pointerdown', handlePointerDown, true);
    canvas.addEventListener('pointermove', handlePointerMove, true);
    canvas.addEventListener('pointerup', handlePointerEnd, true);
    canvas.addEventListener('pointercancel', handlePointerEnd, true);
    canvas.addEventListener('lostpointercapture', handleLostPointerCapture, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('orientationchange', handleOrientationChange);
    ownerDocument.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      finishDrag();
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      canvas.removeEventListener('pointermove', handlePointerMove, true);
      canvas.removeEventListener('pointerup', handlePointerEnd, true);
      canvas.removeEventListener('pointercancel', handlePointerEnd, true);
      canvas.removeEventListener('lostpointercapture', handleLostPointerCapture, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('orientationchange', handleOrientationChange);
      ownerDocument.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [camera, interactionRig, invalidate, prepared.steeringWheel, renderer, steeringInteractive]);
  useLayoutEffect(() => {
    // useGLTF resolves only after textures and geometry have finished decoding,
    // so worker pools can be released without affecting the resident model.
    releaseModelDecoders(renderer);
  }, [gltf, renderer]);
  useEffect(() => {
    const root = document.documentElement;
    const pendingClear = GLTF_CLEAR_TIMERS.get(modelUrl);
    if (pendingClear !== undefined) {
      window.clearTimeout(pendingClear);
      GLTF_CLEAR_TIMERS.delete(modelUrl);
    }
    root.dataset.modelVariant = modelVariant;
    root.dataset.textureCompression = GPU_COMPRESSED_VARIANTS.has(modelVariant)
      ? 'gpu-compressed'
      : modelVariant === 'mobile-fallback' ? 'png-mobile-fallback'
      : modelVariant === 'fallback' ? 'png-fallback' : 'png-original';
    return () => {
      if (root.dataset.modelVariant === modelVariant) {
        delete root.dataset.modelVariant;
        delete root.dataset.textureCompression;
      }
      // Defer cache eviction by one task. React StrictMode immediately sets
      // the same effect up again and cancels this timer, while a real variant
      // change releases the previous GLB's CPU buffers after GPU cleanup.
      const timer = window.setTimeout(() => {
        useGLTF.clear(modelUrl);
        GLTF_CLEAR_TIMERS.delete(modelUrl);
      }, 0);
      GLTF_CLEAR_TIMERS.set(modelUrl, timer);
    };
  }, [modelUrl, modelVariant]);
  useEffect(() => {
    renderedGlassOpacity.current = Number.NaN;
    const pendingDisposal = RESOURCE_DISPOSAL_TIMERS.get(prepared);
    if (pendingDisposal !== undefined) {
      window.clearTimeout(pendingDisposal);
      RESOURCE_DISPOSAL_TIMERS.delete(prepared);
    }
    return () => {
      const timer = window.setTimeout(() => {
        prepared.vehicleLights?.dispose();
        prepared.ownedGeometries.forEach((geometry) => geometry.dispose());
        prepared.ownedMaterials.forEach((material) => material.dispose());
        prepared.ownedTextures.forEach((texture) => texture.dispose());
        RESOURCE_DISPOSAL_TIMERS.delete(prepared);
      }, 0);
      RESOURCE_DISPOSAL_TIMERS.set(prepared, timer);
    };
  }, [prepared]);
  useEffect(() => {
    const wheels = prepared.wheels;
    return () => {
      wheels?.forEach(({ pivot, restQuaternion }) => {
        pivot.quaternion.copy(restQuaternion);
      });
    };
  }, [prepared.wheels]);
  useEffect(() => invalidate(), [invalidate, manualLightsOn]);
  useFrame(() => {
    if (prepared.driverDoor) {
      prepared.driverDoor.pivot.rotation.y = DRIVER_DOOR_OPEN_ANGLE * THREE.MathUtils.clamp(interactionRig.doorProgress, 0, 1);
    }
    if (prepared.steeringWheel) {
      steeringTurnQuaternion.current.setFromAxisAngle(
        STEERING_WHEEL_LOCAL_AXIS,
        interactionRig.steeringAngle,
      );
      prepared.steeringWheel.pivot.quaternion
        .copy(prepared.steeringWheel.restQuaternion)
        .multiply(steeringTurnQuaternion.current);
    }
    if (prepared.wheels) {
      wheelTurnQuaternion.current.setFromAxisAngle(WHEEL_LOCAL_AXIS, interactionRig.wheelRotation);
      prepared.wheels.forEach(({ pivot, restQuaternion }) => {
        pivot.quaternion
          .copy(restQuaternion)
          .multiply(wheelTurnQuaternion.current);
      });
    }
    const opacity = THREE.MathUtils.clamp(storyVisualState.glassOpacity * interactionRig.glassOpacity, 0, 1);
    if (!(Math.abs(renderedGlassOpacity.current - opacity) < 0.001)) {
      renderedGlassOpacity.current = opacity;
      prepared.glassMaterials.forEach(({ material, baseOpacity }) => {
        material.opacity = baseOpacity * opacity;
      });
    }
    prepared.vehicleLights?.render(resolveVehicleLightBlend(interactionRig.driveLightBlend, manualLightsOn));
  });
  useLayoutEffect(() => {
    const selection = modelVariant + ':' + modelTier;
    if (reportedSelection.current === selection) return;
    reportedSelection.current = selection;
    onReady({ attribution: prepared.attribution });
  }, [modelTier, modelVariant, onReady, prepared]);
  return (
    <group position={prepared.normalization.offset}>
      <primitive object={prepared.scene} dispose={null} />
      {prepared.vehicleLights ? <primitive object={prepared.vehicleLights.spotRig} dispose={null} /> : null}
      {prepared.vehicleLights
        ? <VehicleLightEffects headlightAnchors={prepared.vehicleLights.headlightAnchors} interactionRig={interactionRig} manualLightsOn={manualLightsOn} mobileOptimized={modelTier !== 'desktop'} />
        : null}
      <DoorHotspot
        available={Boolean(prepared.driverDoor) && !driveActive}
        phase={phase}
        viewPhase={viewPhase}
        onActivate={onOpenExteriorDoor}
      />
    </group>
  );
}

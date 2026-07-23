import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { GLTFLoader } from 'three-stdlib';
import { applyMaterialAdjustments, type ReferenceMaterialMaps } from './materialAdjustments';
import { DoorHotspot } from './DoorHotspot';
import { createDriverDoorAssembly } from './doorAssembly';
import type { ExplorePhase, ExploreViewPhase } from './experienceTypes';
import { DRIVER_DOOR_OPEN_ANGLE } from './interiorTransitionShots';
import { computeModelNormalization, type ModelNormalization } from './modelNormalization';
import { storyVisualState } from './storyState';
import type { ModelTier } from './deviceProfile';
import type { VehicleInteractionRig } from './VehicleInteractionRig';

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
export interface ModelReadyDetails { readonly normalization: ModelNormalization; readonly nodeCount: number; readonly meshCount: number; readonly materialCount: number; readonly attribution: ModelAttribution; }
interface Props {
  readonly anisotropy: number;
  readonly interactionRig: VehicleInteractionRig;
  readonly modelTier: ModelTier;
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly onOpenExteriorDoor: () => void;
  readonly onReady: (details: ModelReadyDetails) => void;
}

const KTX2_LOADERS = new WeakMap<THREE.WebGLRenderer, KTX2Loader>();
const GLTF_CLEAR_TIMERS = new Map<string, number>();
const RESOURCE_DISPOSAL_TIMERS = new WeakMap<object, number>();
function configureKTX2Loader(loader: GLTFLoader, renderer: THREE.WebGLRenderer): void {
  let ktx2Loader = KTX2_LOADERS.get(renderer);
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader()
      // One worker avoids a second 16-24 MiB WASM heap. The model is loaded
      // once, so the small transcode-time tradeoff is preferable on phones.
      .setWorkerLimit(1)
      .detectSupport(renderer);
    KTX2_LOADERS.set(renderer, ktx2Loader);
  }
  // Drei currently exposes GLTFLoader through three-stdlib's older declaration,
  // while the runtime loader is Three's current implementation.
  (loader as unknown as { setKTX2Loader(value: KTX2Loader): void }).setKTX2Loader(ktx2Loader);
}

export function releaseKTX2Loader(renderer: THREE.WebGLRenderer): void {
  const loader = KTX2_LOADERS.get(renderer);
  if (!loader) return;
  loader.dispose();
  KTX2_LOADERS.delete(renderer);
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

export function CarModel({ anisotropy, interactionRig, modelTier, phase, viewPhase, onOpenExteriorDoor, onReady }: Props) {
  const renderer = useThree((state) => state.gl);
  const modelVariant = useMemo(() => selectRuntimeVariant(renderer, modelTier), [modelTier, renderer]);
  const modelUrl = URLS[modelVariant];
  const extendLoader = useCallback((loader: GLTFLoader) => {
    if (GPU_COMPRESSED_VARIANTS.has(modelVariant)) configureKTX2Loader(loader, renderer);
  }, [modelVariant, renderer]);
  const gltf = useGLTF(modelUrl, false, true, extendLoader);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const reportedSelection = useRef<string | null>(null);
  const renderedGlassOpacity = useRef(Number.NaN);
  const prepared = useMemo(() => {
    const scene = clone(gltf.scene) as THREE.Group;
    // SkeletonUtils keeps materials and textures shared with useGLTF's cache.
    // Isolate them before applying runtime profiles or per-frame glass fades.
    isolateSceneMaterials(scene);
    const driverDoor = createDriverDoorAssembly(scene);
    const normalization = computeModelNormalization(scene);
    const referenceMaps = readEmbeddedReferenceMaps(scene);
    applyMaterialAdjustments(
      scene,
      referenceMaps,
      Math.min(anisotropy, maxAnisotropy),
      modelTier !== 'desktop',
    );
    let nodeCount = 0;
    let meshCount = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const glassMaterials: Array<{ readonly material: THREE.MeshStandardMaterial; readonly baseOpacity: number }> = [];
    scene.traverse((object) => {
      nodeCount += 1;
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
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
    return {
      scene,
      normalization,
      nodeCount,
      meshCount,
      materialCount: materials.size,
      attribution,
      driverDoor,
      glassMaterials,
      ownedGeometries: [...geometries],
      ownedMaterials: [...materials],
      ownedTextures: [...textures],
    };
  }, [anisotropy, gltf.parser.json, gltf.scene, maxAnisotropy, modelTier]);
  useLayoutEffect(() => {
    // useGLTF resolves only after every embedded texture has finished loading,
    // so the transcoder pool is no longer needed here.
    releaseKTX2Loader(renderer);
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
        prepared.ownedGeometries.forEach((geometry) => geometry.dispose());
        prepared.ownedMaterials.forEach((material) => material.dispose());
        prepared.ownedTextures.forEach((texture) => texture.dispose());
        RESOURCE_DISPOSAL_TIMERS.delete(prepared);
      }, 0);
      RESOURCE_DISPOSAL_TIMERS.set(prepared, timer);
    };
  }, [prepared]);
  useFrame(() => {
    if (prepared.driverDoor) {
      prepared.driverDoor.pivot.rotation.y = DRIVER_DOOR_OPEN_ANGLE * THREE.MathUtils.clamp(interactionRig.doorProgress, 0, 1);
    }
    const opacity = THREE.MathUtils.clamp(storyVisualState.glassOpacity * interactionRig.glassOpacity, 0, 1);
    if (Math.abs(renderedGlassOpacity.current - opacity) < 0.001) return;
    renderedGlassOpacity.current = opacity;
    prepared.glassMaterials.forEach(({ material, baseOpacity }) => {
      material.opacity = baseOpacity * opacity;
    });
  });
  useLayoutEffect(() => {
    const selection = modelVariant + ':' + modelTier;
    if (reportedSelection.current === selection) return;
    reportedSelection.current = selection;
    onReady({ normalization: prepared.normalization, nodeCount: prepared.nodeCount, meshCount: prepared.meshCount, materialCount: prepared.materialCount, attribution: prepared.attribution });
  }, [modelTier, modelVariant, onReady, prepared]);
  return (
    <group position={prepared.normalization.offset}>
      <primitive object={prepared.scene} dispose={null} />
      <DoorHotspot
        available={Boolean(prepared.driverDoor)}
        phase={phase}
        viewPhase={viewPhase}
        onActivate={onOpenExteriorDoor}
      />
    </group>
  );
}

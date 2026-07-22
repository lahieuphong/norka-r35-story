import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { KTX2Loader, type GLTFLoader } from 'three-stdlib';
import { shouldUseMobileModel } from './deviceProfile';
import { applyMaterialAdjustments, type ReferenceMaterialMaps } from './materialAdjustments';
import { computeModelNormalization, type ModelNormalization } from './modelNormalization';
import { storyVisualState } from './storyState';

const URLS = { original: '/models/norka-r35-original.glb', desktop: '/models/norka-r35-desktop.glb', mobile: '/models/norka-r35-mobile.glb' } as const;
type ModelVariant = keyof typeof URLS;
const COMPRESSED_TEXTURE_EXTENSIONS = [
  'WEBGL_compressed_texture_astc',
  'EXT_texture_compression_bptc',
  'WEBGL_compressed_texture_etc',
  'WEBGL_compressed_texture_etc1',
  'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_pvrtc',
] as const;

function supportsGpuCompressedTextures(renderer: THREE.WebGLRenderer): boolean {
  return COMPRESSED_TEXTURE_EXTENSIONS.some((extension) => renderer.extensions.has(extension));
}

function selectRuntimeVariant(renderer: THREE.WebGLRenderer): ModelVariant {
  const forced = import.meta.env.VITE_MODEL_VARIANT;
  // Overrides are comparison tools only. In production, capability checks must
  // always win so an accidental environment value cannot ship the 8K original.
  if (import.meta.env.DEV && (forced === 'original' || forced === 'desktop' || forced === 'mobile')) return forced;
  if (shouldUseMobileModel()) return 'mobile';
  if (renderer.capabilities.maxTextureSize < 4096) return 'mobile';
  return supportsGpuCompressedTextures(renderer) ? 'desktop' : 'mobile';
}
export interface ModelAttribution { readonly title: string; readonly author: string; readonly license: string; }
export const DEFAULT_MODEL_ATTRIBUTION: ModelAttribution = { title: 'unpacked-norka_varis_r35', author: 'MattDoesBlender', license: 'CC BY-NC-SA 4.0' };
export interface ModelReadyDetails { readonly normalization: ModelNormalization; readonly nodeCount: number; readonly meshCount: number; readonly materialCount: number; readonly attribution: ModelAttribution; }
interface Props {
  readonly anisotropy: number;
  readonly onReady: (details: ModelReadyDetails) => void;
}

const KTX2_LOADERS = new WeakMap<THREE.WebGLRenderer, KTX2Loader>();
function configureKTX2Loader(loader: GLTFLoader, renderer: THREE.WebGLRenderer): void {
  let ktx2Loader = KTX2_LOADERS.get(renderer);
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader()
      .setTranscoderPath('/basis/')
      .setWorkerLimit(2)
      .detectSupport(renderer);
    KTX2_LOADERS.set(renderer, ktx2Loader);
  }
  loader.setKTX2Loader(ktx2Loader);
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

export function CarModel({ anisotropy, onReady }: Props) {
  const renderer = useThree((state) => state.gl);
  const modelVariant = useMemo(() => selectRuntimeVariant(renderer), [renderer]);
  const gltf = useGLTF(URLS[modelVariant], false, true, (loader) => configureKTX2Loader(loader, renderer));
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const reported = useRef(false);
  const renderedGlassOpacity = useRef(Number.NaN);
  const prepared = useMemo(() => {
    const scene = clone(gltf.scene) as THREE.Group;
    // SkeletonUtils keeps materials and textures shared with useGLTF's cache.
    // Isolate them before applying runtime profiles or per-frame glass fades.
    isolateSceneMaterials(scene);
    const normalization = computeModelNormalization(scene);
    const referenceMaps = readEmbeddedReferenceMaps(scene);
    applyMaterialAdjustments(scene, referenceMaps, Math.min(anisotropy, maxAnisotropy));
    let nodeCount = 0;
    let meshCount = 0;
    const materials = new Set<THREE.Material>();
    const glassMaterials: Array<{ readonly material: THREE.MeshStandardMaterial; readonly baseOpacity: number }> = [];
    scene.traverse((object) => {
      nodeCount += 1;
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
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
      glassMaterials,
      ownedMaterials: [...materials],
      ownedTextures: [...textures],
    };
  }, [anisotropy, gltf.parser.json, gltf.scene, maxAnisotropy]);
  useEffect(() => {
    renderedGlassOpacity.current = Number.NaN;
    return () => {
      prepared.ownedMaterials.forEach((material) => material.dispose());
      prepared.ownedTextures.forEach((texture) => texture.dispose());
    };
  }, [prepared]);
  useFrame(() => {
    const opacity = THREE.MathUtils.clamp(storyVisualState.glassOpacity, 0, 1);
    if (Math.abs(renderedGlassOpacity.current - opacity) < 0.001) return;
    renderedGlassOpacity.current = opacity;
    prepared.glassMaterials.forEach(({ material, baseOpacity }) => {
      material.opacity = baseOpacity * opacity;
    });
  });
  useLayoutEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onReady({ normalization: prepared.normalization, nodeCount: prepared.nodeCount, meshCount: prepared.meshCount, materialCount: prepared.materialCount, attribution: prepared.attribution });
  }, [onReady, prepared]);
  return <group position={prepared.normalization.offset}><primitive object={prepared.scene} dispose={null} /></group>;
}

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { applyMaterialAdjustments } from './materialAdjustments';
import { computeModelNormalization, type ModelNormalization } from './modelNormalization';

const URLS = { original: '/models/norka-r35-original.glb', desktop: '/models/norka-r35-desktop.glb', mobile: '/models/norka-r35-mobile.glb' } as const;
const REFERENCE_TEXTURE_URLS = {
  paint: '/textures/norka-paint-reference.png',
  carbon: '/textures/norka-carbon-base.png',
  carbonNormal: '/textures/norka-carbon-normal.png',
  glass: '/textures/norka-glass-reference.png',
} as const;
export const RUNTIME_MODEL_URL = URLS[import.meta.env.VITE_MODEL_VARIANT ?? 'desktop'];
export interface ModelAttribution { readonly title: string; readonly author: string; readonly license: string; }
export const DEFAULT_MODEL_ATTRIBUTION: ModelAttribution = { title: 'unpacked-norka_varis_r35', author: 'MattDoesBlender', license: 'CC BY-NC-SA 4.0' };
export interface ModelReadyDetails { readonly normalization: ModelNormalization; readonly nodeCount: number; readonly meshCount: number; readonly materialCount: number; readonly attribution: ModelAttribution; }
interface Props { readonly onReady: (details: ModelReadyDetails) => void; }

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

function prepareReferenceTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace): void {
  texture.flipY = false;
  texture.colorSpace = colorSpace;
  texture.channel = 0;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
}

export function CarModel({ onReady }: Props) {
  const gltf = useGLTF(RUNTIME_MODEL_URL, true, true);
  const referenceMaps = useTexture(REFERENCE_TEXTURE_URLS);
  const reported = useRef(false);
  const prepared = useMemo(() => {
    prepareReferenceTexture(referenceMaps.paint, THREE.SRGBColorSpace);
    prepareReferenceTexture(referenceMaps.carbon, THREE.SRGBColorSpace);
    prepareReferenceTexture(referenceMaps.carbonNormal, THREE.NoColorSpace);
    prepareReferenceTexture(referenceMaps.glass, THREE.SRGBColorSpace);

    const scene = clone(gltf.scene) as THREE.Group;
    const normalization = computeModelNormalization(scene);
    applyMaterialAdjustments(scene, referenceMaps);
    let nodeCount = 0;
    let meshCount = 0;
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      nodeCount += 1;
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
    });
    const attribution = readAttribution(gltf.parser.json);
    return { scene, normalization, nodeCount, meshCount, materialCount: materials.size, attribution };
  }, [gltf.scene, referenceMaps]);
  useLayoutEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onReady({ normalization: prepared.normalization, nodeCount: prepared.nodeCount, meshCount: prepared.meshCount, materialCount: prepared.materialCount, attribution: prepared.attribution });
  }, [onReady, prepared]);
  return <group position={prepared.normalization.offset}><primitive object={prepared.scene} dispose={null} /></group>;
}
useGLTF.preload(RUNTIME_MODEL_URL, true, true);
useTexture.preload(Object.values(REFERENCE_TEXTURE_URLS));

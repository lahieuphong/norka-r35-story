import * as THREE from 'three';
const PATCHABLE = new Set(['ext_body', 'ext_carbon', 'ext_glass', 'ext_chrome', 'tiresss', 'caliperrs']);
export function applyMaterialAdjustments(root: THREE.Object3D): void {
  const visited = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (visited.has(material) || !PATCHABLE.has(material.name)) return;
      visited.add(material);
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.name === 'ext_body') {
          material.metalness = 0.7;
          material.roughness = 0.22;
          material.envMapIntensity = 1.2;
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.clearcoat = 1;
            material.clearcoatRoughness = 0.07;
            material.specularIntensity = 1;
          }
        }
        if (material.name === 'ext_carbon') {
          material.roughness = 0.34;
          material.envMapIntensity = 1;
        }
        if (material.name === 'ext_chrome') material.envMapIntensity = 1.2;
        if (material.name === 'tiresss') material.envMapIntensity = 0.45;
        if (material.name === 'caliperrs') material.envMapIntensity = 0.8;
        if (material.name === 'ext_glass') {
          material.transparent = true;
          material.envMapIntensity = 0.9;
        }
      }
      material.needsUpdate = true;
    });
  });
}

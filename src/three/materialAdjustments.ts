import * as THREE from 'three';
const PATCHABLE = new Set([
  'ext_body',
  'ext_carbon',
  'ext_glass',
  'ext_chrome',
  'tiresss',
  'caliperrs',
  'INT_Decals_EMISSIVE',
  'INT_Decals_EMISSIVE_Ref',
  'INT_Decals_Display',
  'INT_Cockpit_OCC_Carbon',
  'INT_Cockpit_OCC_Alu',
  'INT_Cockpit_OCC_METAL_black',
]);
const SHADOWLESS_GLASS = new Set(['ext_glass', 'INT_Glass_DISPLAY', 'INT_Display_Glass']);
const INTERIOR_EMISSIVE_INTENSITY: Readonly<Partial<Record<string, number>>> = {
  INT_Decals_EMISSIVE: 0.55,
  INT_Decals_EMISSIVE_Ref: 0.4,
  INT_Decals_Display: 0.3,
};
export function applyMaterialAdjustments(root: THREE.Object3D): void {
  const visited = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => SHADOWLESS_GLASS.has(material.name))) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
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
        if (material.name === 'INT_Cockpit_OCC_Carbon') {
          material.roughness = 0.32;
          material.envMapIntensity = 1;
        }
        if (material.name === 'INT_Cockpit_OCC_Alu') {
          material.roughness = 0.28;
          material.envMapIntensity = 1;
        }
        if (material.name === 'INT_Cockpit_OCC_METAL_black') {
          material.roughness = 0.36;
          material.envMapIntensity = 1;
        }
        if (material.name === 'ext_chrome') material.envMapIntensity = 1.2;
        if (material.name === 'tiresss') material.envMapIntensity = 0.45;
        if (material.name === 'caliperrs') material.envMapIntensity = 0.8;
        if (material.name === 'ext_glass') {
          material.transparent = true;
          material.depthWrite = false;
          material.envMapIntensity = 0.9;
        }
        const emissiveIntensity = INTERIOR_EMISSIVE_INTENSITY[material.name];
        if (emissiveIntensity !== undefined) {
          material.emissiveMap = material.map;
          material.emissive.set('#ffffff');
          material.emissiveIntensity = emissiveIntensity;
        }
      }
      material.needsUpdate = true;
    });
  });
}

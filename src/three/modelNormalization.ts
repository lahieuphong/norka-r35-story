import * as THREE from 'three';
export interface ModelNormalization { readonly box: THREE.Box3; readonly size: THREE.Vector3; readonly center: THREE.Vector3; readonly offset: THREE.Vector3; }
export function computeModelNormalization(object: THREE.Object3D): ModelNormalization {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) throw new Error('The loaded GLB does not contain measurable geometry.');
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  return { box, size, center, offset };
}

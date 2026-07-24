import * as THREE from 'three';

export const STEERING_WHEEL_LOCAL_AXIS = new THREE.Vector3(0, 1, 0);

export interface SteeringWheelAssembly {
  readonly pivot: THREE.Object3D;
  readonly restQuaternion: THREE.Quaternion;
}

/**
 * The authored pivot already sits at the center of the wheel and owns every
 * trim, decal and seam beneath it. Mobile builds preserve this subtree so the
 * same local-Y rotation works for every model tier.
 */
export function createSteeringWheelAssembly(scene: THREE.Group): SteeringWheelAssembly | null {
  const pivot = scene.getObjectByName('STEER_HR_232');
  if (!pivot) return null;
  return { pivot, restQuaternion: pivot.quaternion.clone() };
}

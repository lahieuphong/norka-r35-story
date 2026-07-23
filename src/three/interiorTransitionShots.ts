import type { CameraShot, VectorTuple } from './cameraShots';

export interface InteriorTransitionSet {
  readonly approach: CameraShot;
  readonly doorway: CameraShot;
  readonly cockpit: CameraShot;
}

/** Coordinates before CarModel's normalization offset is applied. */
export const DRIVER_DOOR_HINGE: VectorTuple = [0.84733, 0.392, 0.67679];
export const DRIVER_DOOR_HOTSPOT: VectorTuple = [0.94, 0.74, -0.4];
export const DRIVER_DOOR_OPEN_ANGLE = -Math.PI * 0.38;

const desktopInteriorTransition: InteriorTransitionSet = {
  approach: { position: [2.08, 1.16, 0.32], target: [0.77, 0.64, 0.04], fov: 47 },
  doorway: { position: [1.12, 1.04, 0.2], target: [0.42, 0.73, 0.13], fov: 54 },
  cockpit: { position: [0.38, 1.06, -0.12], target: [0.35, 0.76, 0.76], fov: 62 },
};

const compactInteriorTransition: InteriorTransitionSet = {
  approach: { position: [2.5, 1.34, 0.5], target: [0.72, 0.61, 0.04], fov: 59 },
  doorway: { position: [1.23, 1.1, 0.24], target: [0.4, 0.71, 0.12], fov: 65 },
  cockpit: { position: [0.38, 1.06, -0.16], target: [0.34, 0.62, 0.58], fov: 70 },
};

const shortLandscapeInteriorTransition: InteriorTransitionSet = {
  approach: { position: [2.18, 1.13, 0.36], target: [0.75, 0.62, 0.04], fov: 50 },
  doorway: { position: [1.12, 1.03, 0.2], target: [0.42, 0.72, 0.13], fov: 57 },
  cockpit: { position: [0.38, 1.04, -0.1], target: [0.35, 0.74, 0.76], fov: 65 },
};

export function getInteriorTransitionSet(compact: boolean, landscape: boolean): InteriorTransitionSet {
  return compact ? compactInteriorTransition : landscape ? shortLandscapeInteriorTransition : desktopInteriorTransition;
}

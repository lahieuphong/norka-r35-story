export const STORY_SHOT_ORDER = ['hero', 'aerodynamics', 'performance', 'precision', 'interior', 'explore'] as const;
export type ShotName = (typeof STORY_SHOT_ORDER)[number];
export type VectorTuple = readonly [number, number, number];
export interface CameraShot { readonly position: VectorTuple; readonly target: VectorTuple; readonly fov: number; }
export type CameraShotSet = Readonly<Record<ShotName, CameraShot>>;
export type CameraWaypointSet = Readonly<Record<Exclude<ShotName, 'hero'>, VectorTuple>>;

export const desktopShots: CameraShotSet = {
  hero: { position: [-7.15, 1.72, 7.45], target: [-2.45, 0.47, 0.68], fov: 31.5 },
  aerodynamics: { position: [9.1, 1.3, -0.75], target: [0, 0.42, -1.1], fov: 32 },
  performance: { position: [1.4, 4.9, 6.5], target: [-0.9, 0.55, 1.3], fov: 30 },
  precision: { position: [-3.4, 1.25, 5.3], target: [0.35, 0.45, 2.05], fov: 29 },
  interior: { position: [-0.24, 1.08, -0.72], target: [0.5, 0.82, 0.24], fov: 58 },
  explore: { position: [3.2, 1.9, 7.3], target: [-1.4, 0.5, 1.25], fov: 36.5 },
};

export const mobileShots: CameraShotSet = {
  hero: { position: [-7.3, 2.15, 8.95], target: [-0.3, 0.15, 0.5], fov: 53 },
  aerodynamics: { position: [16.5, 1.9, 0.55], target: [0, 0.38, 0.05], fov: 50 },
  performance: { position: [4.15, 7.1, 9.35], target: [0.15, 0.12, 0.85], fov: 53 },
  precision: { position: [-6.8, 1.7, 7.2], target: [-0.5, 0.18, 1.4], fov: 49 },
  interior: { position: [-0.18, 1.05, -0.84], target: [0.3, 0.7, 0.24], fov: 66 },
  explore: { position: [8.5, 2.4, 9.8], target: [0, 0.1, 0], fov: 54 },
};

export const desktopWaypoints: CameraWaypointSet = {
  aerodynamics: [-0.9, 1.58, 6.3],
  performance: [4.15, 2.75, 2.05],
  precision: [-0.1, 2.35, 4.15],
  interior: [-1.12, 1.1, -0.05],
  explore: [-1.12, 1.1, -0.05],
};

export const mobileWaypoints: CameraWaypointSet = {
  aerodynamics: [-1.15, 1.9, 8.0],
  performance: [5.45, 3.2, 3.0],
  precision: [-0.1, 3.0, 5.75],
  interior: [-1.3, 1.16, 0.02],
  explore: [-1.3, 1.16, 0.02],
};

export function getShotSet(isMobile: boolean): CameraShotSet { return isMobile ? mobileShots : desktopShots; }
export function getWaypointSet(isMobile: boolean): CameraWaypointSet { return isMobile ? mobileWaypoints : desktopWaypoints; }

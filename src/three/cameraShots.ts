export const STORY_SHOT_ORDER = ['explore', 'performance', 'aerodynamics', 'rear-signature', 'precision', 'interior', 'steering', 'instruments', 'front-seats', 'rear-seats', 'rear-seat-detail', 'hero'] as const;
export type ShotName = (typeof STORY_SHOT_ORDER)[number];
export const INITIAL_STORY_SHOT = STORY_SHOT_ORDER[0];
export type VectorTuple = readonly [number, number, number];
export interface CameraShot { readonly position: VectorTuple; readonly target: VectorTuple; readonly fov: number; }
export type CameraShotSet = Readonly<Record<ShotName, CameraShot>>;
export type CameraWaypointSet = Readonly<Record<Exclude<ShotName, typeof INITIAL_STORY_SHOT>, VectorTuple>>;

export const desktopShots: CameraShotSet = {
  hero: { position: [-7.15, 1.72, 7.45], target: [-2.45, 0.47, 0.68], fov: 31.5 },
  performance: { position: [1.4, 4.9, 6.5], target: [-0.9, 0.55, 1.3], fov: 30 },
  aerodynamics: { position: [9.1, 1.3, -0.75], target: [0, 0.42, -1.1], fov: 32 },
  'rear-signature': { position: [-0.85, 0.78, -7.35], target: [-0.85, 0.58, -2.15], fov: 33 },
  precision: { position: [-5.65, 0.61, -5.82], target: [0.45, 0.36, -1.9], fov: 44 },
  interior: { position: [-0.24, 1.08, -0.72], target: [0.48, 0.82, 0.24], fov: 58 },
  steering: { position: [-0.1, 0.98, -0.18], target: [0.5, 0.82, 0.2], fov: 46 },
  instruments: { position: [0.58, 1.05, -0.29], target: [0.1, 0.74, 0.47], fov: 41 },
  'front-seats': { position: [-0.2, 1, 0.24], target: [0.18, 0.58, -0.4], fov: 68 },
  'rear-seats': { position: [0, 0.92, -0.3], target: [0, 0.6, -1.18], fov: 65 },
  'rear-seat-detail': { position: [0, 1.08, -0.46], target: [0, 0.48, -0.86], fov: 62 },
  explore: { position: [3.2, 1.9, 7.3], target: [-1.4, 0.5, 1.25], fov: 36.5 },
};

export const mobileShots: CameraShotSet = {
  hero: { position: [-7.3, 2.15, 8.95], target: [-0.3, 2.4, 0.5], fov: 53 },
  performance: { position: [4.15, 7.1, 9.35], target: [0.15, 0.12, 0.85], fov: 53 },
  aerodynamics: { position: [16.5, 1.9, 0.55], target: [0, 0.38, 0.05], fov: 50 },
  'rear-signature': { position: [0, 0.72, -8.15], target: [0, 0.15, -2.15], fov: 52 },
  precision: { position: [-5.78, 0.61, -6], target: [-0.65, 0.35, -1.1], fov: 64 },
  interior: { position: [-0.18, 1.05, -0.84], target: [0.3, 0.7, 0.24], fov: 66 },
  steering: { position: [-0.12, 0.98, -0.25], target: [0.3, 0.64, 0.2], fov: 60 },
  instruments: { position: [0.62, 1.04, -0.36], target: [0.14, 0.56, 0.47], fov: 65 },
  'front-seats': { position: [-0.2, 1, 0.24], target: [0.1, 0.5, -0.4], fov: 78 },
  'rear-seats': { position: [0, 0.9, -0.28], target: [-0.12, 0.52, -1.18], fov: 78 },
  'rear-seat-detail': { position: [0, 1.08, -0.5], target: [0, 0.46, -0.86], fov: 88 },
  explore: { position: [8.5, 2.4, 9.8], target: [0, 0.1, 0], fov: 54 },
};

// Short landscape screens need fuller rear and wheel-detail views than wide
// desktop layouts, while the remaining shots retain the desktop framing.
export const landscapeShots: CameraShotSet = {
  ...desktopShots,
  'rear-signature': { position: [-1.4, 0.66, -6.4], target: [-1.4, 0.62, -2], fov: 31 },
  precision: { position: [-5.65, 0.61, -5.82], target: [0.45, 0.36, -1.9], fov: 34 },
};

export const desktopWaypoints: CameraWaypointSet = {
  performance: [2.75, 3.6, 7.9],
  aerodynamics: [4.5, 3.5, 5.8],
  'rear-signature': [8.5, 2.8, -7],
  precision: [-3.15, 1, -6.55],
  interior: [-0.24, 1.4, -2.6],
  steering: [-0.05, 1.05, -0.45],
  instruments: [0.28, 1.1, -0.2],
  'front-seats': [-0.3, 0.94, 0.08],
  'rear-seats': [0, 1.02, -0.05],
  'rear-seat-detail': [0, 1.04, -0.36],
  hero: [-0.24, 1.4, -2.6],
};

export const mobileWaypoints: CameraWaypointSet = {
  performance: [6.6, 4.75, 10.2],
  aerodynamics: [10.4, 5.1, 7.3],
  'rear-signature': [8, 3.5, -10.5],
  precision: [-4.2, 1.3, -8],
  interior: [-0.18, 1.45, -2.6],
  steering: [-0.05, 1.05, -0.45],
  instruments: [0.28, 1.09, -0.22],
  'front-seats': [-0.3, 0.94, 0.08],
  'rear-seats': [0, 1, -0.04],
  'rear-seat-detail': [0, 1.08, -0.36],
  hero: [-0.18, 1.45, -2.6],
};

export function usesCompactCamera(width: number, height: number): boolean {
  return width <= 1024 && height >= width;
}

export function usesLandscapeCamera(width: number, height: number): boolean {
  return width <= 1024 && height <= 500 && height < width;
}

export function getShotSet(compact: boolean, landscape = false): CameraShotSet {
  return compact ? mobileShots : landscape ? landscapeShots : desktopShots;
}
export function getWaypointSet(compact: boolean): CameraWaypointSet { return compact ? mobileWaypoints : desktopWaypoints; }

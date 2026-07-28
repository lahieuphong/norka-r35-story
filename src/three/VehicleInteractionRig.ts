export interface VehicleInteractionRig {
  /** 0 = closed, 1 = fully open. */
  doorProgress: number;
  /** Multiplied with the story glass opacity while the camera crosses it. */
  glassOpacity: number;
  /** Driver-controlled steering-wheel angle in radians. */
  steeringAngle: number;
  /** Current pseudo-drive speed in model units per second. */
  driveSpeed: number;
  /** 0 = static showroom ground, 1 = fully blended driving environment. */
  driveBlend: number;
  /** Wrapped road travel in model units, used by procedural scenery. */
  driveDistance: number;
  /** Wrapped local-X wheel rotation in radians. */
  wheelRotation: number;
}

export function createVehicleInteractionRig(): VehicleInteractionRig {
  return {
    doorProgress: 0,
    glassOpacity: 1,
    steeringAngle: 0,
    driveSpeed: 0,
    driveBlend: 0,
    driveDistance: 0,
    wheelRotation: 0,
  };
}

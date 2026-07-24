export interface VehicleInteractionRig {
  /** 0 = closed, 1 = fully open. */
  doorProgress: number;
  /** Multiplied with the story glass opacity while the camera crosses it. */
  glassOpacity: number;
  /** Driver-controlled steering-wheel angle in radians. */
  steeringAngle: number;
}

export function createVehicleInteractionRig(): VehicleInteractionRig {
  return { doorProgress: 0, glassOpacity: 1, steeringAngle: 0 };
}

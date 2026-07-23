export type ExplorePhase = 'story' | 'entering' | 'explore' | 'exiting';

/**
 * The story/Explore transition and the exterior/interior transition are kept
 * independent. This prevents the nested door interaction from changing the
 * scroll-lock and ScrollTrigger lifecycle owned by ExplorePhase.
 */
export type ExploreViewPhase =
  | 'exterior'
  | 'openingExteriorDoor'
  | 'exteriorDoorOpen'
  | 'enteringInterior'
  | 'interiorDoorOpen'
  | 'closingInteriorDoor'
  | 'interior'
  | 'openingInteriorDoor'
  | 'openingDoorForExit'
  | 'exitingInterior'
  | 'exteriorDoorOpenAfterExit'
  | 'closingExteriorDoor';

export function isStableExploreView(phase: ExplorePhase, viewPhase: ExploreViewPhase): boolean {
  return phase === 'explore'
    && (
      viewPhase === 'exterior'
      || viewPhase === 'exteriorDoorOpen'
      || viewPhase === 'exteriorDoorOpenAfterExit'
      || viewPhase === 'interiorDoorOpen'
      || viewPhase === 'interior'
    );
}

export function isExteriorOrbitEnabled(phase: ExplorePhase, viewPhase: ExploreViewPhase): boolean {
  return phase === 'explore'
    && (viewPhase === 'exterior' || viewPhase === 'exteriorDoorOpen' || viewPhase === 'exteriorDoorOpenAfterExit');
}

export function isInteriorOrbitEnabled(phase: ExplorePhase, viewPhase: ExploreViewPhase): boolean {
  return phase === 'explore' && (viewPhase === 'interiorDoorOpen' || viewPhase === 'interior');
}

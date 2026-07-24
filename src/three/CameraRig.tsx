import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useScrollStory, type CameraRigValues } from '../hooks/useScrollStory';
import { getShotSet, getWaypointSet, INITIAL_STORY_SHOT } from './cameraShots';
import { isStableExploreView, type ExplorePhase, type ExploreViewPhase } from './experienceTypes';
import { getInteriorTransitionSet } from './interiorTransitionShots';
import { cameraDebugSnapshot, storyVisualState } from './storyState';
import type { VehicleInteractionRig } from './VehicleInteractionRig';

interface Props {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly compact: boolean;
  readonly landscape: boolean;
  readonly modelReady: boolean;
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly interactionRig: VehicleInteractionRig;
  readonly reducedMotion: boolean;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
  readonly onExteriorDoorOpenComplete: () => void;
  readonly onInteriorEnterComplete: () => void;
  readonly onInteriorDoorOpenComplete: () => void;
  readonly onInteriorDoorCloseComplete: () => void;
  readonly onInteriorExitDoorOpenComplete: () => void;
  readonly onInteriorExitComplete: () => void;
  readonly onExteriorDoorCloseComplete: () => void;
}

interface CameraSnapshot {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
}

const DOOR_OPEN_DURATION = 1.05;
const DOOR_CLOSE_DURATION = 1.45;
const ENTRY_APPROACH_DURATION = 1.25;
const ENTRY_DOORWAY_DURATION = 1.1;
const ENTRY_COCKPIT_DURATION = 1.65;
const ENTRY_DOORWAY_START = ENTRY_APPROACH_DURATION - 0.1;
const ENTRY_COCKPIT_START = ENTRY_DOORWAY_START + ENTRY_DOORWAY_DURATION - 0.1;
const EXIT_DOORWAY_DURATION = 1.25;
const EXIT_APPROACH_DURATION = 1.05;
const EXIT_DESTINATION_DURATION = 1.4;
const EXIT_APPROACH_START = EXIT_DOORWAY_DURATION - 0.08;
const EXIT_DESTINATION_START = EXIT_APPROACH_START + EXIT_APPROACH_DURATION - 0.08;
// The story ScrollTrigger owns long-lived tweens on these same rig objects.
// Every transition is killed explicitly on phase changes; GSAP overwrite must
// stay off or it permanently removes the story's camera tweens while paused.
const TRANSITION_OVERWRITE = false;

export function CameraRig({
  controlsRef,
  compact,
  landscape,
  modelReady,
  phase,
  viewPhase,
  interactionRig,
  reducedMotion,
  onEnterComplete,
  onExitComplete,
  onExteriorDoorOpenComplete,
  onInteriorEnterComplete,
  onInteriorDoorOpenComplete,
  onInteriorDoorCloseComplete,
  onInteriorExitDoorOpenComplete,
  onInteriorExitComplete,
  onExteriorDoorCloseComplete,
}: Props) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const shots = getShotSet(compact, landscape);
  const waypoints = getWaypointSet(compact);
  const interiorShots = getInteriorTransitionSet(compact, landscape);
  const rigRef = useRef<CameraRigValues>({
    position: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].position),
    target: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].target),
    fov: shots[INITIAL_STORY_SHOT].fov,
  });
  const rig = rigRef.current;
  const activeTween = useRef<gsap.core.Timeline | null>(null);
  const exteriorSnapshot = useRef<CameraSnapshot | null>(null);

  useScrollStory({ ready: modelReady, reducedMotion, rig, shots, waypoints, onSceneChange: invalidate });

  useEffect(() => {
    activeTween.current?.kill();
    activeTween.current = null;
    if (phase !== 'story') storyVisualState.glassOpacity = 1;
    if (phase === 'entering') {
      const shot = shots.explore;
      const duration = reducedMotion ? 0.01 : 1.05;
      activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: TRANSITION_OVERWRITE }, onUpdate: invalidate, onComplete: onEnterComplete })
        .to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2] }, 0)
        .to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2] }, 0)
        .to(rig, { fov: shot.fov }, 0);
    } else if (phase === 'exiting') {
      const controls = controlsRef.current;
      const shot = shots.explore;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      const duration = reducedMotion ? 0.01 : 0.9;
      activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: TRANSITION_OVERWRITE }, onUpdate: invalidate, onComplete: onExitComplete })
        .to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2] }, 0)
        .to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2] }, 0)
        .to(rig, { fov: shot.fov }, 0);
    } else if (phase === 'explore' && (
      viewPhase === 'openingExteriorDoor'
      || viewPhase === 'openingInteriorDoor'
      || viewPhase === 'openingDoorForExit'
    )) {
      const controls = controlsRef.current;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      interactionRig.glassOpacity = 1;
      const duration = reducedMotion ? 0.01 : DOOR_OPEN_DURATION;
      activeTween.current = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          interactionRig.doorProgress = 1;
          const currentControls = controlsRef.current;
          if (currentControls) { currentControls.target.copy(rig.target); currentControls.update(); }
          if (viewPhase === 'openingExteriorDoor') onExteriorDoorOpenComplete();
          else if (viewPhase === 'openingInteriorDoor') onInteriorDoorOpenComplete();
          else onInteriorExitDoorOpenComplete();
        },
      })
        .to(interactionRig, { doorProgress: 1, duration }, 0);
    } else if (phase === 'explore' && viewPhase === 'enteringInterior') {
      const controls = controlsRef.current;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      if (!exteriorSnapshot.current) {
        exteriorSnapshot.current = {
          position: rig.position.clone(),
          target: rig.target.clone(),
          fov: rig.fov,
        };
      }
      const quick = (duration: number): number => reducedMotion ? 0.01 : duration;
      const approach = interiorShots.approach;
      const doorway = interiorShots.doorway;
      const cockpit = interiorShots.cockpit;
      activeTween.current = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          interactionRig.doorProgress = 1;
          interactionRig.glassOpacity = 1;
          const currentControls = controlsRef.current;
          if (currentControls) { currentControls.target.copy(rig.target); currentControls.update(); }
          onInteriorEnterComplete();
        },
      })
        .to(rig.position, { x: approach.position[0], y: approach.position[1], z: approach.position[2], duration: quick(ENTRY_APPROACH_DURATION) }, 0)
        .to(rig.target, { x: approach.target[0], y: approach.target[1], z: approach.target[2], duration: quick(ENTRY_APPROACH_DURATION) }, 0)
        .to(rig, { fov: approach.fov, duration: quick(ENTRY_APPROACH_DURATION) }, 0)
        .to(interactionRig, { glassOpacity: 0.24, duration: quick(0.4) }, quick(ENTRY_DOORWAY_START - 0.25))
        .to(rig.position, { x: doorway.position[0], y: doorway.position[1], z: doorway.position[2], duration: quick(ENTRY_DOORWAY_DURATION) }, quick(ENTRY_DOORWAY_START))
        .to(rig.target, { x: doorway.target[0], y: doorway.target[1], z: doorway.target[2], duration: quick(ENTRY_DOORWAY_DURATION) }, quick(ENTRY_DOORWAY_START))
        .to(rig, { fov: doorway.fov, duration: quick(ENTRY_DOORWAY_DURATION) }, quick(ENTRY_DOORWAY_START))
        .to(rig.position, { x: cockpit.position[0], y: cockpit.position[1], z: cockpit.position[2], duration: quick(ENTRY_COCKPIT_DURATION) }, quick(ENTRY_COCKPIT_START))
        .to(rig.target, { x: cockpit.target[0], y: cockpit.target[1], z: cockpit.target[2], duration: quick(ENTRY_COCKPIT_DURATION) }, quick(ENTRY_COCKPIT_START))
        .to(rig, { fov: cockpit.fov, duration: quick(ENTRY_COCKPIT_DURATION) }, quick(ENTRY_COCKPIT_START))
        .to(interactionRig, { glassOpacity: 1, duration: quick(0.65) }, quick(ENTRY_COCKPIT_START + 0.3));
    } else if (phase === 'explore' && (viewPhase === 'closingInteriorDoor' || viewPhase === 'closingExteriorDoor')) {
      const controls = controlsRef.current;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      const duration = reducedMotion ? 0.01 : DOOR_CLOSE_DURATION;
      interactionRig.glassOpacity = 1;
      activeTween.current = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          interactionRig.doorProgress = 0;
          interactionRig.glassOpacity = 1;
          const currentControls = controlsRef.current;
          if (currentControls) { currentControls.target.copy(rig.target); currentControls.update(); }
          if (viewPhase === 'closingInteriorDoor') onInteriorDoorCloseComplete();
          else onExteriorDoorCloseComplete();
        },
      })
        .to(interactionRig, { doorProgress: 0, duration }, 0);
    } else if (phase === 'explore' && viewPhase === 'exitingInterior') {
      const controls = controlsRef.current;
      const fallbackShot = shots.explore;
      const destination = exteriorSnapshot.current ?? {
        position: new THREE.Vector3(...fallbackShot.position),
        target: new THREE.Vector3(...fallbackShot.target),
        fov: fallbackShot.fov,
      };
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      const quick = (duration: number): number => reducedMotion ? 0.01 : duration;
      const doorway = interiorShots.doorway;
      const approach = interiorShots.approach;
      activeTween.current = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          interactionRig.doorProgress = 1;
          interactionRig.glassOpacity = 1;
          const currentControls = controlsRef.current;
          if (currentControls) { currentControls.target.copy(rig.target); currentControls.update(); }
          exteriorSnapshot.current = null;
          onInteriorExitComplete();
        },
      })
        .to(interactionRig, { glassOpacity: 0.24, duration: quick(0.45) }, quick(0.15))
        .to(rig.position, { x: doorway.position[0], y: doorway.position[1], z: doorway.position[2], duration: quick(EXIT_DOORWAY_DURATION) }, 0)
        .to(rig.target, { x: doorway.target[0], y: doorway.target[1], z: doorway.target[2], duration: quick(EXIT_DOORWAY_DURATION) }, 0)
        .to(rig, { fov: doorway.fov, duration: quick(EXIT_DOORWAY_DURATION) }, 0)
        .to(rig.position, { x: approach.position[0], y: approach.position[1], z: approach.position[2], duration: quick(EXIT_APPROACH_DURATION) }, quick(EXIT_APPROACH_START))
        .to(rig.target, { x: approach.target[0], y: approach.target[1], z: approach.target[2], duration: quick(EXIT_APPROACH_DURATION) }, quick(EXIT_APPROACH_START))
        .to(rig, { fov: approach.fov, duration: quick(EXIT_APPROACH_DURATION) }, quick(EXIT_APPROACH_START))
        .to(rig.position, { x: destination.position.x, y: destination.position.y, z: destination.position.z, duration: quick(EXIT_DESTINATION_DURATION) }, quick(EXIT_DESTINATION_START))
        .to(rig.target, { x: destination.target.x, y: destination.target.y, z: destination.target.z, duration: quick(EXIT_DESTINATION_DURATION) }, quick(EXIT_DESTINATION_START))
        .to(rig, { fov: destination.fov, duration: quick(EXIT_DESTINATION_DURATION) }, quick(EXIT_DESTINATION_START))
        .to(interactionRig, { glassOpacity: 1, duration: quick(0.7) }, quick(EXIT_DESTINATION_START + 0.45));
    } else if (phase === 'story') {
      exteriorSnapshot.current = null;
      interactionRig.doorProgress = 0;
      interactionRig.glassOpacity = 1;
      interactionRig.steeringAngle = 0;
    }
    return () => { activeTween.current?.kill(); activeTween.current = null; };
  }, [camera, controlsRef, interactionRig, interiorShots, invalidate, onEnterComplete, onExitComplete, onExteriorDoorCloseComplete, onExteriorDoorOpenComplete, onInteriorDoorCloseComplete, onInteriorDoorOpenComplete, onInteriorEnterComplete, onInteriorExitComplete, onInteriorExitDoorOpenComplete, phase, reducedMotion, rig, shots, viewPhase]);

  useEffect(() => () => {
    interactionRig.doorProgress = 0;
    interactionRig.glassOpacity = 1;
    interactionRig.steeringAngle = 0;
  }, [interactionRig]);

  useFrame(() => {
    const controls = controlsRef.current;
    const userControlled = isStableExploreView(phase, viewPhase);
    if (!userControlled) {
      camera.position.copy(rig.position);
      camera.lookAt(rig.target);
      if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - rig.fov) > 0.0001) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }
      if (controls) controls.target.copy(rig.target);
    }
    cameraDebugSnapshot.position.copy(camera.position);
    cameraDebugSnapshot.target.copy(userControlled && controls ? controls.target : rig.target);
    cameraDebugSnapshot.fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : rig.fov;
  });
  return null;
}

import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useScrollStory, type CameraRigValues } from '../hooks/useScrollStory';
import {
  getShotSet,
  getWaypointSet,
  INITIAL_STORY_SHOT,
  STORY_SHOT_ORDER,
  type CameraShotSet,
  type CameraWaypointSet,
  type ShotName,
} from './cameraShots';
import { isDriveActive, isStableExploreView, type DrivePhase, type ExplorePhase, type ExploreViewPhase } from './experienceTypes';
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
  readonly drivePhase: DrivePhase;
  readonly exitStoryShot?: ShotName | null;
  readonly interactionRig: VehicleInteractionRig;
  readonly reducedMotion: boolean;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
  readonly onDriveStartComplete: () => void;
  readonly onDriveStopComplete: () => void;
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

interface DriveCameraSnapshot extends CameraSnapshot {
  readonly quaternion: THREE.Quaternion;
}

interface DriveCameraShot {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  readonly duration: number;
}

interface StoryCameraSnapshot extends CameraSnapshot {
  readonly compact: boolean;
  readonly landscape: boolean;
  readonly progress: number;
  readonly section: ShotName;
}

function syncCameraToRig(
  camera: THREE.Camera,
  rig: CameraRigValues,
  controls: OrbitControlsImpl | null,
): void {
  camera.position.copy(rig.position);
  camera.lookAt(rig.target);
  if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - rig.fov) > 0.0001) {
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }
  if (controls) controls.target.copy(rig.target);
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
const STORY_POSITION_WAYPOINT_SPLIT = 0.46;
const STORY_FINAL_CAMERA_SETTLE = 0.48;
const INTERIOR_EXIT_DURATION = 1.2;
const REDUCED_INTERIOR_EXIT_DURATION = 0.012;
const INTERIOR_STORY_SHOTS: ReadonlySet<ShotName> = new Set([
  'interior',
  'steering',
  'instruments',
  'front-seats',
  'rear-seats',
  'rear-seat-detail',
]);
// The story ScrollTrigger owns long-lived tweens on these same rig objects.
// Every transition is killed explicitly on phase changes; GSAP overwrite must
// stay off or it permanently removes the story's camera tweens while paused.
const TRANSITION_OVERWRITE = false;
const DRIVE_ACCELERATION_DURATION = 0.8;
const DRIVE_DECELERATION_DURATION = 1;
const DRIVE_CRUISE_SPEED = 11.5;
const DRIVE_WHEEL_RADIUS = 0.33;
// DriveRoad maps 42 shader periods across a 96-unit plane. At its exact
// 42/96 travel scale, 4096 units become 1792 complete periods, so long-running
// numeric state can wrap without changing any visible road phase.
const DRIVE_DISTANCE_WRAP = 4096;
const FULL_TURN = Math.PI * 2;

const DESKTOP_DRIVE_TOUR: readonly DriveCameraShot[] = [
  { position: [4.6, 1.55, 6.7], target: [0, 0.46, 0.75], fov: 38, duration: 4.2 },
  { position: [-4.8, 0.92, 5.8], target: [0, 0.44, 0.7], fov: 38, duration: 4 },
  { position: [-6.6, 1.35, 0.65], target: [0, 0.45, 0.1], fov: 41, duration: 4.4 },
  { position: [-4.7, 1.18, -5.9], target: [0, 0.46, -0.75], fov: 39, duration: 4.1 },
  { position: [0.7, 0.82, -6.9], target: [0, 0.47, -1], fov: 36, duration: 3.8 },
  { position: [5.2, 1.3, -5.2], target: [0, 0.46, -0.6], fov: 40, duration: 4.2 },
  { position: [6.5, 1.7, 0.3], target: [0, 0.5, 0.05], fov: 41, duration: 4.3 },
  { position: [3.5, 2.65, 5.2], target: [0, 0.38, 0.8], fov: 37, duration: 4.4 },
];

const LANDSCAPE_DRIVE_TOUR: readonly DriveCameraShot[] = [
  { position: [4.2, 1.25, 6.4], target: [0, 0.45, 0.72], fov: 36, duration: 3.8 },
  { position: [-4.6, 0.9, 5.5], target: [0, 0.43, 0.62], fov: 36, duration: 3.8 },
  { position: [-6.1, 1.2, -0.1], target: [0, 0.44, 0], fov: 38, duration: 4.1 },
  { position: [-4.2, 1.05, -5.7], target: [0, 0.45, -0.7], fov: 37, duration: 3.9 },
  { position: [0.5, 0.75, -6.5], target: [0, 0.46, -0.92], fov: 35, duration: 3.7 },
  { position: [5.9, 1.35, -0.25], target: [0, 0.47, 0], fov: 38, duration: 4.1 },
  { position: [3.2, 2.25, 5.1], target: [0, 0.4, 0.72], fov: 35, duration: 4.2 },
];

const COMPACT_DRIVE_TOUR: readonly DriveCameraShot[] = [
  { position: [7.84, 2.22, 9.59], target: [0, 0.45, 0.55], fov: 52, duration: 4.2 },
  { position: [-8.11, 1.67, 9.46], target: [0, 0.42, 0.5], fov: 52, duration: 4.1 },
  { position: [-13.43, 2.23, -0.33], target: [0, 0.45, 0], fov: 51, duration: 4.4 },
  { position: [-7.37, 1.66, -9.78], target: [0, 0.45, -0.62], fov: 52, duration: 4.1 },
  { position: [8.11, 1.95, -9.6], target: [0, 0.46, -0.55], fov: 52, duration: 4.2 },
  { position: [12.84, 2.96, 7.65], target: [0, 0.43, 0.45], fov: 51, duration: 4.4 },
];

function getDriveTour(compact: boolean, landscape: boolean): readonly DriveCameraShot[] {
  return compact ? COMPACT_DRIVE_TOUR : landscape ? LANDSCAPE_DRIVE_TOUR : DESKTOP_DRIVE_TOUR;
}

function wrapPositive(value: number, modulus: number): number {
  return THREE.MathUtils.euclideanModulo(value, modulus);
}

function copyStoryShot(shots: CameraShotSet, name: ShotName): CameraSnapshot {
  const shot = shots[name];
  return {
    position: new THREE.Vector3(...shot.position),
    target: new THREE.Vector3(...shot.target),
    fov: shot.fov,
  };
}

function resolveStoryPoseAtProgress(
  progress: number,
  section: ShotName,
  shots: CameraShotSet,
  waypoints: CameraWaypointSet,
): CameraSnapshot {
  const segmentCount = STORY_SHOT_ORDER.length - 1;
  const sectionIndex = STORY_SHOT_ORDER.indexOf(section);
  const fallbackProgress = Math.max(0, sectionIndex) / segmentCount;
  const normalizedProgress = THREE.MathUtils.clamp(
    Number.isFinite(progress) ? progress : fallbackProgress,
    0,
    1,
  );
  if (normalizedProgress >= 1) {
    return copyStoryShot(shots, STORY_SHOT_ORDER[segmentCount] ?? section);
  }

  const timelinePosition = normalizedProgress * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(timelinePosition));
  const segmentProgress = timelinePosition - segmentIndex;
  const previousName = STORY_SHOT_ORDER[segmentIndex] ?? section;
  const nextName = STORY_SHOT_ORDER[segmentIndex + 1];
  if (!nextName || nextName === INITIAL_STORY_SHOT) return copyStoryShot(shots, previousName);

  const previousShot = shots[previousName];
  const nextShot = shots[nextName];
  const waypoint = waypoints[nextName];
  const position = new THREE.Vector3();

  if (previousName === 'explore' && nextName === 'performance') {
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...previousShot.position),
      new THREE.Vector3(...waypoint),
      new THREE.Vector3(...nextShot.position),
    ).getPoint(segmentProgress, position);
  } else if (previousName === 'rear-seat-detail' && nextName === 'hero') {
    if (segmentProgress >= STORY_FINAL_CAMERA_SETTLE) {
      position.set(...nextShot.position);
    } else {
      const alignment = shots.interior.position;
      const exteriorArc = new THREE.Vector3(
        nextShot.position[0] * 0.68,
        Math.max(2.1, nextShot.position[1] + 0.35),
        0.45,
      );
      const rearClearance = new THREE.Vector3(
        0,
        Math.max(1.65, nextShot.position[1]),
        waypoint[2] - (nextShot.fov > 45 ? 3.6 : 2.8),
      );
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(...previousShot.position),
        new THREE.Vector3(...alignment),
        new THREE.Vector3(...waypoint),
        rearClearance,
        exteriorArc,
        new THREE.Vector3(...nextShot.position),
      ], false, 'centripetal').getPoint(
        segmentProgress / STORY_FINAL_CAMERA_SETTLE,
        position,
      );
    }
  } else if (segmentProgress <= STORY_POSITION_WAYPOINT_SPLIT) {
    position.lerpVectors(
      new THREE.Vector3(...previousShot.position),
      new THREE.Vector3(...waypoint),
      segmentProgress / STORY_POSITION_WAYPOINT_SPLIT,
    );
  } else {
    position.lerpVectors(
      new THREE.Vector3(...waypoint),
      new THREE.Vector3(...nextShot.position),
      (segmentProgress - STORY_POSITION_WAYPOINT_SPLIT) / (1 - STORY_POSITION_WAYPOINT_SPLIT),
    );
  }

  const cameraSettleDuration = previousName === 'rear-seat-detail' && nextName === 'hero'
    ? STORY_FINAL_CAMERA_SETTLE
    : 1;
  const cameraProgress = THREE.MathUtils.clamp(segmentProgress / cameraSettleDuration, 0, 1);
  return {
    position,
    target: new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...previousShot.target),
      new THREE.Vector3(...nextShot.target),
      cameraProgress,
    ),
    fov: THREE.MathUtils.lerp(previousShot.fov, nextShot.fov, cameraProgress),
  };
}

export function CameraRig({
  controlsRef,
  compact,
  landscape,
  modelReady,
  phase,
  viewPhase,
  drivePhase,
  exitStoryShot,
  interactionRig,
  reducedMotion,
  onEnterComplete,
  onExitComplete,
  onDriveStartComplete,
  onDriveStopComplete,
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
  const storyShots = useRef(shots);
  const storyWaypoints = useRef(waypoints);
  const storyReducedMotion = useRef(reducedMotion);
  if (phase === 'story') {
    storyShots.current = shots;
    storyWaypoints.current = waypoints;
    storyReducedMotion.current = reducedMotion;
  }
  const rigRef = useRef<CameraRigValues>({
    position: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].position),
    target: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].target),
    fov: shots[INITIAL_STORY_SHOT].fov,
  });
  const rig = rigRef.current;
  const activeTween = useRef<gsap.core.Timeline | null>(null);
  const exteriorSnapshot = useRef<CameraSnapshot | null>(null);
  const driveSnapshot = useRef<DriveCameraSnapshot | null>(null);
  const driveTour = useRef<readonly DriveCameraShot[]>(getDriveTour(compact, landscape));
  const driveReducedMotion = useRef(reducedMotion);
  const storySnapshot = useRef<StoryCameraSnapshot | null>(null);

  // The scroll-story context owns GSAP tweens on this same rig. Freeze its
  // responsive inputs while Explore is active so an orientation or preference
  // change cannot rebuild that context underneath an entry/exit transition.
  useScrollStory({
    ready: modelReady,
    reducedMotion: storyReducedMotion.current,
    rig,
    shots: storyShots.current,
    waypoints: storyWaypoints.current,
    onSceneChange: invalidate,
  });

  // A running route owns the shot profile and motion preference captured when
  // it starts. Resizing, rotating, or changing reduced-motion mid-transition
  // must not kill the timeline and send the camera back toward its approach.
  useEffect(() => {
    activeTween.current?.kill();
    activeTween.current = null;
    if (phase !== 'story') storyVisualState.glassOpacity = 1;
    if (phase === 'entering') {
      // Preserve the exact scroll-driven pose. Returning to the canonical
      // Explore shot would otherwise flash for one frame before ScrollTrigger
      // restores a partially progressed section.
      if (!storySnapshot.current) {
        storySnapshot.current = {
          position: rig.position.clone(), target: rig.target.clone(), fov: rig.fov,
          compact, landscape,
          progress: cameraDebugSnapshot.progress,
          section: cameraDebugSnapshot.section,
        };
      }
      const shot = shots.explore;
      const duration = reducedMotion ? 0.01 : 1.05;
      activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: TRANSITION_OVERWRITE }, onUpdate: invalidate, onComplete: onEnterComplete })
        .to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2] }, 0)
        .to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2] }, 0)
        .to(rig, { fov: shot.fov }, 0);
    } else if (phase === 'exiting') {
      const controls = controlsRef.current;
      const snapshot = storySnapshot.current;
      const requestedShot = exitStoryShot ? shots[exitStoryShot] : null;
      // Explicit story navigation outranks the entry pose so the transition
      // and the hash destination resolve to the same current-profile shot.
      const destination: CameraSnapshot = requestedShot
        ? {
            position: new THREE.Vector3(...requestedShot.position),
            target: new THREE.Vector3(...requestedShot.target),
            fov: requestedShot.fov,
          }
        // Preserve the byte-for-byte entry pose while its profile is still
        // current. After a responsive profile change, reconstruct the same
        // logical ScrollTrigger progress against the new shots instead of
        // incorrectly returning every nonzero entry to canonical Explore.
        : snapshot
          && snapshot.compact === compact
          && snapshot.landscape === landscape
          ? snapshot
          : resolveStoryPoseAtProgress(
              snapshot?.progress ?? cameraDebugSnapshot.progress,
              snapshot?.section ?? cameraDebugSnapshot.section,
              shots,
              waypoints,
            );
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      const interiorStoryExit = Boolean(exitStoryShot && INTERIOR_STORY_SHOTS.has(exitStoryShot));
      const completeExit = (): void => {
        storyVisualState.glassOpacity = 1;
        onExitComplete();
      };

      if (interiorStoryExit) {
        const duration = reducedMotion ? REDUCED_INTERIOR_EXIT_DURATION : INTERIOR_EXIT_DURATION;
        const side = rig.position.x < 0 ? -1 : 1;
        const clearanceRadius = Math.max(7.5, Math.hypot(rig.position.x, rig.position.z));
        const clearanceHeight = Math.max(2.6, rig.position.y);
        const exteriorClearance = new THREE.Vector3(
          side * clearanceRadius,
          clearanceHeight,
          rig.position.z,
        );
        const rearArc = new THREE.Vector3(
          side * clearanceRadius,
          clearanceHeight,
          Math.min(-7, shots.precision.position[2] - 1),
        );
        const precisionApproach = new THREE.Vector3(...shots.precision.position);
        const rearGlassWaypoint = new THREE.Vector3(...waypoints.interior);
        const interiorEntry = new THREE.Vector3(...shots.interior.position);
        const positionLeg = (
          point: THREE.Vector3,
          legDuration: number,
          start: number,
        ): void => {
          activeTween.current?.to(rig.position, {
            x: point.x,
            y: point.y,
            z: point.z,
            duration: legDuration,
          }, start);
        };

        // First move radially outside the vehicle, arc behind it, then reuse
        // the story's proven precision -> rear-glass -> cabin route. This keeps
        // an arbitrary exterior orbit from cutting through the closed body.
        activeTween.current = gsap.timeline({
          defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
          onUpdate: invalidate,
          onComplete: completeExit,
        });
        positionLeg(exteriorClearance, duration * 0.12, 0);
        positionLeg(rearArc, duration * 0.18, duration * 0.12);
        positionLeg(precisionApproach, duration * 0.15, duration * 0.3);
        positionLeg(rearGlassWaypoint, duration * 0.2, duration * 0.45);
        positionLeg(interiorEntry, duration * 0.22, duration * 0.65);
        positionLeg(destination.position, duration * 0.13, duration * 0.87);
        activeTween.current
          .to(rig.target, {
            x: destination.target.x,
            y: destination.target.y,
            z: destination.target.z,
            duration,
          }, 0)
          .to(rig, { fov: destination.fov, duration }, 0)
          .to(storyVisualState, { glassOpacity: 0, duration: duration * 0.07 }, duration * 0.57)
          .to(storyVisualState, { glassOpacity: 1, duration: duration * 0.12 }, duration * 0.87);
      } else {
        const duration = reducedMotion ? 0.01 : 0.9;
        activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: TRANSITION_OVERWRITE }, onUpdate: invalidate, onComplete: completeExit })
          .to(rig.position, { x: destination.position.x, y: destination.position.y, z: destination.position.z }, 0)
          .to(rig.target, { x: destination.target.x, y: destination.target.y, z: destination.target.z }, 0)
          .to(rig, { fov: destination.fov }, 0);
      }
    } else if (phase === 'explore' && viewPhase === 'exterior' && drivePhase === 'starting') {
      const controls = controlsRef.current;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      driveSnapshot.current = {
        position: camera.position.clone(),
        target: (controls?.target ?? rig.target).clone(),
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : rig.fov,
        quaternion: camera.quaternion.clone(),
      };
      driveTour.current = getDriveTour(compact, landscape);
      driveReducedMotion.current = reducedMotion;
      interactionRig.driveSpeed = 0;
      interactionRig.driveBlend = 0;
      interactionRig.driveDistance = 0;

      const firstShot = driveTour.current[0] ?? DESKTOP_DRIVE_TOUR[0]!;
      const cameraDuration = driveReducedMotion.current ? 0.01 : DRIVE_ACCELERATION_DURATION;
      const timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          interactionRig.driveSpeed = DRIVE_CRUISE_SPEED;
          interactionRig.driveBlend = 1;
          syncCameraToRig(camera, rig, controlsRef.current);
          onDriveStartComplete();
        },
      });
      activeTween.current = timeline;
      if (driveReducedMotion.current) {
        timeline.to(rig.position, {
          x: firstShot.position[0],
          y: firstShot.position[1],
          z: firstShot.position[2],
          duration: cameraDuration,
        }, 0);
      } else {
        const horizontalRadius = Math.hypot(rig.position.x, rig.position.z);
        const firstRadius = Math.hypot(firstShot.position[0], firstShot.position[2]);
        const directionX = horizontalRadius > 0.25
          ? rig.position.x / horizontalRadius
          : firstShot.position[0] / firstRadius;
        const directionZ = horizontalRadius > 0.25
          ? rig.position.z / horizontalRadius
          : firstShot.position[2] / firstRadius;
        const clearanceRadius = Math.max(7.5, horizontalRadius);
        const clearanceHeight = Math.max(2.9, rig.position.y);
        timeline
          .to(rig.position, {
            x: directionX * clearanceRadius,
            y: clearanceHeight,
            z: directionZ * clearanceRadius,
            duration: 0.24,
          }, 0)
          .to(rig.position, {
            x: firstShot.position[0],
            y: Math.max(clearanceHeight, firstShot.position[1] + 1.4),
            z: firstShot.position[2],
            duration: 0.28,
          }, 0.24)
          .to(rig.position, {
            x: firstShot.position[0],
            y: firstShot.position[1],
            z: firstShot.position[2],
            duration: 0.28,
          }, 0.52);
      }
      timeline
        .to(rig.target, { x: firstShot.target[0], y: firstShot.target[1], z: firstShot.target[2], duration: cameraDuration }, 0)
        .to(rig, { fov: firstShot.fov, duration: cameraDuration }, 0)
        .to(interactionRig, {
          driveSpeed: DRIVE_CRUISE_SPEED,
          driveBlend: 1,
          duration: DRIVE_ACCELERATION_DURATION,
        }, 0);
    } else if (phase === 'explore' && viewPhase === 'exterior' && drivePhase === 'driving') {
      const tour = driveTour.current;
      const firstShot = tour[0] ?? DESKTOP_DRIVE_TOUR[0]!;
      interactionRig.driveSpeed = DRIVE_CRUISE_SPEED;
      interactionRig.driveBlend = 1;

      if (driveReducedMotion.current) {
        rig.position.set(...firstShot.position);
        rig.target.set(...firstShot.target);
        rig.fov = firstShot.fov;
        syncCameraToRig(camera, rig, controlsRef.current);
        invalidate();
      } else {
        const timeline = gsap.timeline({
          defaults: { ease: 'sine.inOut', overwrite: TRANSITION_OVERWRITE },
          onUpdate: invalidate,
          repeat: -1,
        });
        activeTween.current = timeline;
        for (let index = 1; index <= tour.length; index += 1) {
          const shot = tour[index % tour.length];
          if (!shot) continue;
          const start = timeline.duration();
          timeline
            .to(rig.position, {
              x: shot.position[0],
              y: shot.position[1],
              z: shot.position[2],
              duration: shot.duration,
            }, start)
            .to(rig.target, {
              x: shot.target[0],
              y: shot.target[1],
              z: shot.target[2],
              duration: shot.duration,
            }, start)
            .to(rig, { fov: shot.fov, duration: shot.duration }, start);
        }
      }
    } else if (phase === 'explore' && viewPhase === 'exterior' && drivePhase === 'stopping') {
      const controls = controlsRef.current;
      rig.position.copy(camera.position);
      if (controls) rig.target.copy(controls.target);
      if (camera instanceof THREE.PerspectiveCamera) rig.fov = camera.fov;
      const snapshot = driveSnapshot.current ?? {
        position: camera.position.clone(),
        target: (controls?.target ?? rig.target).clone(),
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : rig.fov,
        quaternion: camera.quaternion.clone(),
      };
      const restoreDriveSnapshot = (): void => {
        rig.position.copy(snapshot.position);
        rig.target.copy(snapshot.target);
        rig.fov = snapshot.fov;
        syncCameraToRig(camera, rig, controlsRef.current);
        camera.quaternion.copy(snapshot.quaternion);
        camera.updateMatrixWorld();
      };

      if (driveReducedMotion.current) restoreDriveSnapshot();
      activeTween.current = gsap.timeline({
        defaults: { ease: 'power2.inOut', overwrite: TRANSITION_OVERWRITE },
        onUpdate: invalidate,
        onComplete: () => {
          restoreDriveSnapshot();
          interactionRig.driveSpeed = 0;
          interactionRig.driveBlend = 0;
          interactionRig.driveDistance = 0;
          driveSnapshot.current = null;
          onDriveStopComplete();
        },
      });
      if (!driveReducedMotion.current) {
        const horizontalRadius = Math.hypot(rig.position.x, rig.position.z);
        const snapshotRadius = Math.hypot(snapshot.position.x, snapshot.position.z);
        const directionX = horizontalRadius > 0.25
          ? rig.position.x / horizontalRadius
          : snapshotRadius > 0.25 ? snapshot.position.x / snapshotRadius : 1;
        const directionZ = horizontalRadius > 0.25
          ? rig.position.z / horizontalRadius
          : snapshotRadius > 0.25 ? snapshot.position.z / snapshotRadius : 0;
        const clearanceRadius = Math.max(7.5, horizontalRadius);
        const clearanceHeight = Math.max(2.9, rig.position.y, snapshot.position.y + 1.4);
        activeTween.current
          .to(rig.position, {
            x: directionX * clearanceRadius,
            y: clearanceHeight,
            z: directionZ * clearanceRadius,
            duration: 0.28,
          }, 0)
          .to(rig.position, {
            x: snapshot.position.x,
            y: clearanceHeight,
            z: snapshot.position.z,
            duration: 0.36,
          }, 0.28)
          .to(rig.position, {
            x: snapshot.position.x,
            y: snapshot.position.y,
            z: snapshot.position.z,
            duration: 0.36,
          }, 0.64)
          .to(rig.target, { x: snapshot.target.x, y: snapshot.target.y, z: snapshot.target.z, duration: DRIVE_DECELERATION_DURATION }, 0)
          .to(rig, { fov: snapshot.fov, duration: DRIVE_DECELERATION_DURATION }, 0);
      }
      activeTween.current.to(interactionRig, {
        driveSpeed: 0,
        driveBlend: 0,
        duration: DRIVE_DECELERATION_DURATION,
        ease: 'power2.out',
      }, 0);
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
          syncCameraToRig(camera, rig, controlsRef.current);
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
          syncCameraToRig(camera, rig, controlsRef.current);
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
          syncCameraToRig(camera, rig, controlsRef.current);
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
          syncCameraToRig(camera, rig, controlsRef.current);
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
      storySnapshot.current = null;
      exteriorSnapshot.current = null;
      driveSnapshot.current = null;
      interactionRig.doorProgress = 0;
      interactionRig.glassOpacity = 1;
      interactionRig.steeringAngle = 0;
      interactionRig.driveSpeed = 0;
      interactionRig.driveBlend = 0;
      interactionRig.driveDistance = 0;
    }
    return () => {
      activeTween.current?.kill();
      activeTween.current = null;
      if (phase === 'exiting' && exitStoryShot && INTERIOR_STORY_SHOTS.has(exitStoryShot)) {
        storyVisualState.glassOpacity = 1;
      }
    };
  }, [camera, controlsRef, drivePhase, exitStoryShot, interactionRig, invalidate, onDriveStartComplete, onDriveStopComplete, onEnterComplete, onExitComplete, onExteriorDoorCloseComplete, onExteriorDoorOpenComplete, onInteriorDoorCloseComplete, onInteriorDoorOpenComplete, onInteriorEnterComplete, onInteriorExitComplete, onInteriorExitDoorOpenComplete, phase, rig, viewPhase]);

  useEffect(() => () => {
    interactionRig.doorProgress = 0;
    interactionRig.glassOpacity = 1;
    interactionRig.steeringAngle = 0;
    interactionRig.driveSpeed = 0;
    interactionRig.driveBlend = 0;
    interactionRig.driveDistance = 0;
    interactionRig.wheelRotation = 0;
  }, [interactionRig]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const driveActive = isDriveActive(drivePhase);
    const frameTime = Math.min(Math.max(delta, 0), 0.1);
    const driveSpeed = Math.max(0, interactionRig.driveSpeed);
    if (driveActive && driveSpeed > 0 && frameTime > 0) {
      interactionRig.driveDistance = wrapPositive(
        interactionRig.driveDistance + driveSpeed * frameTime,
        DRIVE_DISTANCE_WRAP,
      );
      interactionRig.wheelRotation = wrapPositive(
        interactionRig.wheelRotation + (driveSpeed * frameTime) / DRIVE_WHEEL_RADIUS,
        FULL_TURN,
      );
    }
    const userControlled = !driveActive && isStableExploreView(phase, viewPhase);
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

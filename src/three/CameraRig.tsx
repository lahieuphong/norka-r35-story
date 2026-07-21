import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useScrollStory, type CameraRigValues } from '../hooks/useScrollStory';
import { getShotSet, getWaypointSet, INITIAL_STORY_SHOT } from './cameraShots';
import type { ExplorePhase } from './experienceTypes';
import { cameraDebugSnapshot, storyVisualState } from './storyState';

interface Props {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly compact: boolean;
  readonly landscape: boolean;
  readonly modelReady: boolean;
  readonly phase: ExplorePhase;
  readonly reducedMotion: boolean;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
}

export function CameraRig({ controlsRef, compact, landscape, modelReady, phase, reducedMotion, onEnterComplete, onExitComplete }: Props) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const shots = getShotSet(compact, landscape);
  const waypoints = getWaypointSet(compact);
  const rigRef = useRef<CameraRigValues>({
    position: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].position),
    target: new THREE.Vector3(...shots[INITIAL_STORY_SHOT].target),
    fov: shots[INITIAL_STORY_SHOT].fov,
  });
  const rig = rigRef.current;
  const activeTween = useRef<gsap.core.Timeline | null>(null);

  useScrollStory({ ready: modelReady, reducedMotion, rig, shots, waypoints, onSceneChange: invalidate });

  useEffect(() => {
    activeTween.current?.kill();
    activeTween.current = null;
    if (phase !== 'story') storyVisualState.glassOpacity = 1;
    if (phase === 'entering') {
      const shot = shots.explore;
      const duration = reducedMotion ? 0.01 : 1.05;
      activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: true }, onUpdate: invalidate, onComplete: onEnterComplete })
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
      activeTween.current = gsap.timeline({ defaults: { duration, ease: 'power3.inOut', overwrite: true }, onUpdate: invalidate, onComplete: onExitComplete })
        .to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2] }, 0)
        .to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2] }, 0)
        .to(rig, { fov: shot.fov }, 0);
    }
    return () => { activeTween.current?.kill(); activeTween.current = null; };
  }, [camera, controlsRef, invalidate, onEnterComplete, onExitComplete, phase, reducedMotion, rig, shots]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (phase !== 'explore') {
      camera.position.copy(rig.position);
      camera.lookAt(rig.target);
      if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - rig.fov) > 0.0001) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }
      if (controls) controls.target.copy(rig.target);
    }
    cameraDebugSnapshot.position.copy(camera.position);
    cameraDebugSnapshot.target.copy(phase === 'explore' && controls ? controls.target : rig.target);
    cameraDebugSnapshot.fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : rig.fov;
  });
  return null;
}

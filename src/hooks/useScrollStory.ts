import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import { INITIAL_STORY_SHOT, STORY_SHOT_ORDER, type CameraShotSet, type CameraWaypointSet, type ShotName } from '../three/cameraShots';
import { cameraDebugSnapshot, disableStoryScrollTriggers, isStoryScrollSuspended, STORY_TRIGGER_PREFIX, storyVisualState } from '../three/storyState';
import { publishStoryProgress } from '../three/storyProgress';

gsap.registerPlugin(ScrollTrigger);

const COPY_FADE_DURATION = 0.4;
const COPY_FADE_OUT_START = 0.22;
const COPY_FADE_IN_START = 0.38;
const FINAL_CAMERA_SETTLE = 0.48;

export interface CameraRigValues { readonly position: THREE.Vector3; readonly target: THREE.Vector3; fov: number; }
interface Options {
  readonly ready: boolean;
  readonly reducedMotion: boolean;
  readonly rig: CameraRigValues;
  readonly shots: CameraShotSet;
  readonly waypoints: CameraWaypointSet;
  readonly onSceneChange: () => void;
}
interface PositionCurve { getPoint(t: number, target?: THREE.Vector3): THREE.Vector3; }

function copyShot(rig: CameraRigValues, shots: CameraShotSet, name: ShotName): void {
  const shot = shots[name];
  rig.position.set(...shot.position);
  rig.target.set(...shot.target);
  rig.fov = shot.fov;
  cameraDebugSnapshot.section = name;
}

function tweenPositionOnCurve(timeline: gsap.core.Timeline, rig: CameraRigValues, curve: PositionCurve, start: number, duration = 1): void {
  let curveProgress = 0;
  const motion = {
    get progress(): number { return curveProgress; },
    set progress(value: number) {
      curveProgress = value;
      curve.getPoint(value, rig.position);
    },
  };
  timeline.to(motion, {
    progress: 1,
    duration,
    ease: 'none',
  }, start);
}

function setProgress(progress: number): void {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const index = Math.min(STORY_SHOT_ORDER.length - 1, Math.max(0, Math.round(clampedProgress * (STORY_SHOT_ORDER.length - 1))));
  cameraDebugSnapshot.progress = clampedProgress;
  cameraDebugSnapshot.section = STORY_SHOT_ORDER[index] ?? INITIAL_STORY_SHOT;
  publishStoryProgress(clampedProgress, index + 1, STORY_SHOT_ORDER.length);
}

export function useScrollStory({ ready, reducedMotion, rig, shots, waypoints, onSceneChange }: Options): void {
  useLayoutEffect(() => {
    if (!ready) return;
    const root = document.querySelector<HTMLElement>('[data-story-root]');
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-story-section]'));
    const copies = sections.map((section) => section.querySelector<HTMLElement>('[data-story-copy]')).filter((item): item is HTMLElement => item !== null);
    const orderMatches = sections.every((section, index) => section.dataset.storySection === STORY_SHOT_ORDER[index]);
    if (sections.length !== STORY_SHOT_ORDER.length || copies.length !== STORY_SHOT_ORDER.length || !orderMatches) return;
    copyShot(rig, shots, INITIAL_STORY_SHOT);
    storyVisualState.glassOpacity = 1;
    setProgress(0);
    onSceneChange();

    const context = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(copies, { autoAlpha: 0, yPercent: 0 });
        const firstCopy = copies[0];
        if (firstCopy) gsap.set(firstCopy, { autoAlpha: 1 });
        STORY_SHOT_ORDER.forEach((name, index) => {
          const section = sections[index];
          const copy = copies[index];
          if (!section || !copy) return;
          const activate = (): void => {
            copyShot(rig, shots, name);
            gsap.set(copies, { autoAlpha: 0 });
            gsap.set(copy, { autoAlpha: 1 });
            onSceneChange();
          };
          ScrollTrigger.create({
            id: `${STORY_TRIGGER_PREFIX}-reduced-${name}`,
            trigger: section,
            start: 'top 50%',
            end: 'bottom 50%',
            onEnter: activate,
            onEnterBack: activate,
          });
        });
        ScrollTrigger.create({
          id: `${STORY_TRIGGER_PREFIX}-reduced-progress`,
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => setProgress(self.progress),
          onRefresh: (self) => setProgress(self.progress),
        });
        return;
      }

      gsap.set(copies, { autoAlpha: 0, yPercent: 8 });
      const firstCopy = copies[0];
      if (!firstCopy) return;
      gsap.set(firstCopy, { autoAlpha: 1, yPercent: 0 });
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: onSceneChange,
        scrollTrigger: {
          id: `${STORY_TRIGGER_PREFIX}-master`,
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          // Keep copy and camera state attached to the actual scroll position.
          // A damped scrub leaves the active section blank after anchor jumps.
          scrub: true,
          invalidateOnRefresh: true,
          markers: import.meta.env.DEV && import.meta.env.VITE_SCROLL_MARKERS === 'true',
          onUpdate: (self) => setProgress(self.progress),
          onRefresh: (self) => setProgress(self.progress),
        },
      });

      for (let index = 1; index < STORY_SHOT_ORDER.length; index += 1) {
        const previousName = STORY_SHOT_ORDER[index - 1];
        const name = STORY_SHOT_ORDER[index];
        const outgoing = copies[index - 1];
        const incoming = copies[index];
        if (!previousName || !name || name === INITIAL_STORY_SHOT || !outgoing || !incoming) continue;
        const previousShot = shots[previousName];
        const shot = shots[name];
        const waypoint = waypoints[name];
        const start = index - 1;
        let cameraSettleDuration = 1;
        let outgoingFadeStart = COPY_FADE_OUT_START;
        let incomingFadeStart = COPY_FADE_IN_START;
        let outgoingFadeDuration = COPY_FADE_DURATION;
        let incomingFadeDuration = COPY_FADE_DURATION;

        if (previousName === 'explore' && name === 'performance') {
          // The reordered opening uses one continuous curve so its new
          // Explore-to-Performance path has no visible corner at the waypoint.
          tweenPositionOnCurve(timeline, rig, new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(...previousShot.position),
            new THREE.Vector3(...waypoint),
            new THREE.Vector3(...shot.position),
          ), start);
        } else if (previousName === 'rear-seat-detail' && name === 'hero') {
          // Leave the second row through the rear glass, sweep around the
          // outside of the car, and settle before the final section becomes
          // active. Keeping this motion to the first half of the handoff
          // prevents step 12 from being composited over close-up bodywork.
          cameraSettleDuration = FINAL_CAMERA_SETTLE;
          outgoingFadeStart = 0.2;
          incomingFadeStart = 0.38;
          outgoingFadeDuration = FINAL_CAMERA_SETTLE - outgoingFadeStart;
          incomingFadeDuration = FINAL_CAMERA_SETTLE - incomingFadeStart;
          const alignment = shots.interior.position;
          const exteriorArc = new THREE.Vector3(
            shot.position[0] * 0.68,
            Math.max(2.1, shot.position[1] + 0.35),
            0.45,
          );
          const rearClearance = new THREE.Vector3(
            0,
            Math.max(1.65, shot.position[1]),
            waypoint[2] - (shot.fov > 45 ? 3.6 : 2.8),
          );
          tweenPositionOnCurve(timeline, rig, new THREE.CatmullRomCurve3([
            new THREE.Vector3(...previousShot.position),
            new THREE.Vector3(...alignment),
            new THREE.Vector3(...waypoint),
            rearClearance,
            exteriorArc,
            new THREE.Vector3(...shot.position),
          ], false, 'centripetal'), start, cameraSettleDuration);
          timeline.to(storyVisualState, { glassOpacity: 0, duration: 0.05 }, start + 0.09);
          timeline.to(storyVisualState, { glassOpacity: 1, duration: 0.08 }, start + 0.2);
        } else {
          timeline.to(rig.position, { x: waypoint[0], y: waypoint[1], z: waypoint[2], duration: 0.46 }, start);
          timeline.to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2], duration: 0.54 }, start + 0.46);
          if (name === 'interior') {
            // The model is a closed shell. Fade only the two window materials
            // while the camera crosses the rear glass, then restore them.
            timeline.to(storyVisualState, { glassOpacity: 0, duration: 0.08 }, start + 0.74);
            timeline.to(storyVisualState, { glassOpacity: 1, duration: 0.1 }, start + 0.9);
          }
        }
        timeline.to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2], duration: cameraSettleDuration }, start);
        timeline.to(rig, { fov: shot.fov, duration: cameraSettleDuration }, start);
        if (cameraSettleDuration < 1) {
          // Keep an explicit direct-property plateau through the rest of this
          // timeline unit. Besides preserving the 11-unit scroll mapping, this
          // makes every GSAP refresh/seek write the exact final position without
          // depending on the lifecycle of the curve-progress proxy.
          const finalPosition = {
            x: shot.position[0],
            y: shot.position[1],
            z: shot.position[2],
          };
          timeline.fromTo(rig.position, finalPosition, {
            ...finalPosition,
            duration: 1 - cameraSettleDuration,
            immediateRender: false,
          }, start + cameraSettleDuration);
        }
        // Crossfade around the viewport handoff. The overlap guarantees that
        // at least one copy remains legible while scrolling in either direction.
        timeline.to(outgoing, { autoAlpha: 0, yPercent: -6, duration: outgoingFadeDuration, ease: 'power2.in' }, start + outgoingFadeStart);
        timeline.fromTo(incoming, { autoAlpha: 0, yPercent: 8 }, { autoAlpha: 1, yPercent: 0, duration: incomingFadeDuration, ease: 'power2.out' }, start + incomingFadeStart);
      }
    }, root);

    if (isStoryScrollSuspended()) disableStoryScrollTriggers();

    let cancelled = false;
    void document.fonts.ready.then(() => requestAnimationFrame(() => { if (!cancelled) ScrollTrigger.refresh(); }));
    return () => { cancelled = true; storyVisualState.glassOpacity = 1; context.revert(); };
  }, [onSceneChange, ready, reducedMotion, rig, shots, waypoints]);
}

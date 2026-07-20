import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import { STORY_SHOT_ORDER, type CameraShotSet, type CameraWaypointSet, type ShotName } from '../three/cameraShots';
import { cameraDebugSnapshot, disableStoryScrollTriggers, isStoryScrollSuspended, STORY_TRIGGER_PREFIX } from '../three/storyState';

gsap.registerPlugin(ScrollTrigger);

export interface CameraRigValues { readonly position: THREE.Vector3; readonly target: THREE.Vector3; fov: number; }
interface Options { readonly ready: boolean; readonly reducedMotion: boolean; readonly rig: CameraRigValues; readonly shots: CameraShotSet; readonly waypoints: CameraWaypointSet; }

function copyShot(rig: CameraRigValues, shots: CameraShotSet, name: ShotName): void {
  const shot = shots[name];
  rig.position.set(...shot.position);
  rig.target.set(...shot.target);
  rig.fov = shot.fov;
  cameraDebugSnapshot.section = name;
}
function setProgress(progress: number): void {
  const index = Math.min(STORY_SHOT_ORDER.length - 1, Math.max(0, Math.round(progress * (STORY_SHOT_ORDER.length - 1))));
  cameraDebugSnapshot.progress = progress;
  cameraDebugSnapshot.section = STORY_SHOT_ORDER[index] ?? 'hero';
}

export function useScrollStory({ ready, reducedMotion, rig, shots, waypoints }: Options): void {
  useLayoutEffect(() => {
    if (!ready) return;
    const root = document.querySelector<HTMLElement>('[data-story-root]');
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-story-section]'));
    const copies = sections.map((section) => section.querySelector<HTMLElement>('[data-story-copy]')).filter((item): item is HTMLElement => item !== null);
    const orderMatches = sections.every((section, index) => section.dataset.storySection === STORY_SHOT_ORDER[index]);
    if (sections.length !== STORY_SHOT_ORDER.length || copies.length !== STORY_SHOT_ORDER.length || !orderMatches) return;
    copyShot(rig, shots, 'hero');
    setProgress(0);

    const context = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(copies, { autoAlpha: 1, yPercent: 0 });
        STORY_SHOT_ORDER.forEach((name, index) => {
          const section = sections[index];
          const copy = copies[index];
          if (!section || !copy) return;
          ScrollTrigger.create({
            id: `${STORY_TRIGGER_PREFIX}-reduced-${name}`,
            trigger: section,
            start: 'top 55%',
            end: 'bottom 45%',
            onEnter: () => copyShot(rig, shots, name),
            onEnterBack: () => copyShot(rig, shots, name),
            onToggle: (self) => { gsap.to(copy, { autoAlpha: self.isActive ? 1 : 0.58, duration: 0.12, overwrite: true }); },
          });
        });
        ScrollTrigger.create({
          id: `${STORY_TRIGGER_PREFIX}-reduced-progress`,
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => setProgress(self.progress),
        });
        return;
      }

      gsap.set(copies, { autoAlpha: 0, yPercent: 8 });
      const firstCopy = copies[0];
      if (!firstCopy) return;
      gsap.set(firstCopy, { autoAlpha: 1, yPercent: 0 });
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: `${STORY_TRIGGER_PREFIX}-master`,
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.72,
          invalidateOnRefresh: true,
          markers: import.meta.env.DEV && import.meta.env.VITE_SCROLL_MARKERS === 'true',
          onUpdate: (self) => setProgress(self.progress),
        },
      });

      for (let index = 1; index < STORY_SHOT_ORDER.length; index += 1) {
        const name = STORY_SHOT_ORDER[index];
        const outgoing = copies[index - 1];
        const incoming = copies[index];
        if (!name || name === 'hero' || !outgoing || !incoming) continue;
        const shot = shots[name];
        const waypoint = waypoints[name];
        const start = index - 1;
        timeline.to(rig.position, { x: waypoint[0], y: waypoint[1], z: waypoint[2], duration: 0.46 }, start);
        timeline.to(rig.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2], duration: 0.54 }, start + 0.46);
        timeline.to(rig.target, { x: shot.target[0], y: shot.target[1], z: shot.target[2], duration: 1 }, start);
        timeline.to(rig, { fov: shot.fov, duration: 1 }, start);
        timeline.to(outgoing, { autoAlpha: 0, yPercent: -6, duration: 0.3, ease: 'power2.in' }, start + 0.06);
        timeline.fromTo(incoming, { autoAlpha: 0, yPercent: 8 }, { autoAlpha: 1, yPercent: 0, duration: 0.34, ease: 'power2.out' }, start + 0.58);
      }
    }, root);

    if (isStoryScrollSuspended()) disableStoryScrollTriggers();

    let cancelled = false;
    void document.fonts.ready.then(() => requestAnimationFrame(() => { if (!cancelled) ScrollTrigger.refresh(); }));
    return () => { cancelled = true; context.revert(); };
  }, [ready, reducedMotion, rig, shots, waypoints]);
}

import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ShotName } from './cameraShots';
export const STORY_TRIGGER_PREFIX = 'norka-story';
let storyScrollSuspended = false;
export const cameraDebugSnapshot: {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  progress: number;
  section: ShotName;
} = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  fov: 32,
  progress: 0,
  section: 'hero',
};
export function getStoryScrollTriggers(): ScrollTrigger[] {
  return ScrollTrigger.getAll().filter((trigger) => {
    const id = trigger.vars.id;
    return typeof id === 'string' && id.startsWith(STORY_TRIGGER_PREFIX);
  });
}
export function isStoryScrollSuspended(): boolean { return storyScrollSuspended; }
export function disableStoryScrollTriggers(): void {
  storyScrollSuspended = true;
  getStoryScrollTriggers().forEach((trigger) => trigger.disable(false, false));
}
export function enableStoryScrollTriggers(): void {
  storyScrollSuspended = false;
  getStoryScrollTriggers().forEach((trigger) => trigger.enable(false, false));
  ScrollTrigger.update();
}

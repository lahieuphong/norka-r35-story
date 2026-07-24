import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraRig } from './CameraRig';
import { CarModel, releaseModelDecoders, type ModelReadyDetails } from './CarModel';
import { readDeviceProfile, type DeviceProfile } from './deviceProfile';
import { isExteriorOrbitEnabled, isInteriorOrbitEnabled, isStableExploreView, type ExplorePhase, type ExploreViewPhase } from './experienceTypes';
import { Lighting } from './Lighting';
import { getShotSet, INITIAL_STORY_SHOT } from './cameraShots';
import { createVehicleInteractionRig } from './VehicleInteractionRig';

interface Props {
  readonly modelReady: boolean;
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly reducedMotion: boolean;
  readonly onModelReady: (details: ModelReadyDetails) => void;
  readonly onWebGLFailure: () => void;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
  readonly onOpenExteriorDoor: () => void;
  readonly onExteriorDoorOpenComplete: () => void;
  readonly onInteriorEnterComplete: () => void;
  readonly onInteriorDoorOpenComplete: () => void;
  readonly onInteriorDoorCloseComplete: () => void;
  readonly onInteriorExitDoorOpenComplete: () => void;
  readonly onInteriorExitComplete: () => void;
  readonly onExteriorDoorCloseComplete: () => void;
}
const DECODER_RELEASE_TIMERS = new WeakMap<THREE.WebGLRenderer, number>();
const EXTERIOR_PAN_MIN = new THREE.Vector3(-1.65, -0.3, -3);
const EXTERIOR_PAN_MAX = new THREE.Vector3(1.65, 1.85, 3);
const WHEEL_ZOOM_SCALE = 0.95;
const WHEEL_ZOOM_SENSITIVITY = 0.72;
const WHEEL_ZOOM_DAMPING = 12;
const WHEEL_ZOOM_STOP_DISTANCE = 0.002;
const MOBILE_PINCH_ZOOM_SENSITIVITY = 0.76;
const MOBILE_PINCH_ZOOM_DAMPING = 16;
const VIEWER_MOUSE_BUTTONS = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
const VIEWER_TOUCHES = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
// Cabin geometry sits very close to the camera, so each aspect profile needs
// its own safe pitch range. With the driver's door open the camera may move
// through that doorway; once it closes, stop before the camera reaches the
// door skin or roof trim. The opposite look angle still crosses PI so the
// whole open door can be seen from across the cockpit.
const WIDE_INTERIOR_ORBIT_LIMITS = {
  minPolarDoorOpen: 1.18,
  minPolarDoorClosed: 1.24,
  maxPolar: 1.46,
  minAzimuthDoorOpen: 2.48,
  minAzimuthDoorClosed: 2.9,
  maxAzimuth: 4.12,
} as const;
const SHORT_LANDSCAPE_INTERIOR_ORBIT_LIMITS = {
  minPolarDoorOpen: 1.18,
  minPolarDoorClosed: 1.24,
  maxPolar: 1.34,
  minAzimuthDoorOpen: 2.48,
  minAzimuthDoorClosed: 2.9,
  maxAzimuth: 3.8,
} as const;
const COMPACT_INTERIOR_ORBIT_LIMITS = {
  minPolarDoorOpen: 1,
  minPolarDoorClosed: 1.04,
  maxPolar: 1.28,
  minAzimuthDoorOpen: 2.48,
  minAzimuthDoorClosed: 2.9,
  maxAzimuth: 4.55,
} as const;
const COMPACT_INTERIOR_LOOK_DISTANCE = 0.46;
function readTouchSpan(points: ReadonlyMap<number, THREE.Vector2>): number {
  let firstPoint: THREE.Vector2 | undefined;
  for (const point of points.values()) {
    if (!firstPoint) firstPoint = point;
    else return firstPoint.distanceTo(point);
  }
  return 0;
}
function profilesEqual(left: DeviceProfile, right: DeviceProfile): boolean {
  return left.isMobile === right.isMobile
    && left.compact === right.compact
    && left.landscape === right.landscape
    && left.lowEnd === right.lowEnd
    && left.modelTier === right.modelTier
    && left.dpr === right.dpr
    && left.antialias === right.antialias
    && left.anisotropy === right.anisotropy;
}
function useProfile(): DeviceProfile {
  const [profile, setProfile] = useState(readDeviceProfile);
  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setProfile((current) => {
          const measured = readDeviceProfile();
          // Keep the initial quality tier for the lifetime of this Canvas. In
          // particular, mobile address-bar and orientation resizes must not
          // load a second GLB while the first model is resident.
          const next = measured.modelTier === current.modelTier
            ? measured
            : { ...measured, modelTier: current.modelTier };
          return profilesEqual(current, next) ? current : next;
        });
      });
    };
    window.addEventListener('resize', update, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); };
  }, []);
  return profile;
}
function VisibilityController() {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const change = (): void => {
      if (document.visibilityState === 'hidden') setFrameloop('never');
      else { setFrameloop('demand'); invalidate(); }
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [invalidate, setFrameloop]);
  return null;
}
function DecoderLifecycle() {
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    const pendingRelease = DECODER_RELEASE_TIMERS.get(renderer);
    if (pendingRelease !== undefined) {
      window.clearTimeout(pendingRelease);
      DECODER_RELEASE_TIMERS.delete(renderer);
    }
    return () => {
      // StrictMode immediately remounts and cancels this task. A real Canvas
      // teardown releases decoder workers even when CarModel was suspended.
      const timer = window.setTimeout(() => {
        releaseModelDecoders(renderer);
        DECODER_RELEASE_TIMERS.delete(renderer);
      }, 0);
      DECODER_RELEASE_TIMERS.set(renderer, timer);
    };
  }, [renderer]);
  return null;
}

function ControlsInteractionReset({ controlsRef, interactive }: {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly interactive: boolean;
}) {
  const wasInteractive = useRef(interactive);
  const savedPosition = useRef(new THREE.Vector3());
  const savedQuaternion = useRef(new THREE.Quaternion());
  const savedTarget = useRef(new THREE.Vector3());

  const clearMomentum = useCallback((): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    savedPosition.current.copy(controls.object.position);
    savedQuaternion.current.copy(controls.object.quaternion);
    savedTarget.current.copy(controls.target);
    const dampingEnabled = controls.enableDamping;

    // OrbitControls keeps rotate/pan deltas in closures. Updating once with
    // damping off consumes those deltas; restoring the snapshot makes this a
    // momentum reset with no visible camera or target change.
    controls.enableDamping = false;
    controls.update();
    controls.object.position.copy(savedPosition.current);
    controls.object.quaternion.copy(savedQuaternion.current);
    controls.target.copy(savedTarget.current);
    controls.enableDamping = dampingEnabled;
  }, [controlsRef]);

  useEffect(() => {
    const previous = wasInteractive.current;
    wasInteractive.current = interactive;
    if (previous && !interactive) clearMomentum();
  }, [clearMomentum, interactive]);

  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') clearMomentum();
    };
    window.addEventListener('blur', clearMomentum);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', clearMomentum);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearMomentum]);

  return null;
}

// A portrait frustum crops the door long before a dashboard-centered orbit can
// reach it. Move only the orbit anchor nearer to the driver's head so compact
// devices behave like a look-around camera while preserving the entry shot.
function CompactInteriorLookAnchor({ controlsRef, active, compact }: {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly active: boolean;
  readonly compact: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const direction = useRef(new THREE.Vector3());
  const anchored = useRef(false);
  const previousDistance = useRef(COMPACT_INTERIOR_LOOK_DISTANCE);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!active || !controls) {
      anchored.current = false;
      return;
    }

    controls.object.getWorldDirection(direction.current);
    if (compact) {
      if (anchored.current) return;
      const currentDistance = controls.getDistance();
      if (currentDistance > COMPACT_INTERIOR_LOOK_DISTANCE + 0.05) {
        previousDistance.current = currentDistance;
      }
      controls.target
        .copy(controls.object.position)
        .addScaledVector(direction.current, COMPACT_INTERIOR_LOOK_DISTANCE);
      controls.update();
      anchored.current = true;
      invalidate();
      return;
    }

    if (!anchored.current) return;
    controls.target
      .copy(controls.object.position)
      .addScaledVector(direction.current, Math.max(previousDistance.current, COMPACT_INTERIOR_LOOK_DISTANCE));
    controls.update();
    anchored.current = false;
    invalidate();
  }, [active, compact, controlsRef, invalidate]);

  return null;
}

// OrbitControls applies updated bounds during update(). Explicitly request one
// when a door-state or device-profile limit changes so demand rendering clamps
// the camera immediately, including after the close-door transition.
function InteriorOrbitLimitSync({ controlsRef, active, minPolar, maxPolar, minAzimuth, maxAzimuth }: {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly active: boolean;
  readonly minPolar: number;
  readonly maxPolar: number;
  readonly minAzimuth: number;
  readonly maxAzimuth: number;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!active || !controls) return;
    controls.update();
    invalidate();
  }, [active, controlsRef, invalidate, maxAzimuth, maxPolar, minAzimuth, minPolar]);

  return null;
}

interface SmoothZoomControlsProps {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly enabled: boolean;
  readonly mobile: boolean;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly reducedMotion: boolean;
}

function SmoothZoomControls({ controlsRef, enabled, mobile, minDistance, maxDistance, reducedMotion }: SmoothZoomControlsProps) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const targetDistance = useRef<number | null>(null);
  const activeDamping = useRef(WHEEL_ZOOM_DAMPING);
  const touchPoints = useRef(new Map<number, THREE.Vector2>());
  const pinchStartSpan = useRef(0);
  const pinchStartDistance = useRef(0);
  const pinchActive = useRef(false);
  const cameraOffset = useRef(new THREE.Vector3());

  const applyDistance = useCallback((nextDistance: number): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    const offset = cameraOffset.current.copy(controls.object.position).sub(controls.target);
    if (offset.lengthSq() <= 1e-10) return;
    controls.object.position.copy(controls.target).add(offset.setLength(nextDistance));
  }, [controlsRef]);

  useEffect(() => {
    targetDistance.current = null;
    if (!enabled) return;
    const canvas = renderer.domElement;
    const controls = controlsRef.current;
    const cancelWheelZoom = (): void => {
      if (!pinchActive.current) targetDistance.current = null;
    };
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      // OrbitControls applies wheel zoom immediately. Capture and stop only the
      // wheel event; mobile pinch is smoothed separately below.
      event.stopImmediatePropagation();

      const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1;
      const delta = THREE.MathUtils.clamp(event.deltaY * modeScale, -120, 120);
      const activeControls = controlsRef.current;
      if (!activeControls) return;

      const currentDistance = activeControls.getDistance();
      const queuedDistance = targetDistance.current ?? currentDistance;
      const scale = Math.pow(
        WHEEL_ZOOM_SCALE,
        WHEEL_ZOOM_SENSITIVITY * Math.abs(delta * 0.01),
      );
      const nextDistance = THREE.MathUtils.clamp(
        delta < 0 ? queuedDistance * scale : queuedDistance / scale,
        minDistance,
        maxDistance,
      );

      if (reducedMotion) {
        applyDistance(nextDistance);
        invalidate();
        return;
      }

      activeDamping.current = WHEEL_ZOOM_DAMPING;
      targetDistance.current = nextDistance;
      invalidate();
    };

    controls?.addEventListener('start', cancelWheelZoom);
    canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      targetDistance.current = null;
      controls?.removeEventListener('start', cancelWheelZoom);
      canvas.removeEventListener('wheel', handleWheel, true);
    };
  }, [applyDistance, controlsRef, enabled, invalidate, maxDistance, minDistance, reducedMotion, renderer]);

  useEffect(() => {
    touchPoints.current.clear();
    pinchStartSpan.current = 0;
    pinchStartDistance.current = 0;
    pinchActive.current = false;
    if (!enabled || !mobile) return;

    const canvas = renderer.domElement;
    const ownerDocument = canvas.ownerDocument;
    const beginPinch = (): void => {
      const controls = controlsRef.current;
      const span = readTouchSpan(touchPoints.current);
      if (!controls || touchPoints.current.size !== 2 || span <= 1) {
        pinchActive.current = false;
        pinchStartSpan.current = 0;
        return;
      }
      pinchStartSpan.current = span;
      pinchStartDistance.current = targetDistance.current ?? controls.getDistance();
      pinchActive.current = true;
      activeDamping.current = MOBILE_PINCH_ZOOM_DAMPING;
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') return;
      touchPoints.current.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (touchPoints.current.size === 2) beginPinch();
      else if (touchPoints.current.size > 2) {
        pinchActive.current = false;
        pinchStartSpan.current = 0;
      }
    };
    const handlePointerMove = (event: PointerEvent): void => {
      const point = touchPoints.current.get(event.pointerId);
      if (!point) return;
      point.set(event.clientX, event.clientY);
      if (touchPoints.current.size !== 2) return;
      if (!pinchActive.current || pinchStartSpan.current <= 1) beginPinch();
      if (!pinchActive.current) return;

      const span = readTouchSpan(touchPoints.current);
      if (span <= 1) return;
      const requestedDistance = pinchStartDistance.current * Math.pow(
        pinchStartSpan.current / span,
        MOBILE_PINCH_ZOOM_SENSITIVITY,
      );
      const nextDistance = THREE.MathUtils.clamp(requestedDistance, minDistance, maxDistance);

      if (reducedMotion) {
        applyDistance(nextDistance);
        targetDistance.current = null;
      } else {
        activeDamping.current = MOBILE_PINCH_ZOOM_DAMPING;
        targetDistance.current = nextDistance;
      }

      // Rebase at either limit so reversing the gesture responds immediately
      // instead of consuming the overshoot accumulated beyond the clamp.
      if (nextDistance !== requestedDistance) {
        pinchStartSpan.current = span;
        pinchStartDistance.current = nextDistance;
      }
      invalidate();
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      if (!touchPoints.current.delete(event.pointerId)) return;
      pinchActive.current = false;
      pinchStartSpan.current = 0;
      pinchStartDistance.current = 0;
      if (touchPoints.current.size === 2) beginPinch();
    };
    const cancelGesture = (): void => {
      targetDistance.current = null;
      touchPoints.current.clear();
      pinchActive.current = false;
      pinchStartSpan.current = 0;
      pinchStartDistance.current = 0;
    };
    const handlePointerCancel = (event: PointerEvent): void => {
      if (!touchPoints.current.has(event.pointerId)) return;
      cancelGesture();
    };
    const handleVisibility = (): void => {
      if (ownerDocument.visibilityState === 'hidden') cancelGesture();
    };

    canvas.addEventListener('pointerdown', handlePointerDown, true);
    ownerDocument.addEventListener('pointermove', handlePointerMove, true);
    ownerDocument.addEventListener('pointerup', handlePointerEnd, true);
    ownerDocument.addEventListener('pointercancel', handlePointerCancel, true);
    ownerDocument.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', cancelGesture);
    window.addEventListener('orientationchange', cancelGesture);
    return () => {
      cancelGesture();
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      ownerDocument.removeEventListener('pointermove', handlePointerMove, true);
      ownerDocument.removeEventListener('pointerup', handlePointerEnd, true);
      ownerDocument.removeEventListener('pointercancel', handlePointerCancel, true);
      ownerDocument.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', cancelGesture);
      window.removeEventListener('orientationchange', cancelGesture);
    };
  }, [applyDistance, controlsRef, enabled, invalidate, maxDistance, minDistance, mobile, reducedMotion, renderer]);

  useFrame((_, delta) => {
    if (!enabled || reducedMotion) return;
    const controls = controlsRef.current;
    const destination = targetDistance.current;
    if (!controls || destination === null) return;

    const frameTime = Math.min(delta, 0.05);
    const distance = controls.getDistance();
    const nextDistance = THREE.MathUtils.damp(distance, destination, activeDamping.current, frameTime);
    applyDistance(nextDistance);

    if (Math.abs(nextDistance - destination) <= WHEEL_ZOOM_STOP_DISTANCE) {
      applyDistance(destination);
      targetDistance.current = null;
      return;
    }
    invalidate();
  }, -0.5);

  return null;
}
function WebGLFallback({ onFailure }: { readonly onFailure: () => void }) {
  useEffect(() => onFailure(), [onFailure]);
  return createPortal(
    <div className="webgl-fallback" role="alert"><p className="eyebrow">3D unavailable</p><h2>WebGL could not start.</h2><p>Enable hardware acceleration or open this page in a modern browser to view the vehicle.</p></div>,
    document.body,
  );
}

function canCreateWebGL2(): boolean {
  try {
    if (typeof WebGL2RenderingContext === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

class CanvasBoundary extends Component<{ readonly children: ReactNode; readonly onFailure: () => void }, { readonly failed: boolean }> {
  public override state = { failed: false };
  public static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onFailure();
    console.error('WebGL experience failed to initialize.', error, info);
  }
  public override render(): ReactNode { return this.state.failed ? <WebGLFallback onFailure={this.props.onFailure} /> : this.props.children; }
}

function WebGLCarCanvas({ modelReady, phase, viewPhase, reducedMotion, onModelReady, onWebGLFailure, onEnterComplete, onExitComplete, onOpenExteriorDoor, onExteriorDoorOpenComplete, onInteriorEnterComplete, onInteriorDoorOpenComplete, onInteriorDoorCloseComplete, onInteriorExitDoorOpenComplete, onInteriorExitComplete, onExteriorDoorCloseComplete }: Props) {
  const profile = useProfile();
  const [gpuConstrained, setGpuConstrained] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const clampedPanTarget = useRef(new THREE.Vector3());
  const panCorrection = useRef(new THREE.Vector3());
  const interactionRig = useMemo(createVehicleInteractionRig, []);
  const shot = useMemo(() => getShotSet(profile.compact, profile.landscape)[INITIAL_STORY_SHOT], [profile.compact, profile.landscape]);
  const exteriorOrbit = isExteriorOrbitEnabled(phase, viewPhase);
  const interiorOrbit = isInteriorOrbitEnabled(phase, viewPhase);
  const interactive = isStableExploreView(phase, viewPhase);
  const interiorOrbitLimits = profile.compact
    ? COMPACT_INTERIOR_ORBIT_LIMITS
    : profile.landscape
      ? SHORT_LANDSCAPE_INTERIOR_ORBIT_LIMITS
      : WIDE_INTERIOR_ORBIT_LIMITS;
  const interiorDoorOpen = phase === 'explore' && viewPhase === 'interiorDoorOpen';
  const minInteriorPolar = interiorDoorOpen
    ? interiorOrbitLimits.minPolarDoorOpen
    : interiorOrbitLimits.minPolarDoorClosed;
  const minInteriorAzimuth = interiorDoorOpen
    ? interiorOrbitLimits.minAzimuthDoorOpen
    : interiorOrbitLimits.minAzimuthDoorClosed;
  const minDistance = interiorOrbit ? 0.45 : profile.isMobile ? 3.6 : 2.9;
  // A compact viewport's transition shot is already inside the dashboard's
  // geometry envelope; keep its orbit radius short enough to avoid clipping.
  const maxInteriorDistance = profile.compact ? 0.95 : 1.2;
  const maxDistance = interiorOrbit ? maxInteriorDistance : profile.isMobile ? 15 : 10.5;
  const handleControlsChange = useCallback((): void => {
    if (!exteriorOrbit) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const clampedTarget = clampedPanTarget.current
      .copy(controls.target)
      .clamp(EXTERIOR_PAN_MIN, EXTERIOR_PAN_MAX);
    const correction = panCorrection.current.copy(clampedTarget).sub(controls.target);
    if (correction.lengthSq() <= 1e-10) return;

    // Move the camera together with its target so clamping never changes the
    // current view direction or zoom distance.
    controls.target.copy(clampedTarget);
    controls.object.position.add(correction);
  }, [exteriorOrbit]);
  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('button,a,input,select,textarea,[contenteditable="true"]')) return;
      const controls = controlsRef.current;
      if (!controls) return;
      const angleStep = event.shiftKey ? 0.18 : 0.1;
      switch (event.key) {
        case 'ArrowLeft': controls.setAzimuthalAngle(controls.getAzimuthalAngle() - angleStep); break;
        case 'ArrowRight': controls.setAzimuthalAngle(controls.getAzimuthalAngle() + angleStep); break;
        case 'ArrowUp': controls.setPolarAngle(controls.getPolarAngle() - angleStep); break;
        case 'ArrowDown': controls.setPolarAngle(controls.getPolarAngle() + angleStep); break;
        case '+': case '=': if (exteriorOrbit) controls.dollyIn(); break;
        case '-': case '_': if (exteriorOrbit) controls.dollyOut(); break;
        default: return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exteriorOrbit, interactive]);
  const canvasLabel = interiorOrbit
    ? profile.isMobile
      ? 'Interactive vehicle cockpit. Drag one finger to look around, or drag the steering wheel directly to turn it.'
      : 'Interactive vehicle cockpit. Use arrow keys or drag to look around, or drag the steering wheel directly to turn it.'
    : profile.isMobile
      ? 'Interactive 3D vehicle viewer. Drag one finger to orbit, and use two fingers to move and zoom.'
      : 'Interactive 3D vehicle viewer. Drag with the left mouse button to orbit, drag with the right mouse button to pan, and use the wheel to zoom.';
  return (
    <div className={`canvas-shell${interactive ? ' is-interactive' : ''}`} aria-hidden={!interactive} aria-label={interactive ? canvasLabel : undefined} role={interactive ? 'region' : undefined} tabIndex={interactive ? 0 : -1}>
      <CanvasBoundary onFailure={onWebGLFailure}>
        <Canvas
          dpr={gpuConstrained ? Math.min(profile.dpr, 1.5) : profile.dpr}
          frameloop="demand"
          shadows={false}
          camera={{ position: [...shot.position], fov: shot.fov, near: 0.05, far: 100 }}
          gl={{ antialias: profile.antialias, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            if (profile.modelTier !== 'desktop' && gl.capabilities.maxTextureSize <= 4096) {
              setGpuConstrained(true);
            }
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.92;
            gl.setClearColor('#e8edf2', 1);
            gl.shadowMap.enabled = false;
          }}
        >
          <color attach="background" args={['#e8edf2']} />
          <VisibilityController />
          <DecoderLifecycle />
          <ControlsInteractionReset controlsRef={controlsRef} interactive={interactive} />
          <SmoothZoomControls
            controlsRef={controlsRef}
            enabled={exteriorOrbit}
            mobile={profile.isMobile}
            minDistance={minDistance}
            maxDistance={maxDistance}
            reducedMotion={reducedMotion}
          />
          <CameraRig
            controlsRef={controlsRef}
            compact={profile.compact}
            landscape={profile.landscape}
            modelReady={modelReady}
            phase={phase}
            viewPhase={viewPhase}
            interactionRig={interactionRig}
            reducedMotion={reducedMotion}
            onEnterComplete={onEnterComplete}
            onExitComplete={onExitComplete}
            onExteriorDoorOpenComplete={onExteriorDoorOpenComplete}
            onInteriorEnterComplete={onInteriorEnterComplete}
            onInteriorDoorOpenComplete={onInteriorDoorOpenComplete}
            onInteriorDoorCloseComplete={onInteriorDoorCloseComplete}
            onInteriorExitDoorOpenComplete={onInteriorExitDoorOpenComplete}
            onInteriorExitComplete={onInteriorExitComplete}
            onExteriorDoorCloseComplete={onExteriorDoorCloseComplete}
          />
          <Suspense fallback={null}>
            <Lighting
              mobileOptimized={profile.modelTier !== 'desktop'}
              shadowResolution={profile.isMobile || profile.lowEnd ? 256 : 512}
            />
            <CarModel
              anisotropy={gpuConstrained ? Math.min(profile.anisotropy, 4) : profile.anisotropy}
              interactionRig={interactionRig}
              modelTier={profile.modelTier}
              phase={phase}
              viewPhase={viewPhase}
              onOpenExteriorDoor={onOpenExteriorDoor}
              onReady={onModelReady}
            />
          </Suspense>
          <OrbitControls
            ref={controlsRef}
            onChange={handleControlsChange}
            enabled={interactive}
            enableDamping
            dampingFactor={profile.isMobile ? 0.09 : 0.075}
            enablePan={exteriorOrbit}
            enableZoom={exteriorOrbit && !profile.isMobile}
            enableRotate
            screenSpacePanning
            panSpeed={profile.isMobile ? 0.5 : 0.7}
            mouseButtons={VIEWER_MOUSE_BUTTONS}
            touches={VIEWER_TOUCHES}
            minDistance={minDistance}
            maxDistance={maxDistance}
            minPolarAngle={interiorOrbit ? minInteriorPolar : 0.34}
            maxPolarAngle={interiorOrbit ? interiorOrbitLimits.maxPolar : Math.PI * 0.49}
            minAzimuthAngle={interiorOrbit ? minInteriorAzimuth : -Infinity}
            maxAzimuthAngle={interiorOrbit ? interiorOrbitLimits.maxAzimuth : Infinity}
            rotateSpeed={interiorOrbit ? 0.42 : profile.isMobile ? 0.52 : 0.58}
            zoomSpeed={0.65}
          />
          <CompactInteriorLookAnchor
            controlsRef={controlsRef}
            active={interiorOrbit}
            compact={profile.compact}
          />
          <InteriorOrbitLimitSync
            controlsRef={controlsRef}
            active={interiorOrbit}
            minPolar={minInteriorPolar}
            maxPolar={interiorOrbitLimits.maxPolar}
            minAzimuth={minInteriorAzimuth}
            maxAzimuth={interiorOrbitLimits.maxAzimuth}
          />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}

export function CarCanvas(props: Props) {
  const [webgl2Available] = useState(canCreateWebGL2);
  return webgl2Available
    ? <WebGLCarCanvas {...props} />
    : <WebGLFallback onFailure={props.onWebGLFailure} />;
}

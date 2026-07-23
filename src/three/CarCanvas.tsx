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
const VIEWER_MOUSE_BUTTONS = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
const VIEWER_TOUCHES = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
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

interface SmoothWheelZoomProps {
  readonly controlsRef: RefObject<OrbitControlsImpl | null>;
  readonly enabled: boolean;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly reducedMotion: boolean;
}

function SmoothWheelZoom({ controlsRef, enabled, minDistance, maxDistance, reducedMotion }: SmoothWheelZoomProps) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const targetDistance = useRef<number | null>(null);
  const cameraOffset = useRef(new THREE.Vector3());

  const applyDistance = useCallback((nextDistance: number): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    const offset = cameraOffset.current.copy(controls.object.position).sub(controls.target);
    if (offset.lengthSq() <= 1e-10) return;
    controls.object.position.copy(controls.target).add(offset.setLength(nextDistance));
    controls.update();
  }, [controlsRef]);

  useEffect(() => {
    targetDistance.current = null;
    if (!enabled) return;
    const canvas = renderer.domElement;
    const controls = controlsRef.current;
    const cancelWheelZoom = (): void => {
      targetDistance.current = null;
    };
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      // OrbitControls applies wheel zoom immediately. Capture and stop only the
      // wheel event so touch pinch and middle-button dolly keep their behavior.
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

  useFrame((_, delta) => {
    if (!enabled || reducedMotion) return;
    const controls = controlsRef.current;
    const destination = targetDistance.current;
    if (!controls || destination === null) return;

    const frameTime = Math.min(delta, 0.05);
    const distance = controls.getDistance();
    const nextDistance = THREE.MathUtils.damp(distance, destination, WHEEL_ZOOM_DAMPING, frameTime);
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
  const minDistance = interiorOrbit ? 0.45 : profile.isMobile ? 3.6 : 2.9;
  const maxDistance = interiorOrbit ? 1.2 : profile.isMobile ? 13.5 : 10.5;
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
    ? 'Interactive vehicle cockpit. Use arrow keys or drag to look around.'
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
          <SmoothWheelZoom
            controlsRef={controlsRef}
            enabled={exteriorOrbit}
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
            dampingFactor={0.075}
            enablePan={exteriorOrbit}
            enableZoom={exteriorOrbit}
            enableRotate
            screenSpacePanning
            panSpeed={profile.isMobile ? 0.55 : 0.7}
            mouseButtons={VIEWER_MOUSE_BUTTONS}
            touches={VIEWER_TOUCHES}
            minDistance={minDistance}
            maxDistance={maxDistance}
            minPolarAngle={interiorOrbit ? 0.82 : 0.34}
            maxPolarAngle={interiorOrbit ? 1.68 : Math.PI * 0.49}
            minAzimuthAngle={interiorOrbit ? 2.48 : -Infinity}
            maxAzimuthAngle={interiorOrbit ? 3.13 : Infinity}
            rotateSpeed={interiorOrbit ? 0.42 : 0.58}
            zoomSpeed={0.65}
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

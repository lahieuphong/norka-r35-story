import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraRig } from './CameraRig';
import { CarModel, releaseKTX2Loader, type ModelReadyDetails } from './CarModel';
import { readDeviceProfile, type DeviceProfile } from './deviceProfile';
import type { ExplorePhase } from './experienceTypes';
import { Lighting } from './Lighting';
import { getShotSet, INITIAL_STORY_SHOT } from './cameraShots';

interface Props {
  readonly modelReady: boolean;
  readonly phase: ExplorePhase;
  readonly reducedMotion: boolean;
  readonly onModelReady: (details: ModelReadyDetails) => void;
  readonly onWebGLFailure: () => void;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
}
const KTX2_RELEASE_TIMERS = new WeakMap<THREE.WebGLRenderer, number>();
function useProfile(): DeviceProfile {
  const [profile, setProfile] = useState(readDeviceProfile);
  useEffect(() => {
    let frame = 0;
    const update = (): void => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setProfile(readDeviceProfile())); };
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
function KTX2Lifecycle() {
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    const pendingRelease = KTX2_RELEASE_TIMERS.get(renderer);
    if (pendingRelease !== undefined) {
      window.clearTimeout(pendingRelease);
      KTX2_RELEASE_TIMERS.delete(renderer);
    }
    return () => {
      // StrictMode immediately remounts and cancels this task. A real Canvas
      // teardown releases a loader even when CarModel was still suspended.
      const timer = window.setTimeout(() => {
        releaseKTX2Loader(renderer);
        KTX2_RELEASE_TIMERS.delete(renderer);
      }, 0);
      KTX2_RELEASE_TIMERS.set(renderer, timer);
    };
  }, [renderer]);
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

function WebGLCarCanvas({ modelReady, phase, reducedMotion, onModelReady, onWebGLFailure, onEnterComplete, onExitComplete }: Props) {
  const profile = useProfile();
  const [modelPreference, setModelPreference] = useState(profile.useMobileModel);
  const [modelSelectionReady, setModelSelectionReady] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const shot = useMemo(() => getShotSet(profile.compact, profile.landscape)[INITIAL_STORY_SHOT], [profile.compact, profile.landscape]);
  const interactive = phase === 'explore';
  const handleModelReady = useCallback((details: ModelReadyDetails): void => {
    setModelSelectionReady(true);
    onModelReady(details);
  }, [onModelReady]);
  useEffect(() => {
    // Finish the current GLTF request before changing variants. KTX2Loader can
    // then release its worker before the next model starts, avoiding two
    // overlapping transcode pools during responsive QA.
    if (!modelSelectionReady || modelPreference === profile.useMobileModel) return;
    setModelSelectionReady(false);
    setModelPreference(profile.useMobileModel);
  }, [modelPreference, modelSelectionReady, profile.useMobileModel]);
  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const controls = controlsRef.current;
      if (!controls) return;
      const angleStep = event.shiftKey ? 0.18 : 0.1;
      switch (event.key) {
        case 'ArrowLeft': controls.setAzimuthalAngle(controls.getAzimuthalAngle() - angleStep); break;
        case 'ArrowRight': controls.setAzimuthalAngle(controls.getAzimuthalAngle() + angleStep); break;
        case 'ArrowUp': controls.setPolarAngle(controls.getPolarAngle() - angleStep); break;
        case 'ArrowDown': controls.setPolarAngle(controls.getPolarAngle() + angleStep); break;
        case '+': case '=': controls.dollyIn(); break;
        case '-': case '_': controls.dollyOut(); break;
        default: return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [interactive]);
  return (
    <div className={`canvas-shell${interactive ? ' is-interactive' : ''}`} aria-hidden={!interactive} aria-label={interactive ? 'Interactive 3D vehicle viewer. Use arrow keys to orbit and plus or minus to zoom.' : undefined} role={interactive ? 'region' : undefined} tabIndex={interactive ? 0 : -1}>
      <CanvasBoundary onFailure={onWebGLFailure}>
        <Canvas
          dpr={profile.dpr}
          frameloop="demand"
          shadows={false}
          camera={{ position: [...shot.position], fov: shot.fov, near: 0.05, far: 100 }}
          gl={{ antialias: profile.antialias, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.92;
            gl.setClearColor('#e8edf2', 1);
            gl.shadowMap.enabled = false;
          }}
        >
          <color attach="background" args={['#e8edf2']} />
          <VisibilityController />
          <KTX2Lifecycle />
          <CameraRig controlsRef={controlsRef} compact={profile.compact} landscape={profile.landscape} modelReady={modelReady} phase={phase} reducedMotion={reducedMotion} onEnterComplete={onEnterComplete} onExitComplete={onExitComplete} />
          <Suspense fallback={null}>
            <Lighting shadowResolution={profile.lowEnd ? 256 : 512} />
            <CarModel
              anisotropy={profile.anisotropy}
              preferMobile={modelPreference}
              onReady={handleModelReady}
            />
          </Suspense>
          <OrbitControls ref={controlsRef} enabled={interactive} enableDamping dampingFactor={0.075} enablePan={false} enableZoom enableRotate minDistance={profile.isMobile ? 4.4 : 3.4} maxDistance={profile.isMobile ? 13.5 : 10.5} minPolarAngle={0.34} maxPolarAngle={Math.PI * 0.49} rotateSpeed={0.58} zoomSpeed={0.72} />
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

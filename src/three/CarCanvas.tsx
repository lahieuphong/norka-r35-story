import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraRig } from './CameraRig';
import { CarModel, type ModelReadyDetails } from './CarModel';
import type { ExplorePhase } from './experienceTypes';
import { Lighting } from './Lighting';
import { getShotSet } from './cameraShots';

interface Props {
  readonly modelReady: boolean;
  readonly phase: ExplorePhase;
  readonly reducedMotion: boolean;
  readonly onModelReady: (details: ModelReadyDetails) => void;
  readonly onWebGLFailure: () => void;
  readonly onEnterComplete: () => void;
  readonly onExitComplete: () => void;
}
interface Profile { readonly isMobile: boolean; readonly lowEnd: boolean; readonly dpr: number; }
function readProfile(): Profile {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
  const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  const lowEnd = isMobile && (lowMemory || lowCpu);
  const cap = lowEnd ? 0.9 : isMobile ? 1 : 1.5;
  return { isMobile, lowEnd, dpr: Math.min(window.devicePixelRatio || 1, cap) };
}
function useProfile(): Profile {
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => {
    let frame = 0;
    const update = (): void => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setProfile(readProfile())); };
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
      else { setFrameloop('always'); invalidate(); }
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [invalidate, setFrameloop]);
  return null;
}
function StaticShadowMap({ enabled, isMobile }: { readonly enabled: boolean; readonly isMobile: boolean }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!enabled) return;
    const previousAutoUpdate = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => {
      gl.shadowMap.autoUpdate = previousAutoUpdate;
      gl.shadowMap.needsUpdate = true;
      invalidate();
    };
  }, [enabled, gl, invalidate, isMobile]);
  return null;
}
function WebGLFallback({ onFailure }: { readonly onFailure: () => void }) {
  useEffect(() => onFailure(), [onFailure]);
  return createPortal(
    <div className="webgl-fallback" role="alert"><p className="eyebrow">3D unavailable</p><h2>WebGL could not start.</h2><p>Enable hardware acceleration or open this page in a modern browser to view the vehicle.</p></div>,
    document.body,
  );
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

export function CarCanvas({ modelReady, phase, reducedMotion, onModelReady, onWebGLFailure, onEnterComplete, onExitComplete }: Props) {
  const profile = useProfile();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const shot = useMemo(() => getShotSet(profile.isMobile).hero, [profile.isMobile]);
  const interactive = phase === 'explore';
  return (
    <div className={`canvas-shell${interactive ? ' is-interactive' : ''}`} aria-hidden={!interactive}>
      <CanvasBoundary onFailure={onWebGLFailure}>
        <Canvas
          dpr={profile.dpr}
          shadows={!profile.lowEnd}
          camera={{ position: [...shot.position], fov: shot.fov, near: 0.05, far: 100 }}
          gl={{ antialias: !profile.lowEnd, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.92;
            gl.setClearColor('#08090b', 1);
            gl.shadowMap.enabled = !profile.lowEnd;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <color attach="background" args={['#08090b']} />
          <VisibilityController />
          <StaticShadowMap enabled={modelReady && !profile.lowEnd} isMobile={profile.isMobile} />
          <CameraRig controlsRef={controlsRef} modelReady={modelReady} phase={phase} reducedMotion={reducedMotion} onEnterComplete={onEnterComplete} onExitComplete={onExitComplete} />
          <Suspense fallback={null}>
            <Lighting isMobile={profile.isMobile} />
            <CarModel onReady={onModelReady} />
          </Suspense>
          <OrbitControls ref={controlsRef} enabled={interactive} enableDamping dampingFactor={0.075} enablePan={false} enableZoom enableRotate minDistance={profile.isMobile ? 4.4 : 3.4} maxDistance={profile.isMobile ? 13.5 : 10.5} minPolarAngle={0.34} maxPolarAngle={Math.PI * 0.49} rotateSpeed={0.58} zoomSpeed={0.72} />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}

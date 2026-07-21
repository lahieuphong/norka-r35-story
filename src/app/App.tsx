import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Attribution } from '../components/Attribution';
import { ExploreOverlay } from '../components/ExploreOverlay';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/LoadingScreen';
import { StorySection } from '../components/StorySection';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CarCanvas } from '../three/CarCanvas';
import { DEFAULT_MODEL_ATTRIBUTION, type ModelAttribution, type ModelReadyDetails } from '../three/CarModel';
import type { ExplorePhase } from '../three/experienceTypes';
import { disableStoryScrollTriggers, enableStoryScrollTriggers } from '../three/storyState';

const CameraDebugHUD = import.meta.env.DEV ? lazy(() => import('../components/CameraDebugHUD')) : null;
interface BodySnapshot { readonly position: string; readonly top: string; readonly left: string; readonly right: string; readonly width: string; readonly overflow: string; }

export function App() {
  const reducedMotion = useReducedMotion();
  const [modelReady, setModelReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [modelAttribution, setModelAttribution] = useState<ModelAttribution>(DEFAULT_MODEL_ATTRIBUTION);
  const [phase, setPhase] = useState<ExplorePhase>('story');
  const lockedY = useRef(0);
  const exploreButtonRef = useRef<HTMLButtonElement>(null);
  const bodySnapshot = useRef<BodySnapshot | null>(null);
  const resetAfterLoad = useRef(false);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
    return () => document.documentElement.classList.remove('reduced-motion');
  }, [reducedMotion]);
  useEffect(() => {
    if (!modelReady || resetAfterLoad.current) return;
    resetAfterLoad.current = true;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [modelReady]);

  const lockScroll = useCallback((): void => {
    if (bodySnapshot.current) return;
    const body = document.body;
    lockedY.current = window.scrollY;
    bodySnapshot.current = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed'; body.style.top = `-${lockedY.current}px`; body.style.left = '0'; body.style.right = '0'; body.style.width = '100%'; body.style.overflow = 'hidden';
    document.documentElement.classList.add('is-explore-locked');
  }, []);
  const unlockScroll = useCallback((): void => {
    const snapshot = bodySnapshot.current; if (!snapshot) return;
    const body = document.body;
    body.style.position = snapshot.position; body.style.top = snapshot.top; body.style.left = snapshot.left; body.style.right = snapshot.right; body.style.width = snapshot.width; body.style.overflow = snapshot.overflow;
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    bodySnapshot.current = null; root.classList.remove('is-explore-locked'); root.style.scrollBehavior = 'auto'; window.scrollTo(0, lockedY.current); root.style.scrollBehavior = previousScrollBehavior;
  }, []);
  useEffect(() => () => unlockScroll(), [unlockScroll]);

  const onModelReady = useCallback((details: ModelReadyDetails): void => { setModelAttribution(details.attribution); setModelReady(true); }, []);
  const onWebGLFailure = useCallback((): void => setWebglFailed(true), []);
  const enterExplore = useCallback((): void => {
    if (!modelReady || phase !== 'story') return;
    disableStoryScrollTriggers(); lockScroll(); setPhase('entering');
  }, [lockScroll, modelReady, phase]);
  const enterComplete = useCallback((): void => setPhase((value) => value === 'entering' ? 'explore' : value), []);
  const exitExplore = useCallback((): void => setPhase((value) => value === 'explore' ? 'exiting' : value), []);
  const exitComplete = useCallback((): void => {
    unlockScroll();
    requestAnimationFrame(() => {
      enableStoryScrollTriggers();
      setPhase('story');
      requestAnimationFrame(() => exploreButtonRef.current?.focus());
    });
  }, [unlockScroll]);
  const exploreActive = phase !== 'story';

  return (
    <div className={`experience${exploreActive ? ' experience--explore' : ''}`}>
      <a className="skip-link" href="#hero" tabIndex={exploreActive ? -1 : undefined}>Skip to the story</a>
      <CarCanvas modelReady={modelReady} phase={phase} reducedMotion={reducedMotion} onModelReady={onModelReady} onWebGLFailure={onWebGLFailure} onEnterComplete={enterComplete} onExitComplete={exitComplete} />
      <div className="visual-vignette" aria-hidden="true" />
      <Header exploreActive={exploreActive} />
      <main className="story-root" data-story-root inert={exploreActive}>
        <StorySection id="hero" index="01" eyebrow="NORKA R35" heading="Engineered Beyond Limits" body="A sculpted performance machine built around speed, precision and uncompromising presence." ctaLabel="Discover the machine" ctaHref="#performance" />
        <StorySection id="performance" index="02" eyebrow="Performance in every line" heading="Performance" body="A wide stance, aggressive cooling and track-inspired engineering give the machine its unmistakable purpose." />
        <StorySection id="aerodynamics" index="03" eyebrow="Sculpted by airflow" heading="Aerodynamics" body="Every surface, vent and carbon detail is shaped to manage airflow and create a planted, purposeful silhouette." align="right" />
        <StorySection id="rear-signature" index="04" eyebrow="Designed to leave a mark" heading="Rear Signature" body="Four circular tail lamps, a towering rear wing and a sculpted diffuser create an unmistakable departing view." align="right" />
        <StorySection id="precision" index="05" eyebrow="Control at every corner" heading="Precision" body="Lightweight wheels, performance braking and a tuned suspension translate power into controlled motion." />
        <StorySection id="interior" index="06" eyebrow="Built around the driver" heading="Cockpit" body="Step through the glass into a focused cabin of leather, carbon, instrumentation and driver-first controls." />
        <StorySection id="steering" index="07" eyebrow="Command in every touch" heading="Steering" body="A compact performance wheel places the essential controls and shift inputs directly beneath the driver's hands." />
        <StorySection id="instruments" index="08" eyebrow="Information at a glance" heading="Digital Cluster" body="Layered gauges and illuminated displays keep the car's vital information in the driver's natural line of sight." align="right" />
        <StorySection id="front-seats" index="09" eyebrow="Shaped for the drive" heading="Front Seats" body="Sculpted front seats pair pronounced bolsters with a low, driver-focused seating position." align="right" />
        <StorySection id="rear-seats" index="10" eyebrow="Performance with space" heading="Rear Seats" body="A compact second row carries the cabin's dark, purposeful materials beyond the front cockpit." />
        <StorySection id="rear-seat-detail" index="11" eyebrow="A closer look" heading="Second Row" body="A lower camera pass reveals both sculpted rear cushions, their individual bolsters and the shared center console." align="right" />
        <StorySection id="explore" index="12" eyebrow="Interactive" heading="3D Experience" body="Inspect the vehicle from every angle." ctaLabel="Explore the car" onCta={enterExplore} ctaDisabled={!modelReady || phase !== 'story'} ctaButtonRef={exploreButtonRef}><Attribution model={modelAttribution} /></StorySection>
      </main>
      <ExploreOverlay phase={phase} onExit={exitExplore} />
      <LoadingScreen sceneReady={modelReady} failed={webglFailed} />
      <span className="sr-only" aria-live="polite">{phase === 'explore' ? 'Interactive 3D controls enabled.' : ''}</span>
      {CameraDebugHUD ? <Suspense fallback={null}><CameraDebugHUD /></Suspense> : null}
    </div>
  );
}

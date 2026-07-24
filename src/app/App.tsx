import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Attribution } from '../components/Attribution';
import { ExploreCtaHint, type CtaHintIntent } from '../components/ExploreCtaHint';
import { ExploreOverlay } from '../components/ExploreOverlay';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/LoadingScreen';
import { StorySection } from '../components/StorySection';
import { PORTAL_TRANSITION_TIMING, StoryReturnTransition, type StoryReturnPhase } from '../components/StoryReturnTransition';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CarCanvas } from '../three/CarCanvas';
import { DEFAULT_MODEL_ATTRIBUTION, type ModelAttribution, type ModelReadyDetails } from '../three/CarModel';
import type { ExplorePhase, ExploreViewPhase } from '../three/experienceTypes';
import { subscribeStoryProgress } from '../three/storyProgress';
import { disableStoryScrollTriggers, enableStoryScrollTriggers } from '../three/storyState';

const CameraDebugHUD = import.meta.env.DEV ? lazy(() => import('../components/CameraDebugHUD')) : null;
const FINAL_HINT_DWELL_MS = 240;
const FINAL_HINT_RETRY_MS = 80;
const FINAL_HINT_MAX_ATTEMPTS = 6;
interface BodySnapshot { readonly position: string; readonly top: string; readonly left: string; readonly right: string; readonly width: string; readonly overflow: string; }
type StoryReturnState = 'idle' | StoryReturnPhase;

function isCtaReadyForHint(button: HTMLButtonElement, icon: SVGSVGElement): boolean {
  const copy = button.closest<HTMLElement>('[data-story-copy]');
  const buttonRect = button.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  const buttonStyle = window.getComputedStyle(button);
  const copyStyle = copy ? window.getComputedStyle(copy) : null;

  return !button.disabled
    && window.innerHeight >= 280
    && buttonRect.width > 0
    && buttonRect.height > 0
    && iconRect.width > 0
    && iconRect.height > 0
    && buttonRect.bottom > 0
    && buttonRect.top < window.innerHeight
    && buttonRect.right > 0
    && buttonRect.left < window.innerWidth
    && buttonStyle.display !== 'none'
    && buttonStyle.visibility !== 'hidden'
    && (!copyStyle || (copyStyle.display !== 'none' && copyStyle.visibility !== 'hidden' && Number(copyStyle.opacity) >= 0.85));
}

function isStoryFooterVisibleAtBottom(): boolean {
  const scroller = document.scrollingElement ?? document.documentElement;
  const distanceToBottom = scroller.scrollHeight - (window.scrollY + window.innerHeight);
  if (distanceToBottom > 4) return false;

  const attribution = document.querySelector<HTMLElement>('#hero .attribution');
  if (!attribution || !attribution.textContent?.trim()) return false;
  const rect = attribution.getBoundingClientRect();
  const style = window.getComputedStyle(attribution);
  return rect.width > 0
    && rect.height > 0
    && rect.top < window.innerHeight
    && rect.bottom > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity) >= 0.1;
}

export function App() {
  const reducedMotion = useReducedMotion();
  const [modelReady, setModelReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [modelAttribution, setModelAttribution] = useState<ModelAttribution>(DEFAULT_MODEL_ATTRIBUTION);
  const [phase, setPhase] = useState<ExplorePhase>('story');
  const [viewPhase, setViewPhase] = useState<ExploreViewPhase>('exterior');
  const [activeCtaHint, setActiveCtaHint] = useState<CtaHintIntent | null>(null);
  const [storyReturnState, setStoryReturnState] = useState<StoryReturnState>('idle');
  const phaseRef = useRef<ExplorePhase>('story');
  const viewPhaseRef = useRef<ExploreViewPhase>('exterior');
  const storyReturnStateRef = useRef<StoryReturnState>('idle');
  const activeCtaHintRef = useRef<CtaHintIntent | null>(null);
  const lockedY = useRef(0);
  const exploreButtonRef = useRef<HTMLButtonElement>(null);
  const exploreIconRef = useRef<SVGSVGElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const returnIconRef = useRef<SVGSVGElement>(null);
  const bodySnapshot = useRef<BodySnapshot | null>(null);
  const resetAfterLoad = useRef(false);
  const resumeStoryAfterExit = useRef(false);
  const focusStoryStartAfterReturn = useRef(false);
  const initialRevealFinished = useRef(false);
  const finalHintPresented = useRef(false);
  const latestStoryIndex = useRef(1);
  const pendingFinalHintTimer = useRef<number | null>(null);

  const updateCtaHint = useCallback((nextHint: CtaHintIntent | null): void => {
    activeCtaHintRef.current = nextHint;
    setActiveCtaHint(nextHint);
  }, []);
  const cancelPendingFinalHint = useCallback((): void => {
    if (pendingFinalHintTimer.current === null) return;
    window.clearTimeout(pendingFinalHintTimer.current);
    pendingFinalHintTimer.current = null;
  }, []);

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
  useEffect(() => {
    const queueFinalHint = (finalIndex: number, attempt = 0): void => {
      cancelPendingFinalHint();
      const delay = attempt === 0
        ? (reducedMotion ? FINAL_HINT_RETRY_MS : FINAL_HINT_DWELL_MS)
        : FINAL_HINT_RETRY_MS;
      pendingFinalHintTimer.current = window.setTimeout(() => {
        pendingFinalHintTimer.current = null;
        if (
          latestStoryIndex.current !== finalIndex
          || !isStoryFooterVisibleAtBottom()
          || !initialRevealFinished.current
          || finalHintPresented.current
          || phaseRef.current !== 'story'
          || storyReturnStateRef.current !== 'idle'
          || activeCtaHintRef.current !== null
          || webglFailed
        ) return;

        const button = returnButtonRef.current;
        const icon = returnIconRef.current;
        const anotherDialogOpen = document.querySelector<HTMLDialogElement>('dialog[open]') !== null;
        if (!button || !icon || anotherDialogOpen || !isCtaReadyForHint(button, icon)) {
          if (attempt < FINAL_HINT_MAX_ATTEMPTS) queueFinalHint(finalIndex, attempt + 1);
          return;
        }
        updateCtaHint('return');
      }, delay);
    };

    const unsubscribe = subscribeStoryProgress(({ current, total }) => {
      latestStoryIndex.current = current;
      if (current !== total || !isStoryFooterVisibleAtBottom()) {
        cancelPendingFinalHint();
        return;
      }
      if (finalHintPresented.current || pendingFinalHintTimer.current !== null) return;
      if (
        !initialRevealFinished.current
        || phaseRef.current !== 'story'
        || storyReturnStateRef.current !== 'idle'
        || activeCtaHintRef.current !== null
        || webglFailed
      ) return;
      queueFinalHint(total);
    });

    return () => {
      unsubscribe();
      cancelPendingFinalHint();
    };
  }, [cancelPendingFinalHint, reducedMotion, updateCtaHint, webglFailed]);
  useEffect(() => {
    if (storyReturnState !== 'covering') return;
    let resetFrame = 0;
    let revealFrame = 0;
    let scrollBehaviorRoot: HTMLElement | null = null;
    let previousScrollBehavior = '';
    const restoreScrollBehavior = (): void => {
      if (!scrollBehaviorRoot) return;
      scrollBehaviorRoot.style.scrollBehavior = previousScrollBehavior;
      scrollBehaviorRoot = null;
    };
    const timer = window.setTimeout(() => {
      const root = document.documentElement;
      scrollBehaviorRoot = root;
      previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      root.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#explore`);

      resetFrame = requestAnimationFrame(() => {
        root.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0, 0);
        enableStoryScrollTriggers();
        revealFrame = requestAnimationFrame(() => {
          root.scrollTop = 0;
          document.body.scrollTop = 0;
          window.scrollTo(0, 0);
          restoreScrollBehavior();
          storyReturnStateRef.current = 'revealing';
          setStoryReturnState('revealing');
        });
      });
    }, reducedMotion ? PORTAL_TRANSITION_TIMING.reducedCover : PORTAL_TRANSITION_TIMING.cover);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(resetFrame);
      cancelAnimationFrame(revealFrame);
      restoreScrollBehavior();
    };
  }, [reducedMotion, storyReturnState]);
  useEffect(() => {
    if (storyReturnState !== 'revealing') return;
    const timer = window.setTimeout(() => {
      focusStoryStartAfterReturn.current = true;
      storyReturnStateRef.current = 'idle';
      setStoryReturnState('idle');
    }, reducedMotion ? PORTAL_TRANSITION_TIMING.reducedReveal : PORTAL_TRANSITION_TIMING.reveal);

    return () => window.clearTimeout(timer);
  }, [reducedMotion, storyReturnState]);
  useLayoutEffect(() => {
    if (storyReturnState !== 'idle' || !focusStoryStartAfterReturn.current) return;
    focusStoryStartAfterReturn.current = false;
    exploreButtonRef.current?.focus({ preventScroll: true });
    const refreshFrame = requestAnimationFrame(() => {
      // The transition temporarily hides the browser scrollbar. Refresh once
      // that class has been removed so responsive shot measurements stay exact.
      if (phaseRef.current !== 'story' || storyReturnStateRef.current !== 'idle') return;
      enableStoryScrollTriggers();
    });
    return () => cancelAnimationFrame(refreshFrame);
  }, [storyReturnState]);

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
  useLayoutEffect(() => {
    if (phase !== 'story' || !resumeStoryAfterExit.current) return;
    resumeStoryAfterExit.current = false;
    unlockScroll();
    let focusFrame = 0;
    const resumeFrame = requestAnimationFrame(() => {
      enableStoryScrollTriggers();
      focusFrame = requestAnimationFrame(() => exploreButtonRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(resumeFrame);
      cancelAnimationFrame(focusFrame);
    };
  }, [phase, unlockScroll]);
  useEffect(() => () => unlockScroll(), [unlockScroll]);

  const onModelReady = useCallback((details: ModelReadyDetails): void => { setModelAttribution(details.attribution); setModelReady(true); }, []);
  const onWebGLFailure = useCallback((): void => {
    cancelPendingFinalHint();
    updateCtaHint(null);
    setWebglFailed(true);
  }, [cancelPendingFinalHint, updateCtaHint]);
  const dismissCtaHint = useCallback((): void => updateCtaHint(null), [updateCtaHint]);
  const handleCtaHintPresented = useCallback((): void => {
    if (activeCtaHintRef.current === 'return') finalHintPresented.current = true;
  }, []);
  const revealExploreHint = useCallback((): void => {
    if (
      phaseRef.current !== 'story'
      || webglFailed
      || window.scrollY > 4
      || exploreButtonRef.current?.disabled
      || !exploreIconRef.current
    ) return;
    updateCtaHint('explore');
  }, [updateCtaHint, webglFailed]);
  const finishInitialReveal = useCallback((): void => {
    requestAnimationFrame(() => {
      if (phaseRef.current !== 'story' || storyReturnStateRef.current !== 'idle') return;
      enableStoryScrollTriggers();
      initialRevealFinished.current = true;
      revealExploreHint();
    });
  }, [revealExploreHint]);
  const enterExplore = useCallback((): void => {
    if (!modelReady || phaseRef.current !== 'story' || storyReturnStateRef.current !== 'idle') return;
    cancelPendingFinalHint();
    updateCtaHint(null);
    phaseRef.current = 'entering';
    disableStoryScrollTriggers(); lockScroll(); setPhase('entering');
  }, [cancelPendingFinalHint, lockScroll, modelReady, updateCtaHint]);
  const returnToBeginning = useCallback((): void => {
    if (phaseRef.current !== 'story' || storyReturnStateRef.current !== 'idle') return;
    cancelPendingFinalHint();
    storyReturnStateRef.current = 'covering';
    updateCtaHint(null);
    disableStoryScrollTriggers();
    setStoryReturnState('covering');
  }, [cancelPendingFinalHint, updateCtaHint]);
  const enterComplete = useCallback((): void => {
    if (phaseRef.current !== 'entering') return;
    phaseRef.current = 'explore';
    setPhase('explore');
  }, []);
  const exitExplore = useCallback((): void => {
    if (phaseRef.current !== 'explore' || viewPhaseRef.current !== 'exterior') return;
    phaseRef.current = 'exiting';
    setPhase('exiting');
  }, []);
  const openExteriorDoor = useCallback((): void => {
    if (phaseRef.current !== 'explore' || viewPhaseRef.current !== 'exterior') return;
    viewPhaseRef.current = 'openingExteriorDoor';
    setViewPhase('openingExteriorDoor');
  }, []);
  const exteriorDoorOpenComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'openingExteriorDoor') return;
    viewPhaseRef.current = 'exteriorDoorOpen';
    setViewPhase('exteriorDoorOpen');
  }, []);
  const enterInterior = useCallback((): void => {
    if (phaseRef.current !== 'explore' || viewPhaseRef.current !== 'exteriorDoorOpen') return;
    viewPhaseRef.current = 'enteringInterior';
    setViewPhase('enteringInterior');
  }, []);
  const interiorEnterComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'enteringInterior') return;
    viewPhaseRef.current = 'interiorDoorOpen';
    setViewPhase('interiorDoorOpen');
  }, []);
  const closeInteriorDoor = useCallback((): void => {
    if (phaseRef.current !== 'explore' || viewPhaseRef.current !== 'interiorDoorOpen') return;
    viewPhaseRef.current = 'closingInteriorDoor';
    setViewPhase('closingInteriorDoor');
  }, []);
  const interiorDoorCloseComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'closingInteriorDoor') return;
    viewPhaseRef.current = 'interior';
    setViewPhase('interior');
  }, []);
  const openInteriorDoor = useCallback((): void => {
    if (phaseRef.current !== 'explore' || viewPhaseRef.current !== 'interior') return;
    viewPhaseRef.current = 'openingInteriorDoor';
    setViewPhase('openingInteriorDoor');
  }, []);
  const interiorDoorOpenComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'openingInteriorDoor') return;
    viewPhaseRef.current = 'interiorDoorOpen';
    setViewPhase('interiorDoorOpen');
  }, []);
  const exitInterior = useCallback((): void => {
    if (phaseRef.current !== 'explore') return;
    if (viewPhaseRef.current === 'interior') {
      viewPhaseRef.current = 'openingDoorForExit';
      setViewPhase('openingDoorForExit');
    } else if (viewPhaseRef.current === 'interiorDoorOpen') {
      viewPhaseRef.current = 'exitingInterior';
      setViewPhase('exitingInterior');
    }
  }, []);
  const interiorExitDoorOpenComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'openingDoorForExit') return;
    viewPhaseRef.current = 'exitingInterior';
    setViewPhase('exitingInterior');
  }, []);
  const interiorExitComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'exitingInterior') return;
    viewPhaseRef.current = 'exteriorDoorOpenAfterExit';
    setViewPhase('exteriorDoorOpenAfterExit');
  }, []);
  const closeExteriorDoor = useCallback((): void => {
    if (phaseRef.current !== 'explore'
      || (viewPhaseRef.current !== 'exteriorDoorOpen'
        && viewPhaseRef.current !== 'exteriorDoorOpenAfterExit')) return;
    viewPhaseRef.current = 'closingExteriorDoor';
    setViewPhase('closingExteriorDoor');
  }, []);
  const exteriorDoorCloseComplete = useCallback((): void => {
    if (viewPhaseRef.current !== 'closingExteriorDoor') return;
    viewPhaseRef.current = 'exterior';
    setViewPhase('exterior');
  }, []);
  const exitComplete = useCallback((): void => {
    if (phaseRef.current !== 'exiting') return;
    resumeStoryAfterExit.current = true;
    phaseRef.current = 'story';
    viewPhaseRef.current = 'exterior';
    setViewPhase('exterior');
    setPhase('story');
  }, []);
  const exploreActive = phase !== 'story';
  const storyReturnActive = storyReturnState !== 'idle';

  return (
    <div className={`experience${exploreActive ? ' experience--explore' : ''}${storyReturnActive ? ` experience--story-return experience--story-return-${storyReturnState}` : ''}`} aria-busy={storyReturnActive || undefined}>
      <a className="skip-link" href="#explore" tabIndex={exploreActive || storyReturnActive ? -1 : undefined}>Skip to the story</a>
      <CarCanvas
        modelReady={modelReady}
        phase={phase}
        viewPhase={viewPhase}
        reducedMotion={reducedMotion}
        onModelReady={onModelReady}
        onWebGLFailure={onWebGLFailure}
        onEnterComplete={enterComplete}
        onExitComplete={exitComplete}
        onOpenExteriorDoor={openExteriorDoor}
        onExteriorDoorOpenComplete={exteriorDoorOpenComplete}
        onInteriorEnterComplete={interiorEnterComplete}
        onInteriorDoorOpenComplete={interiorDoorOpenComplete}
        onInteriorDoorCloseComplete={interiorDoorCloseComplete}
        onInteriorExitDoorOpenComplete={interiorExitDoorOpenComplete}
        onInteriorExitComplete={interiorExitComplete}
        onExteriorDoorCloseComplete={exteriorDoorCloseComplete}
      />
      <div className="visual-vignette" aria-hidden="true" />
      <Header exploreActive={exploreActive} />
      <main className="story-root" data-story-root inert={exploreActive || storyReturnActive} aria-busy={storyReturnActive || undefined}>
        <StorySection id="explore" index="01" eyebrow="Interactive" heading="3D Experience" body="Inspect the vehicle from every angle." ctaLabel="Explore the car" onCta={enterExplore} ctaDisabled={!modelReady || phase !== 'story'} ctaButtonRef={exploreButtonRef} ctaIconRef={exploreIconRef} />
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
        <StorySection id="hero" index="12" eyebrow="NORKA R35" heading="Engineered Beyond Limits" body="A sculpted performance machine built around speed, precision and uncompromising presence." ctaLabel="Return to the beginning" onCta={returnToBeginning} ctaIcon="return" ctaDisabled={storyReturnActive} ctaBusy={storyReturnActive} ctaButtonRef={returnButtonRef} ctaIconRef={returnIconRef}><Attribution model={modelAttribution} /></StorySection>
      </main>
      {storyReturnState !== 'idle' ? <StoryReturnTransition phase={storyReturnState} /> : null}
      <ExploreCtaHint
        visible={activeCtaHint !== null && phase === 'story' && !webglFailed && !storyReturnActive}
        intent={activeCtaHint ?? 'explore'}
        ctaButtonRef={activeCtaHint === 'return' ? returnButtonRef : exploreButtonRef}
        ctaIconRef={activeCtaHint === 'return' ? returnIconRef : exploreIconRef}
        onDismiss={dismissCtaHint}
        onPresented={handleCtaHintPresented}
      />
      <ExploreOverlay
        phase={phase}
        viewPhase={viewPhase}
        onExit={exitExplore}
        onEnterInterior={enterInterior}
        onOpenInteriorDoor={openInteriorDoor}
        onCloseInteriorDoor={closeInteriorDoor}
        onExitInterior={exitInterior}
        onCloseExteriorDoor={closeExteriorDoor}
      />
      <LoadingScreen sceneReady={modelReady} failed={webglFailed} reducedMotion={reducedMotion} onDismissed={finishInitialReveal} />
      {CameraDebugHUD ? <Suspense fallback={null}><CameraDebugHUD /></Suspense> : null}
    </div>
  );
}

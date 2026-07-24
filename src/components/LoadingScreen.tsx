import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProgress } from '@react-three/drei';
import { PORTAL_TRANSITION_TIMING, StoryReturnTransition, type StoryReturnPhase } from './StoryReturnTransition';
interface Props {
  readonly sceneReady: boolean;
  readonly failed: boolean;
  readonly reducedMotion: boolean;
  readonly onDismissed: () => void;
}
type LoadingVisualStyle = CSSProperties & {
  readonly '--loading-progress': number;
  readonly '--loading-heat-color': string;
  readonly '--loading-heat-shadow': string;
  readonly '--loading-heat-blur': string;
};
const HOLDING_PERCENTAGE = 95;
const READY_HOLD_MS = 480;

export function LoadingScreen({ sceneReady, failed, reducedMotion, onDismissed }: Props) {
  const { active } = useProgress();
  const [displayedPercentage, setDisplayedPercentage] = useState(1);
  const [transitionPhase, setTransitionPhase] = useState<StoryReturnPhase | null>(null);
  const [portalCovered, setPortalCovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissedNotificationSent = useRef(false);
  const assetsComplete = sceneReady && !active;
  const requestedPercentage = assetsComplete ? 100 : HOLDING_PERCENTAGE;
  const complete = assetsComplete && displayedPercentage === 100;
  const progressRatio = displayedPercentage / 100;
  const heatIntensity = progressRatio ** 1.25;
  const loadingStyle: LoadingVisualStyle = {
    '--loading-progress': progressRatio,
    '--loading-heat-color': `hsl(${Math.round(209 - heatIntensity * 5)}, ${Math.round(30 + heatIntensity * 58)}%, ${Math.round(62 - heatIntensity * 28)}%)`,
    '--loading-heat-shadow': `rgba(6, 102, 166, ${(0.04 + heatIntensity * 0.25).toFixed(3)})`,
    '--loading-heat-blur': `${(0.15 + heatIntensity * 1.15).toFixed(2)}rem`,
    backgroundColor: portalCovered ? 'transparent' : undefined,
  };

  useEffect(() => {
    if (failed || displayedPercentage >= requestedPercentage) return;
    if (reducedMotion) {
      setDisplayedPercentage(requestedPercentage);
      return;
    }
    const delay = displayedPercentage < 70 ? 24 : displayedPercentage < HOLDING_PERCENTAGE ? 32 : 44;
    const timer = window.setTimeout(() => {
      setDisplayedPercentage((current) => Math.min(requestedPercentage, current + 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [displayedPercentage, failed, reducedMotion, requestedPercentage]);

  useEffect(() => {
    if (!complete || failed) return;
    if (reducedMotion) {
      setTransitionPhase('covering');
      return;
    }
    // Let the completed counter and light sweep register before the portal closes.
    const timer = window.setTimeout(() => setTransitionPhase('covering'), READY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [complete, failed, reducedMotion]);

  useEffect(() => {
    if (failed || transitionPhase !== 'covering') return;
    let settleFrame = 0;
    let revealFrame = 0;
    let revealFallback = 0;
    const timer = window.setTimeout(() => {
      // The loader stays mounted until the portal is fully opaque. Two frames
      // give section 01 and its WebGL canvas time to paint behind that cover.
      setPortalCovered(true);
      let revealStarted = false;
      const reveal = (): void => {
        if (revealStarted) return;
        revealStarted = true;
        setTransitionPhase('revealing');
      };
      // Background tabs may throttle requestAnimationFrame completely. The
      // fallback keeps the state machine from getting stranded while the
      // opaque portal still guarantees there can be no visible flash.
      revealFallback = window.setTimeout(reveal, reducedMotion ? 50 : 240);
      settleFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(reveal);
      });
    }, reducedMotion ? PORTAL_TRANSITION_TIMING.reducedCover : PORTAL_TRANSITION_TIMING.cover);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(revealFallback);
      cancelAnimationFrame(settleFrame);
      cancelAnimationFrame(revealFrame);
    };
  }, [failed, reducedMotion, transitionPhase]);

  useEffect(() => {
    if (failed || transitionPhase !== 'revealing') return;
    const timer = window.setTimeout(
      () => setDismissed(true),
      reducedMotion ? PORTAL_TRANSITION_TIMING.reducedReveal : PORTAL_TRANSITION_TIMING.reveal,
    );
    return () => window.clearTimeout(timer);
  }, [failed, reducedMotion, transitionPhase]);

  useEffect(() => {
    if (!dismissed || dismissedNotificationSent.current) return;
    dismissedNotificationSent.current = true;
    onDismissed();
  }, [dismissed, onDismissed]);

  if (failed || dismissed) return null;
  return (
    <div
      className={`loading-screen${complete ? ' is-ready' : ''}${transitionPhase ? ' is-portal-transitioning' : ''}${portalCovered ? ' is-portal-covered' : ''}`}
      data-loading-stage={transitionPhase ?? (complete ? 'ready' : 'loading')}
      style={loadingStyle}
      aria-busy={!complete || transitionPhase !== null}
    >
      <div className='loading-screen__heat' aria-hidden='true' />
      <div className="loading-screen__topline">
        <span className="loading-screen__brand"><img className="loading-screen__logo" src="/brand/norka-compass-logo-512.png" width="44" height="44" alt="" aria-hidden="true" /><span>NORKA R35</span></span>
        <span>REAL-TIME 3D</span>
      </div>
      <div className="loading-screen__center" role="progressbar" aria-label="Loading the 3D vehicle" aria-valuemin={1} aria-valuemax={100} aria-valuenow={displayedPercentage}>
        <span className="loading-screen__number" aria-hidden="true">{displayedPercentage.toString().padStart(3, '0')}</span>
        <div className="loading-screen__track" aria-hidden="true"><span style={{ transform: `scaleX(${displayedPercentage / 100})` }} /></div>
        <p>{complete ? 'Experience ready' : 'Preparing the real-time vehicle'}</p>
      </div>
      <span className='sr-only' role='status' aria-live='polite'>{complete ? '3D experience ready.' : ''}</span>
      <p className="loading-screen__foot">Engineered beyond limits</p>
      {transitionPhase ? <StoryReturnTransition phase={transitionPhase} intent='intro' /> : null}
    </div>
  );
}

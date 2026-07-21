import { useEffect, useState, type CSSProperties } from 'react';
import { useProgress } from '@react-three/drei';
interface Props { readonly sceneReady: boolean; readonly failed: boolean; readonly reducedMotion: boolean; }
type LoadingVisualStyle = CSSProperties & {
  readonly '--loading-progress': number;
  readonly '--loading-heat-color': string;
  readonly '--loading-heat-shadow': string;
  readonly '--loading-heat-blur': string;
};
const HOLDING_PERCENTAGE = 95;
const READY_HOLD_MS = 480;
const EXIT_DURATION_MS = 1080;

export function LoadingScreen({ sceneReady, failed, reducedMotion }: Props) {
  const { active } = useProgress();
  const [displayedPercentage, setDisplayedPercentage] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
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
    if (!complete) return;
    if (reducedMotion) {
      setExiting(true);
      return;
    }
    // Let the completed counter and light sweep register before revealing the car.
    const timer = window.setTimeout(() => setExiting(true), READY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [complete, reducedMotion]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setDismissed(true), reducedMotion ? 20 : EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, reducedMotion]);
  if (failed || dismissed) return null;
  return (
    <div className={`loading-screen${complete ? ' is-ready' : ''}${exiting ? ' is-complete' : ''}`} style={loadingStyle} aria-busy={!complete}>
      <div className='loading-screen__heat' aria-hidden='true' />
      <div className='loading-screen__aperture' aria-hidden='true' />
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
    </div>
  );
}

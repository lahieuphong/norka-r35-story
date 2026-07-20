import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
interface Props { readonly sceneReady: boolean; readonly failed: boolean; }
export function LoadingScreen({ sceneReady, failed }: Props) {
  const { active, progress, loaded, total } = useProgress();
  const [dismissed, setDismissed] = useState(false);
  const complete = sceneReady && !active && progress >= 100;
  const percentage = Math.max(0, Math.min(100, Math.round(progress)));
  useEffect(() => {
    if (!complete) return;
    const timer = window.setTimeout(() => setDismissed(true), 620);
    return () => window.clearTimeout(timer);
  }, [complete]);
  if (failed || dismissed) return null;
  return (
    <div className={`loading-screen${complete ? ' is-complete' : ''}`} role="status" aria-live="polite">
      <div className="loading-screen__topline">
        <span className="loading-screen__brand"><img className="loading-screen__logo" src="/brand/norka-compass-logo-512.png" width="44" height="44" alt="" aria-hidden="true" /><span>NORKA R35</span></span>
        <span>REAL-TIME 3D</span>
      </div>
      <div className="loading-screen__center">
        <span className="loading-screen__number">{percentage.toString().padStart(3, '0')}</span>
        <div className="loading-screen__track" aria-hidden="true"><span style={{ transform: `scaleX(${percentage / 100})` }} /></div>
        <p>Loading embedded vehicle assets{total > 0 ? ` · ${loaded}/${total}` : ''}</p>
      </div>
      <p className="loading-screen__foot">Engineered beyond limits</p>
    </div>
  );
}

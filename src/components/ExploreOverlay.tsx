import { useEffect, useRef } from 'react';
import type { ExplorePhase } from '../three/experienceTypes';
interface Props { readonly phase: ExplorePhase; readonly onExit: () => void; }
export function ExploreOverlay({ phase, onExit }: Props) {
  const exitRef = useRef<HTMLButtonElement>(null);
  const interactive = phase === 'explore';
  useEffect(() => {
    if (!interactive) return;
    exitRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [interactive, onExit]);
  if (phase === 'story') return null;
  const status = phase === 'entering' ? 'Preparing interactive camera' : phase === 'exiting' ? 'Returning to the story' : 'Drag or use arrow keys to orbit · scroll, pinch, or +/- to zoom';
  return (
    <aside className={`explore-overlay${interactive ? ' is-ready' : ''}`} aria-live="polite">
      <div className="explore-overlay__status"><span className="explore-overlay__dot" aria-hidden="true" /><span>{status}</span></div>
      <div className="explore-overlay__reticle" aria-hidden="true"><span /><span /></div>
      <button ref={exitRef} type="button" className="explore-overlay__exit" onClick={onExit} disabled={!interactive}><span>Exit 3D</span><span aria-hidden="true">×</span></button>
    </aside>
  );
}

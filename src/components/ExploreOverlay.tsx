import { useEffect, useRef } from 'react';
import type { ExplorePhase, ExploreViewPhase } from '../three/experienceTypes';

interface Props {
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly onExit: () => void;
  readonly onExitInterior: () => void;
}

function readStatus(phase: ExplorePhase, viewPhase: ExploreViewPhase): string {
  if (phase === 'entering') return 'Preparing interactive camera';
  if (phase === 'exiting') return 'Returning to the story';
  if (viewPhase === 'enteringInterior') return 'Opening driver door · entering cockpit';
  if (viewPhase === 'exitingInterior') return 'Leaving cockpit · closing driver door';
  if (viewPhase === 'interior') return 'Drag to look around · use Quit interior to leave';
  return 'Select the door marker to enter · drag to orbit';
}

export function ExploreOverlay({ phase, viewPhase, onExit, onExitInterior }: Props) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const previousView = useRef<ExploreViewPhase>(viewPhase);
  const exteriorReady = phase === 'explore' && viewPhase === 'exterior';
  const interiorReady = phase === 'explore' && viewPhase === 'interior';
  const interactive = exteriorReady || interiorReady;

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = viewPhase;
    if (!interactive) {
      statusRef.current?.focus({ preventScroll: true });
      return;
    }
    if (interiorReady) {
      actionRef.current?.focus();
      return;
    }
    if (previous === 'exitingInterior') {
      let frame = 0;
      let attempts = 0;
      const restoreDoorFocus = (): void => {
        const hotspot = document.querySelector<HTMLButtonElement>('[data-visible="true"] [data-door-hotspot]');
        if (hotspot && !hotspot.disabled) {
          hotspot.focus();
          return;
        }
        attempts += 1;
        if (attempts >= 60) {
          actionRef.current?.focus();
          return;
        }
        frame = requestAnimationFrame(restoreDoorFocus);
      };
      frame = requestAnimationFrame(restoreDoorFocus);
      return () => cancelAnimationFrame(frame);
    } else {
      actionRef.current?.focus();
    }
  }, [interactive, interiorReady, phase, viewPhase]);

  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (interiorReady) onExitInterior();
      else onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [interactive, interiorReady, onExit, onExitInterior]);

  if (phase === 'story') return null;
  const status = readStatus(phase, viewPhase);
  const transitioningInterior = viewPhase === 'enteringInterior' || viewPhase === 'exitingInterior';
  const actionLabel = interiorReady ? 'Quit interior'
    : viewPhase === 'enteringInterior' ? 'Entering cockpit'
      : viewPhase === 'exitingInterior' ? 'Returning outside'
        : phase === 'exiting' ? 'Exiting 3D' : 'Exit 3D';
  return (
    <aside className={`explore-overlay${interactive ? ' is-ready' : ''}${interiorReady ? ' is-interior' : ''}${transitioningInterior ? ' is-transitioning-interior' : ''}`}>
      <div ref={statusRef} className="explore-overlay__status" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}><span className="explore-overlay__dot" aria-hidden="true" /><span>{status}</span></div>
      <div className="explore-overlay__reticle" aria-hidden="true"><span /><span /></div>
      <button
        ref={actionRef}
        type="button"
        className="explore-overlay__exit"
        onClick={interiorReady ? onExitInterior : onExit}
        disabled={!interactive}
      >
        <span>{actionLabel}</span><span aria-hidden="true">{interiorReady ? '↙' : '×'}</span>
      </button>
    </aside>
  );
}

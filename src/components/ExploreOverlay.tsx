import { useEffect, useRef } from 'react';
import type { ExplorePhase, ExploreViewPhase } from '../three/experienceTypes';
import { ExploreActionIcon, type ExploreActionIconName } from './ExploreActionIcon';

interface Props {
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly onExit: () => void;
  readonly onEnterInterior: () => void;
  readonly onOpenInteriorDoor: () => void;
  readonly onCloseInteriorDoor: () => void;
  readonly onExitInterior: () => void;
  readonly onCloseExteriorDoor: () => void;
}

function readStatus(phase: ExplorePhase, viewPhase: ExploreViewPhase): string {
  if (phase === 'entering') return 'Preparing interactive camera';
  if (phase === 'exiting') return 'Returning to the story';
  if (viewPhase === 'openingExteriorDoor') return 'Opening driver door';
  if (viewPhase === 'exteriorDoorOpen') return 'Door open · select Enter car when ready';
  if (viewPhase === 'exteriorDoorOpenAfterExit') return 'Outside the car · close the driver door when ready';
  if (viewPhase === 'closingExteriorDoor') return 'Closing driver door';
  if (viewPhase === 'enteringInterior') return 'Entering cockpit';
  if (viewPhase === 'interiorDoorOpen') return 'Door open · close it or use Quit interior to leave';
  if (viewPhase === 'closingInteriorDoor') return 'Closing driver door';
  if (viewPhase === 'openingInteriorDoor') return 'Opening driver door';
  if (viewPhase === 'openingDoorForExit') return 'Opening driver door before exit';
  if (viewPhase === 'exitingInterior') return 'Leaving cockpit · driver door remains open';
  if (viewPhase === 'interior') return 'Open the door again or use Quit interior to leave';
  const touchGuidance = typeof window !== 'undefined'
    && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  return touchGuidance
    ? 'Tap the door marker · one finger orbit · two fingers move + zoom'
    : 'Select the door marker · left drag orbit · right drag pan · wheel zoom';
}

export function ExploreOverlay({ phase, viewPhase, onExit, onEnterInterior, onOpenInteriorDoor, onCloseInteriorDoor, onExitInterior, onCloseExteriorDoor }: Props) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const openDoorRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const previousView = useRef<ExploreViewPhase>(viewPhase);
  const exteriorReady = phase === 'explore' && viewPhase === 'exterior';
  const exteriorDoorOpenReady = phase === 'explore' && viewPhase === 'exteriorDoorOpen';
  const exteriorDoorOpenAfterExitReady = phase === 'explore' && viewPhase === 'exteriorDoorOpenAfterExit';
  const interiorDoorOpenReady = phase === 'explore' && viewPhase === 'interiorDoorOpen';
  const interiorReady = phase === 'explore' && viewPhase === 'interior';
  const stableInterior = interiorDoorOpenReady || interiorReady;
  const interactive = exteriorReady
    || exteriorDoorOpenReady
    || exteriorDoorOpenAfterExitReady
    || stableInterior;

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = viewPhase;
    if (!interactive) {
      statusRef.current?.focus({ preventScroll: true });
      return;
    }
    if (stableInterior) {
      openDoorRef.current?.focus();
      return;
    }
    if (exteriorDoorOpenReady || exteriorDoorOpenAfterExitReady) {
      actionRef.current?.focus();
      return;
    }
    if (previous === 'closingExteriorDoor') {
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
  }, [exteriorDoorOpenAfterExitReady, exteriorDoorOpenReady, interactive, phase, stableInterior, viewPhase]);

  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape'
        || exteriorDoorOpenReady
        || exteriorDoorOpenAfterExitReady
        || interiorDoorOpenReady) return;
      event.preventDefault();
      if (stableInterior) onExitInterior();
      else onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exteriorDoorOpenAfterExitReady, exteriorDoorOpenReady, interactive, interiorDoorOpenReady, onExit, onExitInterior, stableInterior]);

  if (phase === 'story') return null;
  const status = readStatus(phase, viewPhase);
  const transitioningInterior = viewPhase === 'openingExteriorDoor'
    || viewPhase === 'enteringInterior'
    || viewPhase === 'closingInteriorDoor'
    || viewPhase === 'openingInteriorDoor'
    || viewPhase === 'openingDoorForExit'
    || viewPhase === 'exitingInterior'
    || viewPhase === 'closingExteriorDoor';
  const insideCabin = interiorDoorOpenReady
    || interiorReady
    || viewPhase === 'closingInteriorDoor'
    || viewPhase === 'openingInteriorDoor'
    || viewPhase === 'openingDoorForExit'
    || viewPhase === 'exitingInterior';
  const actionLabel = exteriorDoorOpenReady ? 'Enter car'
    : exteriorDoorOpenAfterExitReady ? 'Close door'
      : viewPhase === 'openingExteriorDoor' ? 'Opening door'
        : viewPhase === 'enteringInterior' ? 'Entering cockpit'
          : viewPhase === 'closingInteriorDoor' ? 'Closing door'
            : viewPhase === 'openingInteriorDoor' || viewPhase === 'openingDoorForExit' ? 'Opening door'
              : viewPhase === 'exitingInterior' ? 'Returning outside'
                : viewPhase === 'closingExteriorDoor' ? 'Closing door'
                  : phase === 'exiting' ? 'Exiting 3D' : 'Exit 3D';
  const action = exteriorDoorOpenReady ? onEnterInterior
    : exteriorDoorOpenAfterExitReady ? onCloseExteriorDoor
      : onExit;
  const actionIcon: ExploreActionIconName = exteriorDoorOpenReady ? 'enter'
    : transitioningInterior ? 'pending'
      : 'close';
  return (
    <aside className={`explore-overlay${interactive ? ' is-ready' : ''}${insideCabin ? ' is-interior' : ''}${transitioningInterior ? ' is-transitioning-interior' : ''}`}>
      <div ref={statusRef} className="explore-overlay__status" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}><span className="explore-overlay__dot" aria-hidden="true" /><span>{status}</span></div>
      <div className="explore-overlay__reticle" aria-hidden="true"><span /><span /></div>
      <div className="explore-overlay__actions">
        {stableInterior ? (
          <>
            <button ref={openDoorRef} type="button" className="explore-overlay__exit" onClick={interiorReady ? onOpenInteriorDoor : onCloseInteriorDoor}>
              <span>{interiorReady ? 'Open door' : 'Close door'}</span><ExploreActionIcon name={interiorReady ? 'open' : 'close'} />
            </button>
            <button ref={actionRef} type="button" className="explore-overlay__exit" onClick={onExitInterior}>
              <span>Quit interior</span><ExploreActionIcon name="quit" />
            </button>
          </>
        ) : (
          <button
            ref={actionRef}
            type="button"
            className="explore-overlay__exit"
            onClick={action}
            disabled={!interactive}
          >
            <span>{actionLabel}</span><ExploreActionIcon name={actionIcon} />
          </button>
        )}
      </div>
    </aside>
  );
}

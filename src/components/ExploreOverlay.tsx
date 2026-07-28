import { useEffect, useRef } from 'react';
import type { DrivePhase, ExplorePhase, ExploreViewPhase } from '../three/experienceTypes';
import { ExploreActionIcon, type ExploreActionIconName } from './ExploreActionIcon';

interface Props {
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly drivePhase: DrivePhase;
  readonly onExit: () => void;
  readonly onStartDrive: () => void;
  readonly onStopDrive: () => void;
  readonly onEnterInterior: () => void;
  readonly onOpenInteriorDoor: () => void;
  readonly onCloseInteriorDoor: () => void;
  readonly onExitInterior: () => void;
  readonly onCloseExteriorDoor: () => void;
}

function readStatus(phase: ExplorePhase, viewPhase: ExploreViewPhase, drivePhase: DrivePhase): string {
  if (phase === 'entering') return 'Preparing interactive camera';
  if (phase === 'exiting') return 'Returning to the story';
  if (viewPhase === 'exterior' && drivePhase === 'starting') return 'Turning on full vehicle lights, then starting Auto Drive';
  if (viewPhase === 'exterior' && drivePhase === 'driving') return 'Auto Drive active · stop driving or exit the 3D experience';
  if (viewPhase === 'exterior' && drivePhase === 'stopping') return 'Stopping Auto Drive · Exit 3D remains available';
  if (viewPhase === 'openingExteriorDoor') return 'Opening driver door';
  if (viewPhase === 'exteriorDoorOpen') return 'Door open · enter the car or close the door';
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

export function ExploreOverlay({ phase, viewPhase, drivePhase, onExit, onStartDrive, onStopDrive, onEnterInterior, onOpenInteriorDoor, onCloseInteriorDoor, onExitInterior, onCloseExteriorDoor }: Props) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const driveActionRef = useRef<HTMLButtonElement>(null);
  const openDoorRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const previousView = useRef<ExploreViewPhase>(viewPhase);
  const previousDrive = useRef<DrivePhase>(drivePhase);
  const driveExterior = phase === 'explore' && viewPhase === 'exterior';
  const driveStarting = driveExterior && drivePhase === 'starting';
  const driveReady = driveExterior && drivePhase === 'driving';
  const driveStopping = driveExterior && drivePhase === 'stopping';
  const driveVisible = driveStarting || driveReady || driveStopping;
  const driveCanStop = driveStarting || driveReady;
  const exteriorReady = driveExterior && drivePhase === 'idle';
  const exteriorDoorOpenReady = phase === 'explore' && viewPhase === 'exteriorDoorOpen';
  const exteriorDoorOpenAfterExitReady = phase === 'explore' && viewPhase === 'exteriorDoorOpenAfterExit';
  const interiorDoorOpenReady = phase === 'explore' && viewPhase === 'interiorDoorOpen';
  const interiorReady = phase === 'explore' && viewPhase === 'interior';
  const stableInterior = interiorDoorOpenReady || interiorReady;
  const interactive = exteriorReady
    || exteriorDoorOpenReady
    || exteriorDoorOpenAfterExitReady
    || stableInterior
    || driveVisible;

  useEffect(() => {
    const previous = previousView.current;
    const previousDrivePhase = previousDrive.current;
    previousView.current = viewPhase;
    previousDrive.current = drivePhase;
    if (driveStopping) {
      statusRef.current?.focus({ preventScroll: true });
      return;
    }
    if (driveCanStop) {
      // Moving from starting to driving updates the label and live status, but
      // must not steal focus back from Exit 3D after a keyboard user tabs to it.
      if (driveStarting && previousDrivePhase === 'idle') {
        driveActionRef.current?.focus({ preventScroll: true });
      }
      return;
    }
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
    if (exteriorReady && previousDrivePhase === 'stopping') {
      driveActionRef.current?.focus({ preventScroll: true });
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
          driveActionRef.current?.focus({ preventScroll: true });
          return;
        }
        frame = requestAnimationFrame(restoreDoorFocus);
      };
      frame = requestAnimationFrame(restoreDoorFocus);
      return () => cancelAnimationFrame(frame);
    } else if (exteriorReady) {
      driveActionRef.current?.focus({ preventScroll: true });
    } else {
      actionRef.current?.focus({ preventScroll: true });
    }
  }, [driveCanStop, drivePhase, driveStopping, exteriorDoorOpenAfterExitReady, exteriorDoorOpenReady, exteriorReady, interactive, phase, stableInterior, viewPhase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // A held Escape keeps emitting keydown events. Swallow repeats while the
      // Explore controls own Escape so one physical press can never Stop Drive
      // and then Exit 3D when the stopping transition reaches idle.
      if (event.repeat) {
        if (drivePhase !== 'idle' || interactive) event.preventDefault();
        return;
      }
      if (drivePhase !== 'idle') {
        event.preventDefault();
        if (driveCanStop) onStopDrive();
        return;
      }
      if (!interactive
        || exteriorDoorOpenReady
        || exteriorDoorOpenAfterExitReady
        || interiorDoorOpenReady) return;
      event.preventDefault();
      if (stableInterior) onExitInterior();
      else onExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [driveCanStop, drivePhase, exteriorDoorOpenAfterExitReady, exteriorDoorOpenReady, interactive, interiorDoorOpenReady, onExit, onExitInterior, onStopDrive, stableInterior]);

  if (phase === 'story') return null;
  const status = readStatus(phase, viewPhase, drivePhase);
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
  const driveTransitioning = driveStarting || driveStopping;
  const driveHudLabel = driveStarting ? 'Lights · Launch'
    : driveReady ? 'Auto Drive'
      : 'Powering down';
  const actionLabel = exteriorDoorOpenAfterExitReady ? 'Close door'
    : viewPhase === 'openingExteriorDoor' ? 'Opening door'
      : viewPhase === 'enteringInterior' ? 'Entering cockpit'
        : viewPhase === 'closingInteriorDoor' ? 'Closing door'
          : viewPhase === 'openingInteriorDoor' || viewPhase === 'openingDoorForExit' ? 'Opening door'
            : viewPhase === 'exitingInterior' ? 'Returning outside'
              : viewPhase === 'closingExteriorDoor' ? 'Closing door'
                : phase === 'exiting' ? 'Exiting 3D' : 'Exit 3D';
  const action = exteriorDoorOpenAfterExitReady ? onCloseExteriorDoor
    : onExit;
  const actionIcon: ExploreActionIconName = transitioningInterior ? 'pending'
    : 'close';
  return (
    <aside
      className={`explore-overlay${interactive ? ' is-ready' : ''}${insideCabin ? ' is-interior' : ''}${transitioningInterior ? ' is-transitioning-interior' : ''}${driveVisible ? ' is-drive' : ''}${driveTransitioning ? ' is-drive-transitioning' : ''}`}
      data-drive-state={drivePhase}
      aria-label="Interactive 3D controls"
    >
      <div ref={statusRef} className="explore-overlay__announcer sr-only" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{status}</div>
      <div className="explore-overlay__reticle" aria-hidden="true"><span /><span /></div>
      {driveVisible ? (
        <div className="explore-overlay__drive-hud" data-drive-state={drivePhase} aria-hidden="true">
          <span className="explore-overlay__drive-beacon" />
          <span className="explore-overlay__drive-copy">
            <span>Motion system</span>
            <strong>{driveHudLabel}</strong>
          </span>
          <span className="explore-overlay__drive-mark">R35</span>
        </div>
      ) : null}
      <div
        className="explore-overlay__actions"
        data-action-layout={stableInterior || exteriorDoorOpenReady || exteriorReady || driveVisible ? 'pair' : 'single'}
        aria-busy={(!interactive || driveStopping) || undefined}
      >
        {stableInterior ? (
          <>
            <button ref={openDoorRef} type="button" className="explore-overlay__exit" data-tone="primary" onClick={interiorReady ? onOpenInteriorDoor : onCloseInteriorDoor}>
              <span className="explore-overlay__action-label">{interiorReady ? 'Open door' : 'Close door'}</span><ExploreActionIcon name={interiorReady ? 'open' : 'close'} />
            </button>
            <button ref={actionRef} type="button" className="explore-overlay__exit" data-tone="secondary" onClick={onExitInterior}>
              <span className="explore-overlay__action-label">Quit interior</span><ExploreActionIcon name="quit" />
            </button>
          </>
        ) : exteriorDoorOpenReady ? (
          <>
            <button ref={actionRef} type="button" className="explore-overlay__exit" data-tone="primary" onClick={onEnterInterior}>
              <span className="explore-overlay__action-label">Enter car</span><ExploreActionIcon name="enter" />
            </button>
            <button type="button" className="explore-overlay__exit" data-tone="secondary" onClick={onCloseExteriorDoor}>
              <span className="explore-overlay__action-label">Close door</span><ExploreActionIcon name="close" />
            </button>
          </>
        ) : exteriorReady ? (
          <>
            <button
              ref={driveActionRef}
              type="button"
              className="explore-overlay__exit"
              data-tone="primary"
              data-drive-control
              aria-pressed={false}
              onClick={onStartDrive}
            >
              <span className="explore-overlay__action-label">Auto drive</span><ExploreActionIcon name="drive" />
            </button>
            <button ref={actionRef} type="button" className="explore-overlay__exit" data-tone="utility" onClick={onExit}>
              <span className="explore-overlay__action-label">Exit 3D</span><ExploreActionIcon name="close" />
            </button>
          </>
        ) : driveVisible ? (
          <>
            <button
              ref={driveActionRef}
              type="button"
              className="explore-overlay__exit"
              data-tone="primary"
              data-drive-control
              aria-pressed={true}
              aria-busy={driveStopping || undefined}
              disabled={!driveCanStop}
              onClick={onStopDrive}
            >
              <span className="explore-overlay__action-label">{driveStopping ? 'Stopping' : 'Stop drive'}</span><ExploreActionIcon name="stop" />
            </button>
            <button ref={actionRef} type="button" className="explore-overlay__exit" data-tone="utility" onClick={onExit}>
              <span className="explore-overlay__action-label">Exit 3D</span><ExploreActionIcon name="close" />
            </button>
          </>
        ) : (
          <button
            ref={actionRef}
            type="button"
            className="explore-overlay__exit"
            data-tone={!interactive ? 'pending' : exteriorDoorOpenAfterExitReady ? 'primary' : 'utility'}
            onClick={action}
            disabled={!interactive}
            aria-busy={!interactive || undefined}
          >
            <span className="explore-overlay__action-label">{actionLabel}</span><ExploreActionIcon name={actionIcon} />
          </button>
        )}
      </div>
    </aside>
  );
}

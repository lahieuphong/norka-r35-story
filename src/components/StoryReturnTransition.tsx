import { useLayoutEffect } from 'react';

export type StoryReturnPhase = 'covering' | 'revealing';
export type StoryTransitionIntent = 'return' | 'intro';

export const PORTAL_TRANSITION_TIMING = {
  cover: 760,
  reveal: 900,
  reducedCover: 70,
  reducedReveal: 150,
} as const;

interface Props {
  readonly phase: StoryReturnPhase;
  readonly intent?: StoryTransitionIntent;
}

const BLOCKED_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  'Space',
  'Tab',
]);

export function StoryReturnTransition({ phase, intent = 'return' }: Props) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasLocked = root.classList.contains('is-story-returning');
    const preventInput = (event: Event): void => event.preventDefault();
    const preventKeyboardInput = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || !BLOCKED_KEYS.has(event.code)) return;
      event.preventDefault();
    };

    root.classList.add('is-story-returning');
    window.addEventListener('wheel', preventInput, { capture: true, passive: false });
    window.addEventListener('touchmove', preventInput, { capture: true, passive: false });
    document.addEventListener('keydown', preventKeyboardInput, true);

    return () => {
      window.removeEventListener('wheel', preventInput, true);
      window.removeEventListener('touchmove', preventInput, true);
      document.removeEventListener('keydown', preventKeyboardInput, true);
      if (!wasLocked) root.classList.remove('is-story-returning');
    };
  }, []);

  return (
    <div
      className={`story-return-transition story-return-transition--${phase} story-return-transition--${intent}`}
      data-story-return-transition='true'
      data-state={phase}
      data-transition-intent={intent}
      role='status'
      aria-live='polite'
      aria-atomic='true'
    >
      <div className='story-return-transition__scene' aria-hidden='true'>
        <span className='story-return-transition__veil' />
        <span className='story-return-transition__panel story-return-transition__panel--left'><i /></span>
        <span className='story-return-transition__panel story-return-transition__panel--right'><i /></span>
        <span className='story-return-transition__axis story-return-transition__axis--horizontal' />
        <span className='story-return-transition__axis story-return-transition__axis--vertical' />
        <span className='story-return-transition__portal'>
          <i className='story-return-transition__ring story-return-transition__ring--outer' />
          <i className='story-return-transition__ring story-return-transition__ring--middle' />
          <i className='story-return-transition__ring story-return-transition__ring--inner' />
          <span className='story-return-transition__core'>
            <img src='/brand/norka-compass-logo-512.png' width='44' height='44' alt='' />
            <b>01</b>
          </span>
        </span>
        <span className='story-return-transition__scan' />
      </div>
      <span className='sr-only'>{intent === 'intro' ? 'Opening the 3D experience at section 1' : 'Returning to section 1'}</span>
    </div>
  );
}

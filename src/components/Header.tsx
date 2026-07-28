import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STORY_SECTION_COUNT, subscribeStoryProgress } from '../three/storyProgress';

interface Props {
  readonly exploreActive: boolean;
  readonly interactionBlocked: boolean;
}
interface IndicatorState { readonly current: number; readonly total: number; }

const WHEEL_TICKS = Array.from(
  { length: STORY_SECTION_COUNT },
  (_, index) => index * (360 / STORY_SECTION_COUNT),
);
const formatIndex = (value: number): string => value.toString().padStart(2, '0');
const NAV_ITEMS = [
  { label: 'Explore', href: '#explore', first: 1, last: 1 },
  { label: 'Exterior', href: '#performance', first: 2, last: 5 },
  { label: 'Interior', href: '#interior', first: 6, last: 11 },
  { label: 'Overview', href: '#hero', first: 12, last: 12 },
] as const;

export function Header({ exploreActive, interactionBlocked }: Props) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const wordmarkTextRef = useRef<HTMLSpanElement>(null);
  const indicatorStateRef = useRef<IndicatorState>({ current: 1, total: STORY_SECTION_COUNT });
  const [indicator, setIndicator] = useState<IndicatorState>(indicatorStateRef.current);
  const [hideWordmarkText, setHideWordmarkText] = useState(false);

  useEffect(() => subscribeStoryProgress(({ progress, current, total }) => {
    const visualProgress = (1 + progress * (total - 1)) / total;
    indicatorRef.current?.style.setProperty('--story-progress', (visualProgress * 100).toFixed(3));
    indicatorRef.current?.style.setProperty('--story-wheel-turn', `${(progress * 1.2).toFixed(3)}turn`);
    if (indicatorStateRef.current.current === current && indicatorStateRef.current.total === total) return;
    indicatorStateRef.current = { current, total };
    setIndicator(indicatorStateRef.current);
  }), []);

  useLayoutEffect(() => {
    if (!exploreActive) {
      setHideWordmarkText(false);
      return;
    }

    const wordmarkText = wordmarkTextRef.current;
    const actions = document.querySelector<HTMLElement>('.explore-overlay__actions');
    if (!wordmarkText || !actions) {
      setHideWordmarkText(false);
      return;
    }

    let active = true;
    let measurementQueued = false;
    const measureCollision = (): void => {
      const textRect = wordmarkText.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const verticallyAligned = textRect.bottom > actionsRect.top && textRect.top < actionsRect.bottom;
      const overlapsWithSafetyGap = textRect.right + 12 > actionsRect.left
        && textRect.left < actionsRect.right;
      const shouldHide = verticallyAligned && overlapsWithSafetyGap;
      setHideWordmarkText((current) => current === shouldHide ? current : shouldHide);
    };
    const scheduleMeasurement = (): void => {
      if (measurementQueued) return;
      measurementQueued = true;
      queueMicrotask(() => {
        measurementQueued = false;
        if (active) measureCollision();
      });
    };

    measureCollision();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasurement);
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(scheduleMeasurement);
    resizeObserver?.observe(actions);
    resizeObserver?.observe(wordmarkText);
    resizeObserver?.observe(document.documentElement);
    mutationObserver?.observe(actions, { attributes: true, childList: true, characterData: true, subtree: true });
    actions.addEventListener('animationend', scheduleMeasurement);
    window.addEventListener('resize', scheduleMeasurement, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleMeasurement, { passive: true });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      actions.removeEventListener('animationend', scheduleMeasurement);
      window.removeEventListener('resize', scheduleMeasurement);
      window.visualViewport?.removeEventListener('resize', scheduleMeasurement);
    };
  }, [exploreActive]);

  return (
    <header className={`site-header${exploreActive ? ' is-muted' : ''}`} inert={interactionBlocked}>
      <a className='wordmark' href='#explore' aria-label='NORKA R35 — back to the beginning'>
        <img className='wordmark__logo' src='/brand/norka-compass-logo-512.png' width='44' height='44' alt='' aria-hidden='true' />
        <span
          ref={wordmarkTextRef}
          className='wordmark__text'
          style={{ opacity: hideWordmarkText ? 0 : 1, visibility: hideWordmarkText ? 'hidden' : 'visible' }}
          data-controls-occluded={hideWordmarkText || undefined}
          aria-hidden={hideWordmarkText || undefined}
        ><span>NORKA</span><strong>R35</strong></span>
      </a>
      <nav aria-label='Story chapters'>
        {NAV_ITEMS.map((item) => {
          const active = indicator.current >= item.first && indicator.current <= item.last;
          return <a key={item.href} href={item.href} className={active ? 'is-active' : undefined} aria-current={active ? 'location' : undefined}>{item.label}</a>;
        })}
      </nav>
      <div
        ref={indicatorRef}
        className='header-index'
        role='progressbar'
        aria-label='Story progress'
        aria-valuemin={1}
        aria-valuemax={indicator.total}
        aria-valuenow={indicator.current}
        aria-valuetext={`Section ${indicator.current} of ${indicator.total}`}
      >
        <span className='header-index__wheel' aria-hidden='true'>
          <svg viewBox='0 0 44 44' focusable='false'>
            <circle className='header-index__track' cx='22' cy='22' r='18' />
            <circle className='header-index__progress' cx='22' cy='22' r='18' pathLength='100' />
            <g className='header-index__ticks'>
              {WHEEL_TICKS.map((rotation) => <line key={rotation} x1='22' y1='1.5' x2='22' y2='4.5' transform={`rotate(${rotation} 22 22)`} />)}
            </g>
            <g className='header-index__rotor'>
              <circle className='header-index__rim' cx='22' cy='22' r='10.5' />
              <path className='header-index__spokes' d='M22 22L22 12.8M22 22L30.7 19.2M22 22L27.4 29.4M22 22L16.6 29.4M22 22L13.3 19.2' />
              <circle className='header-index__hub' cx='22' cy='22' r='2.1' />
            </g>
          </svg>
          <span key={indicator.current} className='header-index__value'>{formatIndex(indicator.current)}</span>
        </span>
      </div>
    </header>
  );
}

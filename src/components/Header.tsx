import { useEffect, useRef, useState } from 'react';
import { subscribeStoryProgress } from '../three/storyProgress';

interface Props { readonly exploreActive: boolean; }
interface IndicatorState { readonly current: number; readonly total: number; }

const WHEEL_TICKS = Array.from({ length: 12 }, (_, index) => index * 30);
const formatIndex = (value: number): string => value.toString().padStart(2, '0');
const NAV_ITEMS = [
  { label: 'Explore', href: '#explore', first: 1, last: 1 },
  { label: 'Exterior', href: '#performance', first: 2, last: 5 },
  { label: 'Interior', href: '#interior', first: 6, last: 11 },
  { label: 'Overview', href: '#hero', first: 12, last: 12 },
] as const;

export function Header({ exploreActive }: Props) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorStateRef = useRef<IndicatorState>({ current: 1, total: 12 });
  const [indicator, setIndicator] = useState<IndicatorState>(indicatorStateRef.current);

  useEffect(() => subscribeStoryProgress(({ progress, current, total }) => {
    const visualProgress = (1 + progress * (total - 1)) / total;
    indicatorRef.current?.style.setProperty('--story-progress', (visualProgress * 100).toFixed(3));
    indicatorRef.current?.style.setProperty('--story-wheel-turn', `${(progress * 1.2).toFixed(3)}turn`);
    if (indicatorStateRef.current.current === current && indicatorStateRef.current.total === total) return;
    indicatorStateRef.current = { current, total };
    setIndicator(indicatorStateRef.current);
  }), []);

  return (
    <header className={`site-header${exploreActive ? ' is-muted' : ''}`} data-story-index={indicator.current} inert={exploreActive}>
      <a className='wordmark' href='#explore' aria-label='NORKA R35 — back to the beginning'>
        <img className='wordmark__logo' src='/brand/norka-compass-logo-512.png' width='44' height='44' alt='' aria-hidden='true' />
        <span className='wordmark__text'><span>NORKA</span><strong>R35</strong></span>
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

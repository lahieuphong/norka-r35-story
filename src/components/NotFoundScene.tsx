import { useCallback, useRef, type PointerEvent } from 'react';

interface Props {
  readonly reducedMotion: boolean;
}

const DEPTH_LAYERS = Array.from({ length: 8 }, (_, index) => index);
const ORBIT_RINGS = Array.from({ length: 4 }, (_, index) => index);
const ROUTE_POINTS = Array.from({ length: 5 }, (_, index) => index);

export function NotFoundScene({ reducedMotion }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);

  const resetTilt = useCallback((): void => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.removeProperty('--not-found-pitch');
    stage.style.removeProperty('--not-found-yaw');
  }, []);

  const updateTilt = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    if (reducedMotion || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty('--not-found-pitch', `${(-4 - vertical * 6).toFixed(2)}deg`);
    stage.style.setProperty('--not-found-yaw', `${(-8 + horizontal * 10).toFixed(2)}deg`);
  }, [reducedMotion]);

  return (
    <div
      className='not-found-scene'
      aria-hidden='true'
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
    >
      <div ref={stageRef} className='not-found-scene__stage'>
        <div className='not-found-scene__grid' />
        <div className='not-found-scene__route'>
          {ROUTE_POINTS.map((point) => <i key={point} />)}
        </div>
        <div className='not-found-scene__orbit'>
          {ORBIT_RINGS.map((ring) => <span key={ring} />)}
        </div>
        <div className='not-found-scene__code'>
          {DEPTH_LAYERS.map((depth) => (
            <span
              key={depth}
              className='not-found-scene__code-layer'
              style={{ transform: `translate3d(${-depth * 0.2}rem, ${depth * 0.13}rem, ${-depth * 0.72}rem)` }}
            >
              404
            </span>
          ))}
          <span className='not-found-scene__code-face'>404</span>
        </div>
        <span className='not-found-scene__label'>Signal lost</span>
        <span className='not-found-scene__coordinate'>N 00° / E 404°</span>
      </div>
    </div>
  );
}

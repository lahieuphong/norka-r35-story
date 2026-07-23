import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ExplorePhase, ExploreViewPhase } from './experienceTypes';
import { DRIVER_DOOR_HOTSPOT } from './interiorTransitionShots';

interface Props {
  readonly available: boolean;
  readonly phase: ExplorePhase;
  readonly viewPhase: ExploreViewPhase;
  readonly onActivate: () => void;
}

export function DoorHotspot({ available, phase, viewPhase, onActivate }: Props) {
  const anchorRef = useRef<THREE.Group>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const visibleRef = useRef<boolean | null>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const interactive = available && phase === 'explore' && viewPhase === 'exterior';

  const updateLabelSide = useCallback(() => {
    const content = contentRef.current;
    const button = buttonRef.current;
    if (!content || !button || content.dataset.visible !== 'true') return;
    const viewportWidth = document.documentElement.clientWidth;
    const buttonRight = button.getBoundingClientRect().right;
    const labelWidth = labelRef.current?.getBoundingClientRect().width ?? 112;
    content.dataset.labelSide = buttonRight + labelWidth + 8 > viewportWidth ? 'left' : 'right';
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const viewport = window.visualViewport;
    const observer = new ResizeObserver(updateLabelSide);
    observer.observe(document.documentElement);
    window.addEventListener('resize', updateLabelSide);
    viewport?.addEventListener('resize', updateLabelSide);
    const frame = requestAnimationFrame(updateLabelSide);
    const settledFrame = window.setTimeout(updateLabelSide, 300);
    const layoutCheck = window.setInterval(updateLabelSide, 200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settledFrame);
      window.clearInterval(layoutCheck);
      observer.disconnect();
      window.removeEventListener('resize', updateLabelSide);
      viewport?.removeEventListener('resize', updateLabelSide);
    };
  }, [interactive, updateLabelSide]);

  useFrame(({ camera }) => {
    const content = contentRef.current;
    const button = buttonRef.current;
    const anchor = anchorRef.current;
    if (!content || !button || !anchor) return;
    if (!interactive) {
      if (visibleRef.current === false) return;
      visibleRef.current = false;
      content.dataset.visible = 'false';
      content.style.pointerEvents = 'none';
      button.disabled = true;
      button.tabIndex = -1;
      button.setAttribute('aria-hidden', 'true');
      if (document.activeElement === button) button.blur();
      return;
    }
    anchor.getWorldPosition(worldPosition);
    projectedPosition.copy(worldPosition).project(camera);
    const facingDriverSide = camera.position.x > worldPosition.x + 0.12;
    const onScreen = projectedPosition.z > -1 && projectedPosition.z < 1
      && Math.abs(projectedPosition.x) < 0.96 && Math.abs(projectedPosition.y) < 0.94;
    const visible = facingDriverSide && onScreen;
    if (visibleRef.current === visible) return;
    visibleRef.current = visible;
    content.dataset.visible = visible ? 'true' : 'false';
    content.style.pointerEvents = visible ? 'auto' : 'none';
    button.disabled = !visible;
    button.tabIndex = visible ? 0 : -1;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) updateLabelSide();
    if (!visible && document.activeElement === button) button.blur();
  });

  return (
    <group ref={anchorRef} position={DRIVER_DOOR_HOTSPOT}>
      <Html center wrapperClass="door-hotspot-anchor" zIndexRange={[36, 28]}>
        <div ref={contentRef} className="door-hotspot-wrap" data-visible="false">
          <button
            ref={buttonRef}
            type="button"
            className="door-hotspot"
            aria-label="Open the driver door"
            data-door-hotspot
            disabled={!interactive}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); event.currentTarget.blur(); onActivate(); }}
          >
            <span className="door-hotspot__ring" aria-hidden="true"><span /></span>
            <span ref={labelRef} className="door-hotspot__label">Open</span>
          </button>
        </div>
      </Html>
    </group>
  );
}

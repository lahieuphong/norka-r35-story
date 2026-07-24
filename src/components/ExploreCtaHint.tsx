import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { StoryFlowIcon, type StoryFlowIconVariant } from './StorySection';

export type CtaHintIntent = 'explore' | 'return';

interface Props {
  readonly visible: boolean;
  readonly intent?: CtaHintIntent;
  readonly ctaButtonRef: RefObject<HTMLButtonElement | null>;
  readonly ctaIconRef: RefObject<SVGSVGElement | null>;
  readonly onDismiss: () => void;
  readonly onPresented?: () => void;
}

interface HintContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly targetLabel: string;
  readonly icon: StoryFlowIconVariant;
}

interface TargetBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface HintGeometry {
  readonly target: TargetBox;
  readonly iconCenter: { readonly x: number; readonly y: number };
  readonly iconWidth: number;
  readonly iconHeight: number;
  readonly cardPlacement: 'above' | 'below';
  readonly cardStyle: HintCardStyle;
}

type HintCardStyle = CSSProperties & {
  readonly '--explore-hint-caret-x': string;
};

const VIEWPORT_GUTTER = 16;
const CARD_MAX_WIDTH = 300;
const CARD_MIN_SPACE = 160;
const CARD_GAP = 18;
const MIN_TARGET_HEIGHT = 44;
const MIN_VIEWPORT_HEIGHT = 280;
const HINT_CONTENT: Record<CtaHintIntent, HintContent> = {
  explore: {
    eyebrow: 'Interactive 3D',
    title: 'Explore the R35',
    description: 'Select the highlighted control to begin.',
    targetLabel: 'Enter the interactive 3D experience',
    icon: 'advance',
  },
  return: {
    eyebrow: 'Story complete',
    title: 'Return to section 01',
    description: 'Select the highlighted control to begin again.',
    targetLabel: 'Return to section 1',
    icon: 'return',
  },
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

function readGeometry(button: HTMLButtonElement, icon: SVGSVGElement, cardHeight: number): HintGeometry | null {
  const buttonRect = button.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  const copy = button.closest<HTMLElement>('[data-story-copy]');
  const buttonStyle = window.getComputedStyle(button);
  const copyStyle = copy ? window.getComputedStyle(copy) : null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (
    button.disabled
    || viewportHeight < MIN_VIEWPORT_HEIGHT
    || buttonRect.width <= 0
    || buttonRect.height <= 0
    || iconRect.width <= 0
    || iconRect.height <= 0
    || buttonRect.bottom <= 0
    || buttonRect.top >= viewportHeight
    || buttonRect.right <= 0
    || buttonRect.left >= viewportWidth
    || buttonStyle.display === 'none'
    || buttonStyle.visibility === 'hidden'
    || (copyStyle && (copyStyle.display === 'none' || copyStyle.visibility === 'hidden' || Number(copyStyle.opacity) < 0.1))
  ) return null;

  const targetHeight = Math.max(MIN_TARGET_HEIGHT, buttonRect.height);
  const targetTop = buttonRect.top - (targetHeight - buttonRect.height) / 2;
  const target: TargetBox = {
    left: buttonRect.left,
    top: targetTop,
    width: buttonRect.width,
    height: targetHeight,
  };
  const iconCenter = {
    x: iconRect.left + iconRect.width / 2,
    y: iconRect.top + iconRect.height / 2,
  };
  const cardWidth = Math.min(CARD_MAX_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2);
  const cardLeft = clamp(
    iconCenter.x - cardWidth + 36,
    VIEWPORT_GUTTER,
    viewportWidth - cardWidth - VIEWPORT_GUTTER,
  );
  const spaceAbove = target.top - VIEWPORT_GUTTER;
  const spaceBelow = viewportHeight - (target.top + target.height) - VIEWPORT_GUTTER;
  const requiredCardSpace = cardHeight + CARD_GAP;
  const cardPlacement = spaceAbove >= requiredCardSpace || spaceAbove >= spaceBelow ? 'above' : 'below';
  const caretX = clamp(iconCenter.x - cardLeft, 28, cardWidth - 28);
  const desiredCardTop = cardPlacement === 'above'
    ? target.top - CARD_GAP - cardHeight
    : target.top + target.height + CARD_GAP;
  const cardTop = clamp(
    desiredCardTop,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportHeight - cardHeight - VIEWPORT_GUTTER),
  );
  const cardStyle: HintCardStyle = {
    left: cardLeft,
    top: cardTop,
    width: cardWidth,
    '--explore-hint-caret-x': `${caretX}px`,
  };

  return {
    target,
    iconCenter,
    iconWidth: iconRect.width,
    iconHeight: iconRect.height,
    cardPlacement,
    cardStyle,
  };
}

export function ExploreCtaHint({
  visible,
  intent = 'explore',
  ctaButtonRef,
  ctaIconRef,
  onDismiss,
  onPresented,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const targetProxyRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activatingRef = useRef(false);
  const missingTargetDismissedRef = useRef(false);
  const [geometry, setGeometry] = useState<HintGeometry | null>(null);
  const [cardHeight, setCardHeight] = useState(CARD_MIN_SPACE);
  const titleId = useId();
  const descriptionId = useId();
  const content = HINT_CONTENT[intent];
  const ready = visible && geometry !== null;

  useLayoutEffect(() => {
    if (!visible) {
      setGeometry(null);
      missingTargetDismissedRef.current = false;
      return;
    }

    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const button = ctaButtonRef.current;
      const icon = ctaIconRef.current;
      const nextGeometry = button && icon ? readGeometry(button, icon, cardHeight) : null;
      if (!nextGeometry) {
        setGeometry(null);
        if (!missingTargetDismissedRef.current && button && icon) {
          missingTargetDismissedRef.current = true;
          queueMicrotask(onDismiss);
        }
        return;
      }
      missingTargetDismissedRef.current = false;
      setGeometry(nextGeometry);
    };
    const scheduleMeasure = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    if (ctaButtonRef.current) observer.observe(ctaButtonRef.current);
    if (ctaIconRef.current) observer.observe(ctaIconRef.current);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [cardHeight, ctaButtonRef, ctaIconRef, onDismiss, visible]);

  useLayoutEffect(() => {
    if (!ready) return;
    const card = cardRef.current;
    if (!card) return;
    const measureCard = (): void => {
      const nextHeight = card.getBoundingClientRect().height;
      if (nextHeight > 0) setCardHeight((current) => Math.abs(current - nextHeight) < 0.5 ? current : nextHeight);
    };
    measureCard();
    const observer = new ResizeObserver(measureCard);
    observer.observe(card);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    onPresented?.();
    const focusFrame = requestAnimationFrame(() => targetProxyRef.current?.focus({ preventScroll: true }));
    const preventViewportMove = (event: Event): void => event.preventDefault();
    dialog.addEventListener('wheel', preventViewportMove, { passive: false });
    dialog.addEventListener('touchmove', preventViewportMove, { passive: false });

    return () => {
      cancelAnimationFrame(focusFrame);
      dialog.removeEventListener('wheel', preventViewportMove);
      dialog.removeEventListener('touchmove', preventViewportMove);
      if (dialog.open) dialog.close();
      const previousFocus = previousFocusRef.current;
      if (!activatingRef.current && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      previousFocusRef.current = null;
      activatingRef.current = false;
    };
  }, [onPresented, ready]);

  const activateCta = useCallback((): void => {
    const originalButton = ctaButtonRef.current;
    if (!originalButton || originalButton.disabled) {
      onDismiss();
      return;
    }
    activatingRef.current = true;
    if (dialogRef.current?.open) dialogRef.current.close();
    onDismiss();
    originalButton.click();
  }, [ctaButtonRef, onDismiss]);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) onDismiss();
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    onDismiss();
  };

  if (!ready || !geometry) return null;
  const spotlightSize = Math.max(50, geometry.iconWidth + 22, geometry.iconHeight + 22);
  const targetStyle: CSSProperties = {
    left: geometry.target.left,
    top: geometry.target.top,
    width: geometry.target.width,
    height: geometry.target.height,
  };
  const spotlightStyle = {
    left: geometry.iconCenter.x - geometry.target.left,
    top: geometry.iconCenter.y - geometry.target.top,
    width: spotlightSize,
    height: spotlightSize,
    '--explore-hint-icon-width': `${geometry.iconWidth}px`,
    '--explore-hint-icon-height': `${geometry.iconHeight}px`,
  } as CSSProperties;

  return (
    <dialog
      ref={dialogRef}
      className={`explore-cta-hint explore-cta-hint--${intent}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-explore-cta-hint
      data-story-cta-hint={intent}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <button
        ref={targetProxyRef}
        className='explore-cta-hint__target'
        type='button'
        style={targetStyle}
        aria-label={content.targetLabel}
        aria-describedby={descriptionId}
        data-explore-cta-hint-target
        data-story-cta-hint-target={intent}
        onClick={activateCta}
      >
        <span className='explore-cta-hint__spotlight' style={spotlightStyle} aria-hidden='true'>
          <StoryFlowIcon className='explore-cta-hint__icon' variant={content.icon} />
        </span>
      </button>
      <section
        ref={cardRef}
        className={`explore-cta-hint__card is-${geometry.cardPlacement}`}
        style={geometry.cardStyle}
      >
        <div className='explore-cta-hint__heading'>
          <img
            className='explore-cta-hint__logo'
            src='/brand/norka-compass-logo-512.png'
            width='36'
            height='36'
            alt=''
            aria-hidden='true'
          />
          <div>
            <p className='explore-cta-hint__eyebrow'>{content.eyebrow}</p>
            <h2 id={titleId}>{content.title}</h2>
          </div>
        </div>
        <p id={descriptionId}>{content.description}</p>
        <div className='explore-cta-hint__footer'>
          <span className='explore-cta-hint__helper explore-cta-hint__helper--desktop'>Click outside to dismiss</span>
          <span className='explore-cta-hint__helper explore-cta-hint__helper--touch'>Tap outside to dismiss</span>
          <button type='button' onClick={onDismiss}>Not now</button>
        </div>
      </section>
    </dialog>
  );
}

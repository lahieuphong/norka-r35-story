import type { ReactNode, Ref } from 'react';

interface Props {
  readonly id: string; readonly index: string; readonly eyebrow: string; readonly heading: string; readonly body: string;
  readonly align?: 'left' | 'right'; readonly ctaLabel?: string; readonly ctaHref?: string; readonly onCta?: () => void;
  readonly ctaDisabled?: boolean; readonly ctaBusy?: boolean; readonly ctaIcon?: StoryFlowIconVariant;
  readonly ctaButtonRef?: Ref<HTMLButtonElement>; readonly ctaIconRef?: Ref<SVGSVGElement>; readonly children?: ReactNode;
}

export type StoryFlowIconVariant = 'advance' | 'return';

interface StoryFlowIconProps {
  readonly className?: string;
  readonly iconRef?: Ref<SVGSVGElement> | undefined;
  readonly variant?: StoryFlowIconVariant;
}

export function StoryFlowIcon({ className = 'story-cta__icon', iconRef, variant = 'advance' }: StoryFlowIconProps) {
  return (
    <svg
      ref={iconRef}
      className={`story-flow-icon story-flow-icon--${variant} ${className} ${className}--${variant}`}
      viewBox='0 0 28 20'
      data-icon-source='norka-story-actions'
      data-story-action-icon={variant}
      aria-hidden='true'
      focusable='false'
    >
      <path
        pathLength='1'
        d={variant === 'return'
          ? 'M26 16C20 16 20 5 13 5H4m4.5-3.5L4 5l4.5 3.5'
          : 'M2 16C8 16 8 5 15 5h9m-4.5-3.5L24 5l-4.5 3.5'}
      />
    </svg>
  );
}

export function StorySection({ id, index, eyebrow, heading, body, align = 'left', ctaLabel, ctaHref, onCta, ctaDisabled = false, ctaBusy = false, ctaIcon = 'advance', ctaButtonRef, ctaIconRef, children }: Props) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className={`story-section story-section--${align}`} data-story-section={id} aria-labelledby={headingId}>
      <div className='story-section__copy-slot'>
        <div className='story-section__copy-viewport'>
          <div className='story-section__copy' data-story-copy>
            <div className='story-section__meta'><span>{index}</span><span>{eyebrow}</span></div>
            <h1 id={headingId}>{heading}</h1>
            <p>{body}</p>
            {ctaLabel && ctaHref ? <a className='story-cta' href={ctaHref}><span>{ctaLabel}</span><StoryFlowIcon iconRef={ctaIconRef} variant={ctaIcon} /></a> : null}
            {ctaLabel && onCta ? <button ref={ctaButtonRef} className='story-cta' type='button' onClick={onCta} disabled={ctaDisabled} aria-busy={ctaBusy || undefined}><span>{ctaLabel}</span><StoryFlowIcon iconRef={ctaIconRef} variant={ctaIcon} /></button> : null}
          </div>
        </div>
      </div>
      {children}
      <span className='story-section__rail' aria-hidden='true' />
    </section>
  );
}

import type { ReactNode, Ref } from 'react';

interface Props {
  readonly id: string; readonly index: string; readonly eyebrow: string; readonly heading: string; readonly body: string;
  readonly align?: 'left' | 'right'; readonly ctaLabel?: string; readonly ctaHref?: string; readonly onCta?: () => void;
  readonly ctaDisabled?: boolean; readonly ctaButtonRef?: Ref<HTMLButtonElement>; readonly children?: ReactNode;
}

function StoryFlowIcon() {
  return (
    <svg className='story-cta__icon' viewBox='0 0 28 20' aria-hidden='true' focusable='false'>
      <path pathLength='1' d='M2 16C8 16 8 5 15 5h9m-4.5-3.5L24 5l-4.5 3.5' />
    </svg>
  );
}

export function StorySection({ id, index, eyebrow, heading, body, align = 'left', ctaLabel, ctaHref, onCta, ctaDisabled = false, ctaButtonRef, children }: Props) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className={`story-section story-section--${align}`} data-story-section={id} aria-labelledby={headingId}>
      <div className='story-section__copy-slot'>
        <div className='story-section__copy-viewport'>
          <div className='story-section__copy' data-story-copy>
            <div className='story-section__meta'><span>{index}</span><span>{eyebrow}</span></div>
            <h1 id={headingId}>{heading}</h1>
            <p>{body}</p>
            {ctaLabel && ctaHref ? <a className='story-cta' href={ctaHref}><span>{ctaLabel}</span><StoryFlowIcon /></a> : null}
            {ctaLabel && onCta ? <button ref={ctaButtonRef} className='story-cta' type='button' onClick={onCta} disabled={ctaDisabled}><span>{ctaLabel}</span><StoryFlowIcon /></button> : null}
          </div>
        </div>
      </div>
      {children}
      <span className='story-section__rail' aria-hidden='true' />
    </section>
  );
}

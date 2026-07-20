import type { ReactNode, Ref } from 'react';
interface Props {
  readonly id: string; readonly index: string; readonly eyebrow: string; readonly heading: string; readonly body: string;
  readonly align?: 'left' | 'right'; readonly ctaLabel?: string; readonly ctaHref?: string; readonly onCta?: () => void;
  readonly ctaDisabled?: boolean; readonly ctaButtonRef?: Ref<HTMLButtonElement>; readonly children?: ReactNode;
}
export function StorySection({ id, index, eyebrow, heading, body, align = 'left', ctaLabel, ctaHref, onCta, ctaDisabled = false, ctaButtonRef, children }: Props) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className={`story-section story-section--${align}`} data-story-section={id} aria-labelledby={headingId}>
      <div className="story-section__copy" data-story-copy>
        <div className="story-section__meta"><span>{index}</span><span>{eyebrow}</span></div>
        <h1 id={headingId}>{heading}</h1>
        <p>{body}</p>
        {ctaLabel && ctaHref ? <a className="story-cta" href={ctaHref}><span>{ctaLabel}</span><span aria-hidden="true">↘</span></a> : null}
        {ctaLabel && onCta ? <button ref={ctaButtonRef} className="story-cta" type="button" onClick={onCta} disabled={ctaDisabled}><span>{ctaLabel}</span><span aria-hidden="true">↗</span></button> : null}
      </div>
      {children}
      <span className="story-section__rail" aria-hidden="true" />
    </section>
  );
}

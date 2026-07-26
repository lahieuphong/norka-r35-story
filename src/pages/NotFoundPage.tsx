import { useEffect } from 'react';
import { NotFoundScene } from '../components/NotFoundScene';
import { StoryFlowIcon } from '../components/StorySection';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  readonly requestedPath: string;
}

function formatRequestedPath(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}

export function NotFoundPage({ requestedPath }: Props) {
  const reducedMotion = useReducedMotion();
  const homeHref = `${import.meta.env.BASE_URL}#explore`;
  const logoHref = `${import.meta.env.BASE_URL}brand/norka-compass-logo-512.png`;
  const readablePath = formatRequestedPath(requestedPath);

  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const robots = existingRobots ?? document.createElement('meta');
    const previousRobotsContent = existingRobots?.content;

    document.title = 'Page not found — NORKA R35';
    if (!existingRobots) {
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = 'noindex, nofollow';

    return () => {
      document.title = previousTitle;
      if (existingRobots) {
        existingRobots.content = previousRobotsContent ?? '';
      } else {
        robots.remove();
      }
    };
  }, []);

  return (
    <div className='not-found-page'>
      <a className='skip-link' href='#not-found-content'>Skip to error details</a>
      <header className='not-found-page__header'>
        <a className='not-found-page__wordmark' href={homeHref} aria-label='NORKA R35 — return to the 3D experience'>
          <img src={logoHref} width='44' height='44' alt='' aria-hidden='true' />
          <span>NORKA <strong>R35</strong></span>
        </a>
        <span className='not-found-page__system'>Route / 404</span>
      </header>

      <main id='not-found-content' className='not-found-page__main'>
        <section className='not-found-page__copy' aria-labelledby='not-found-heading'>
          <div className='not-found-page__meta'><span>404</span><span>Navigation fault</span></div>
          <h1 id='not-found-heading'>Road not found.</h1>
          <p>The destination sits beyond the mapped experience. Return to the NORKA R35 story and restart from the beginning.</p>
          <p className='not-found-page__request'>
            <span>Requested route</span>
            <code title={readablePath}>{readablePath}</code>
          </p>
          <a className='story-cta not-found-page__cta' href={homeHref}>
            <span>Return to experience</span>
            <StoryFlowIcon />
          </a>
        </section>

        <NotFoundScene reducedMotion={reducedMotion} />
      </main>

      <footer className='not-found-page__footer'>
        <span>Coordinates unavailable</span>
        <span>Engineered beyond limits</span>
      </footer>
    </div>
  );
}

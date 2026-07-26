import { useEffect, useLayoutEffect, useState } from 'react';
import { NotFoundPage } from '../pages/NotFoundPage';
import { App } from './App';

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

export function isExperiencePath(pathname: string): boolean {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const normalizedPathname = normalizePathname(pathname);
  const basePathname = normalizePathname(baseUrl);
  const indexPathname = normalizePathname(`${baseUrl}index.html`);
  return normalizedPathname === basePathname || normalizedPathname === indexPathname;
}

export function AppRouter() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const experienceRoute = isExperiencePath(pathname);

  useEffect(() => {
    const syncPathname = (): void => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    return () => window.removeEventListener('popstate', syncPathname);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('is-not-found', !experienceRoute);
    return () => document.documentElement.classList.remove('is-not-found');
  }, [experienceRoute]);

  return experienceRoute
    ? <App />
    : <NotFoundPage requestedPath={pathname} />;
}

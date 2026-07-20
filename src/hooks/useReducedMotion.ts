import { useEffect, useState } from 'react';
const QUERY = '(prefers-reduced-motion: reduce)';
export function useReducedMotion(): boolean {
  const [value, setValue] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const change = (event: MediaQueryListEvent): void => setValue(event.matches);
    setValue(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return value;
}

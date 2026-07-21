import { usesCompactCamera, usesLandscapeCamera } from './cameraShots';

export interface DeviceProfile {
  readonly isMobile: boolean;
  readonly compact: boolean;
  readonly landscape: boolean;
  readonly lowEnd: boolean;
  readonly useMobileModel: boolean;
  readonly dpr: number;
  readonly antialias: boolean;
  readonly anisotropy: number;
}

interface NavigatorWithMemory extends Navigator {
  readonly deviceMemory?: number;
}

function readHardwareHints(): { readonly touch: boolean; readonly lowEnd: boolean } {
  const navigatorWithMemory = navigator as NavigatorWithMemory;
  const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const lowMemory = typeof navigatorWithMemory.deviceMemory === 'number' && navigatorWithMemory.deviceMemory <= 4;
  const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  return { touch, lowEnd: lowMemory || lowCpu };
}

export function shouldUseMobileModel(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const { touch, lowEnd } = readHardwareHints();
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  const mobileViewport = window.innerWidth <= 767 || (touch && shortEdge <= 1024);
  return mobileViewport || lowEnd;
}

export function readDeviceProfile(): DeviceProfile {
  const { touch, lowEnd } = readHardwareHints();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const shortEdge = Math.min(width, height);
  const isMobile = width <= 767 || (touch && shortEdge <= 1024);
  const cap = lowEnd ? 1.25 : isMobile ? 1.5 : 2;
  const pixelBudget = lowEnd ? 1_250_000 : isMobile ? 2_000_000 : 4_000_000;
  const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, cap, budgetDpr));
  return {
    isMobile,
    compact: usesCompactCamera(width, height),
    landscape: usesLandscapeCamera(width, height),
    lowEnd,
    useMobileModel: isMobile || lowEnd,
    dpr,
    // Phones benefit visibly from MSAA around the silhouette. High-DPR desktop
    // output is already supersampled, while low-end devices skip the extra
    // multisampled framebuffer entirely.
    antialias: !lowEnd && (isMobile || dpr <= 1.25),
    anisotropy: lowEnd ? 2 : isMobile ? 4 : 8,
  };
}

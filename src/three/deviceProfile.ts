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
  // Browsers commonly clamp these hints to 4 for privacy, including on phones
  // that can comfortably render this scene. Reserve the constrained tier for
  // genuinely small devices instead of degrading the majority of mobile GPUs.
  const lowMemory = typeof navigatorWithMemory.deviceMemory === 'number' && navigatorWithMemory.deviceMemory <= 2;
  const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
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
  const cap = lowEnd ? 1.5 : 2;
  const pixelBudget = lowEnd ? 1_750_000 : isMobile ? 3_000_000 : 4_000_000;
  const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
  // A DPR floor of 1 defeats the pixel budget on ultrawide, 4K, and 5K
  // desktops. Rendering slightly below native resolution is substantially
  // cheaper than allocating a full-resolution multisampled framebuffer.
  const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap, budgetDpr));
  const renderPixels = width * height * dpr * dpr;
  return {
    isMobile,
    compact: usesCompactCamera(width, height),
    landscape: usesLandscapeCamera(width, height),
    lowEnd,
    useMobileModel: isMobile || lowEnd,
    dpr,
    // Constrained hardware never pays for a multisampled framebuffer. Normal
    // phones use MSAA only below 2x supersampling, and desktop MSAA is limited
    // by both DPR and render-target area so native 4K cannot enable it.
    antialias: !lowEnd && (isMobile
      ? dpr < 1.9 && renderPixels <= 1_500_000
      : dpr <= 1.25 && renderPixels <= 2_250_000),
    anisotropy: lowEnd ? 4 : 8,
  };
}

import { usesCompactCamera, usesLandscapeCamera } from './cameraShots';

export type ModelTier = 'desktop' | 'mobile' | 'mobile-low';

export interface DeviceProfile {
  readonly isMobile: boolean;
  readonly compact: boolean;
  readonly landscape: boolean;
  readonly lowEnd: boolean;
  readonly modelTier: ModelTier;
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

function selectModelTier(isMobile: boolean, lowEnd: boolean): ModelTier {
  if (!isMobile) return 'desktop';
  return lowEnd ? 'mobile-low' : 'mobile';
}

export function readDeviceProfile(): DeviceProfile {
  const { touch, lowEnd } = readHardwareHints();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const shortEdge = Math.min(width, height);
  const isMobile = width <= 767 || (touch && shortEdge <= 1024);
  const cap = lowEnd ? 1.5 : isMobile ? 1.75 : 2;
  const pixelBudget = lowEnd ? 1_750_000 : isMobile ? 3_000_000 : 4_000_000;
  const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
  // A DPR floor of 1 defeats the pixel budget on ultrawide, 4K, and 5K
  // desktops. Rendering slightly below native resolution is substantially
  // cheaper than allocating a full-resolution multisampled framebuffer.
  const rawDpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap, budgetDpr));
  // Mobile browser chrome can emit many tiny viewport-height changes while it
  // collapses. Quantized DPR steps avoid reallocating render targets for every
  // one of those changes and never exceed the calculated pixel budget.
  const dpr = isMobile
    ? Math.max(0.5, Math.floor((rawDpr + Number.EPSILON) * 4) / 4)
    : rawDpr;
  const renderPixels = width * height * dpr * dpr;
  return {
    isMobile,
    compact: usesCompactCamera(width, height),
    landscape: usesLandscapeCamera(width, height),
    lowEnd,
    modelTier: selectModelTier(isMobile, lowEnd),
    dpr,
    // Mobile already renders at up to 2x DPR. Avoiding a multisampled default
    // framebuffer saves considerably more memory than MSAA adds in edge
    // quality there. Keep the existing guarded desktop behavior unchanged.
    antialias: !isMobile && !lowEnd && dpr <= 1.25 && renderPixels <= 2_250_000,
    anisotropy: isMobile || lowEnd ? 4 : 8,
  };
}

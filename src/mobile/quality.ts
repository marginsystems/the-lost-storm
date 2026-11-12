export type QualityName = 'desktop' | 'mobile';

export interface QualityTier {
  readonly name: QualityName;
  readonly maxPixelRatio: number;
  readonly pixelBudget: number | null;
  readonly bloom: boolean;
  readonly shadows: boolean;
  readonly shadowSize: number;
  readonly msaaSamples: number;
  readonly antialias: boolean;
  readonly zoneLights: number;
  readonly flashLights: number;
  readonly markerLights: boolean;
  readonly particleCapacity: number;
  readonly maxTextureSize: number;
  readonly maxModelTextureSize: number;
  readonly preloadNearZones: boolean;
  readonly halfTextures: boolean;
  readonly releaseOtherZones: boolean;
}

export const QUALITY_TIERS: Readonly<Record<QualityName, QualityTier>> = {
  desktop: {
    name: 'desktop',
    maxPixelRatio: 1.5,
    pixelBudget: null,
    bloom: true,
    shadows: true,
    shadowSize: 2048,
    msaaSamples: 4,
    antialias: true,
    zoneLights: 6,
    flashLights: 3,
    markerLights: true,
    particleCapacity: 2400,
    maxTextureSize: 4096,
    maxModelTextureSize: 4096,
    preloadNearZones: true,
    halfTextures: false,
    releaseOtherZones: false,
  },
  mobile: {
    name: 'mobile',
    maxPixelRatio: 1.25,
    pixelBudget: 900_000,
    bloom: false,
    shadows: false,
    shadowSize: 512,
    msaaSamples: 0,
    antialias: false,
    zoneLights: 3,
    flashLights: 1,
    markerLights: false,
    particleCapacity: 700,
    maxTextureSize: 512,
    maxModelTextureSize: 256,
    preloadNearZones: false,
    halfTextures: true,
    releaseOtherZones: true,
  },
};

export const DEVICE_LIMITS = {
  lowMemoryGigabytes: 4,
  lowCoreCount: 4,
  minPixelRatio: 0.75,
  pixelRatioQuantum: 1 / 16,
} as const;

export interface DeviceFacts {
  readonly search: string;
  readonly coarsePointer: boolean;
  readonly deviceMemory: number | null;
  readonly cores: number | null;
}

export function chooseQuality(facts: DeviceFacts): QualityName {
  const forced: string | null = new URLSearchParams(facts.search).get('quality');
  if (forced === 'desktop' || forced === 'mobile') return forced;
  if (facts.coarsePointer) return 'mobile';
  if (facts.deviceMemory !== null && facts.deviceMemory <= DEVICE_LIMITS.lowMemoryGigabytes && facts.cores !== null && facts.cores <= DEVICE_LIMITS.lowCoreCount) return 'mobile';
  return 'desktop';
}

export function pixelRatioFor(tier: QualityTier, devicePixelRatio: number, cssWidth: number, cssHeight: number): number {
  const capped: number = Math.min(devicePixelRatio > 0 ? devicePixelRatio : 1, tier.maxPixelRatio);
  if (tier.pixelBudget === null || !(cssWidth > 0) || !(cssHeight > 0)) return capped;
  const fitting: number = Math.floor(Math.sqrt(tier.pixelBudget / (cssWidth * cssHeight)) / DEVICE_LIMITS.pixelRatioQuantum) * DEVICE_LIMITS.pixelRatioQuantum;
  return Math.min(capped, Math.max(DEVICE_LIMITS.minPixelRatio, fitting));
}

export function fittedSize(width: number, height: number, maxSize: number): { readonly width: number; readonly height: number } {
  const longest: number = Math.max(width, height);
  if (longest <= maxSize || longest <= 0) return { width, height };
  const scale: number = maxSize / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface Quality {
  readonly tier: QualityTier;
  set(name: QualityName): void;
  subscribe(listener: (tier: QualityTier) => void): () => void;
}

export function createQuality(initial: QualityName): Quality {
  let tier: QualityTier = QUALITY_TIERS[initial];
  const listeners: Set<(tier: QualityTier) => void> = new Set<(tier: QualityTier) => void>();
  return {
    get tier(): QualityTier {
      return tier;
    },
    set(name: QualityName): void {
      if (tier.name === name) return;
      tier = QUALITY_TIERS[name];
      for (const listener of listeners) listener(tier);
    },
    subscribe(listener: (next: QualityTier) => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

let current: QualityTier = QUALITY_TIERS.desktop;

export const HALF_TEXTURES = {
  root: 'textures/',
  folder: 'textures/half/',
} as const;

export function texturePath(path: string, half: boolean): string {
  if (!half || !path.startsWith(HALF_TEXTURES.root) || path.startsWith(HALF_TEXTURES.folder)) return path;
  return `${HALF_TEXTURES.folder}${path.slice(HALF_TEXTURES.root.length)}`;
}

export function renderBudget(): QualityTier {
  return current;
}

export function configureRenderBudget(tier: QualityTier): void {
  current = tier;
}

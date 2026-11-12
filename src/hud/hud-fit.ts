export const HUD_FIT = {
  margin: 12,
  corner: 202,
  rowLabelled: 640,
  rowKeys: 428,
  rowSpill: 112,
  volumeInline: 58,
  barHeight: 108,
  globeHeight: 156,
  stackGap: 10,
  heightShare: 0.36,
  sheetWidth: 720,
  sheetHeight: 540,
  minimapLargest: 188,
  minimapSmallest: 96,
  minimapWidthShare: 0.2,
  minimapHeightShare: 0.3,
  questsWidest: 250,
  questsNarrowest: 150,
  questsShare: 0.3,
} as const;

export type BarLabels = 'names' | 'keys';

export interface HudFit {
  readonly labels: BarLabels;
  readonly stacked: boolean;
  readonly scale: number;
  readonly clusterHeight: number;
  readonly lift: number;
  readonly sheets: boolean;
  readonly wide: boolean;
  readonly minimap: number;
  readonly quests: number;
}

interface Arrangement {
  readonly labels: BarLabels;
  readonly stacked: boolean;
  readonly width: number;
  readonly height: number;
}

const ARRANGEMENTS: readonly Arrangement[] = [
  { labels: 'names', stacked: false, width: HUD_FIT.corner * 2 + HUD_FIT.rowLabelled + HUD_FIT.rowSpill, height: HUD_FIT.globeHeight },
  { labels: 'keys', stacked: false, width: HUD_FIT.corner * 2 + HUD_FIT.rowKeys + HUD_FIT.rowSpill, height: HUD_FIT.globeHeight },
  { labels: 'keys', stacked: true, width: Math.max(HUD_FIT.corner * 2, HUD_FIT.rowKeys + HUD_FIT.volumeInline), height: HUD_FIT.globeHeight + HUD_FIT.stackGap + HUD_FIT.barHeight },
];

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function scaleFor(arrangement: Arrangement, width: number, height: number): number {
  return Math.min(1, (width - HUD_FIT.margin * 2) / arrangement.width, (height * HUD_FIT.heightShare) / arrangement.height);
}

function choose(width: number, height: number): { readonly arrangement: Arrangement; readonly scale: number } {
  let best: { arrangement: Arrangement; scale: number } | null = null;
  for (const arrangement of ARRANGEMENTS) {
    const scale: number = scaleFor(arrangement, width, height);
    if (scale >= 1) return { arrangement, scale: 1 };
    if (best === null || scale > best.scale) best = { arrangement, scale };
  }
  return best ?? { arrangement: ARRANGEMENTS[0] ?? { labels: 'names', stacked: false, width, height }, scale: 1 };
}

export function arrangementWidth(fit: HudFit): number {
  const found: Arrangement | undefined = ARRANGEMENTS.find((arrangement: Arrangement): boolean => arrangement.labels === fit.labels && arrangement.stacked === fit.stacked);
  return (found?.width ?? 0) * fit.scale;
}

export function hudFit(width: number, height: number): HudFit {
  const { arrangement, scale } = choose(width, height);
  const rounded: number = Math.floor(scale * 1000) / 1000;
  return {
    labels: arrangement.labels,
    stacked: arrangement.stacked,
    scale: rounded,
    clusterHeight: Math.ceil(arrangement.height * rounded + HUD_FIT.margin),
    lift: arrangement.stacked ? Math.ceil((HUD_FIT.globeHeight + HUD_FIT.stackGap) * rounded) : 0,
    sheets: width < HUD_FIT.sheetWidth || height < HUD_FIT.sheetHeight,
    wide: width >= height,
    minimap: Math.round(clamp(Math.min(width * HUD_FIT.minimapWidthShare, height * HUD_FIT.minimapHeightShare), HUD_FIT.minimapSmallest, HUD_FIT.minimapLargest)),
    quests: Math.round(clamp(width * HUD_FIT.questsShare, HUD_FIT.questsNarrowest, HUD_FIT.questsWidest)),
  };
}

export const HUD_FIT = {
  margin: 12,
  edge: 14,
  cornerGap: 12,
  rowMinScale: 0.7,
  rowLabelled: 746,
  rowKeys: 534,
  rowSpill: 112,
  volumeInline: 58,
  barHeight: 108,
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

export interface HudGauge {
  readonly width: number;
  readonly height: number;
}

export const GLOBE_GAUGE: HudGauge = { width: 140, height: 144 };

export interface BandRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface HudBand {
  readonly life: BandRect;
  readonly mana: BandRect;
  readonly bar: BandRect;
}

export interface HudFit {
  readonly labels: BarLabels;
  readonly stacked: boolean;
  readonly scale: number;
  readonly clusterHeight: number;
  readonly lift: number;
  readonly sheets: boolean;
  readonly wide: boolean;
  readonly bandWidth: number;
  readonly minimap: number;
  readonly quests: number;
}

interface Arrangement {
  readonly labels: BarLabels;
  readonly stacked: boolean;
  readonly width: number;
  readonly height: number;
}

function corner(gauge: HudGauge): number {
  return HUD_FIT.edge + gauge.width + HUD_FIT.cornerGap;
}

function arrangements(gauge: HudGauge): readonly Arrangement[] {
  const ends: number = corner(gauge) * 2;
  const low: number = Math.max(gauge.height, HUD_FIT.barHeight) + HUD_FIT.margin;
  return [
    { labels: 'names', stacked: false, width: ends + HUD_FIT.rowLabelled + HUD_FIT.rowSpill, height: low },
    { labels: 'keys', stacked: false, width: ends + HUD_FIT.rowKeys + HUD_FIT.rowSpill, height: low },
    { labels: 'keys', stacked: true, width: Math.max(ends, HUD_FIT.rowKeys + HUD_FIT.volumeInline), height: gauge.height + HUD_FIT.margin + HUD_FIT.stackGap + HUD_FIT.barHeight },
  ];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function scaleFor(arrangement: Arrangement, width: number, height: number): number {
  return Math.min(1, (width - HUD_FIT.margin * 2) / arrangement.width, (height * HUD_FIT.heightShare) / arrangement.height);
}

interface Choice {
  readonly arrangement: Arrangement;
  readonly scale: number;
}

function choose(width: number, height: number, gauge: HudGauge): Choice {
  const options: Choice[] = arrangements(gauge).map((arrangement: Arrangement): Choice => ({ arrangement, scale: Math.min(1, scaleFor(arrangement, width, height)) }));
  const rows: Choice[] = options.filter((option: Choice): boolean => !option.arrangement.stacked);
  const whole: Choice | undefined = rows.find((option: Choice): boolean => option.scale >= 1);
  if (whole !== undefined) return whole;
  const row: Choice | undefined = rows.reduce<Choice | undefined>((best: Choice | undefined, option: Choice): Choice => (best === undefined || option.scale > best.scale ? option : best), undefined);
  if (row !== undefined && row.scale >= HUD_FIT.rowMinScale) return row;
  const best: Choice | undefined = options.reduce<Choice | undefined>((top: Choice | undefined, option: Choice): Choice => (top === undefined || option.scale > top.scale ? option : top), undefined);
  return best ?? { arrangement: { labels: 'names', stacked: false, width, height }, scale: 1 };
}

export function arrangementWidth(fit: HudFit): number {
  return fit.bandWidth;
}

export function hudBand(fit: HudFit, width: number, height: number, gauge: HudGauge = GLOBE_GAUGE): HudBand {
  const s: number = fit.scale;
  const gaugeWidth: number = gauge.width * s;
  const gaugeHeight: number = gauge.height * s;
  const ground: number = height - HUD_FIT.margin;
  const inset: number = HUD_FIT.edge * s;
  const barWidth: number = fit.bandWidth - corner(gauge) * s * (fit.stacked ? 0 : 2);
  const barHeight: number = HUD_FIT.barHeight * s;
  return {
    life: { x: inset, y: ground - gaugeHeight, w: gaugeWidth, h: gaugeHeight },
    mana: { x: width - inset - gaugeWidth, y: ground - gaugeHeight, w: gaugeWidth, h: gaugeHeight },
    bar: { x: (width - barWidth) / 2, y: ground - fit.lift - barHeight, w: barWidth, h: barHeight },
  };
}

export function hudFit(width: number, height: number, gauge: HudGauge = GLOBE_GAUGE): HudFit {
  const { arrangement, scale } = choose(width, height, gauge);
  const rounded: number = Math.floor(scale * 1000) / 1000;
  return {
    labels: arrangement.labels,
    stacked: arrangement.stacked,
    scale: rounded,
    clusterHeight: Math.ceil(arrangement.height * rounded + HUD_FIT.margin),
    lift: arrangement.stacked ? Math.ceil((gauge.height + HUD_FIT.margin + HUD_FIT.stackGap) * rounded) : 0,
    sheets: width < HUD_FIT.sheetWidth || height < HUD_FIT.sheetHeight,
    wide: width >= height,
    bandWidth: arrangement.width * rounded,
    minimap: Math.round(clamp(Math.min(width * HUD_FIT.minimapWidthShare, height * HUD_FIT.minimapHeightShare), HUD_FIT.minimapSmallest, HUD_FIT.minimapLargest)),
    quests: Math.round(clamp(width * HUD_FIT.questsShare, HUD_FIT.questsNarrowest, HUD_FIT.questsWidest)),
  };
}

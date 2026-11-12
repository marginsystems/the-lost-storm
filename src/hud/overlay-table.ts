export type OverlayId = 'inventory' | 'character' | 'trade' | 'chart' | 'map' | 'ladder' | 'choice' | 'reader' | 'endcard' | 'pause' | 'death';

export type OverlayLayer = 'side' | 'full' | 'card' | 'modal';

export type QueuedOverlay = 'choice' | 'endcard';

export interface OverlayEntry {
  readonly layer: OverlayLayer;
  readonly rank: number;
  readonly blocks: boolean;
  readonly requires: OverlayId | null;
}

export const OVERLAY_TABLE: Readonly<Record<OverlayId, OverlayEntry>> = {
  character: { layer: 'side', rank: 1, blocks: false, requires: null },
  inventory: { layer: 'side', rank: 2, blocks: false, requires: null },
  trade: { layer: 'side', rank: 3, blocks: false, requires: 'inventory' },
  chart: { layer: 'full', rank: 4, blocks: false, requires: null },
  map: { layer: 'full', rank: 5, blocks: false, requires: null },
  ladder: { layer: 'full', rank: 6, blocks: false, requires: null },
  choice: { layer: 'card', rank: 7, blocks: false, requires: null },
  reader: { layer: 'modal', rank: 8, blocks: true, requires: null },
  endcard: { layer: 'card', rank: 9, blocks: true, requires: null },
  pause: { layer: 'modal', rank: 10, blocks: true, requires: null },
  death: { layer: 'modal', rank: 11, blocks: true, requires: null },
};

export const OVERLAY_PAIRS: readonly (readonly [OverlayId, OverlayId])[] = [
  ['inventory', 'character'],
  ['inventory', 'trade'],
];

export const QUEUED_OVERLAYS: readonly QueuedOverlay[] = ['choice', 'endcard'];

export const OVERLAY_Z = {
  base: 20,
  chrome: 10,
} as const;

export const OVERLAY_IDS: readonly OverlayId[] = ['character', 'inventory', 'trade', 'chart', 'map', 'ladder', 'choice', 'reader', 'endcard', 'pause', 'death'];

export function overlayZ(id: OverlayId): number {
  return OVERLAY_Z.base + OVERLAY_TABLE[id].rank;
}

export function paired(a: OverlayId, b: OverlayId): boolean {
  return OVERLAY_PAIRS.some(([x, y]: readonly [OverlayId, OverlayId]): boolean => (x === a && y === b) || (x === b && y === a));
}

export function dependentsOf(id: OverlayId): OverlayId[] {
  return OVERLAY_IDS.filter((other: OverlayId): boolean => OVERLAY_TABLE[other].requires === id);
}

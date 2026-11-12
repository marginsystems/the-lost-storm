export type PickKind = 'monster' | 'npc';

export interface ScreenRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface PickCandidate {
  readonly id: number;
  readonly kind: PickKind;
  readonly body: ScreenRect | null;
  readonly footGap: number;
  readonly depth: number;
}

export interface PickPoint {
  readonly x: number;
  readonly y: number;
}

export const PICK = {
  bodyPadding: 4,
  footRadius: 0.8,
} as const;

export function rectContains(rect: ScreenRect, point: PickPoint, padding: number): boolean {
  return point.x >= rect.minX - padding && point.x <= rect.maxX + padding && point.y >= rect.minY - padding && point.y <= rect.maxY + padding;
}

const KIND_RANK: Readonly<Record<PickKind, number>> = { monster: 0, npc: 1 };

export function pickActor(candidates: readonly PickCandidate[], point: PickPoint, labelId: number | null): PickCandidate | null {
  let best: PickCandidate | null = null;
  for (const candidate of candidates) {
    const underCursor: boolean = (candidate.body !== null && rectContains(candidate.body, point, PICK.bodyPadding)) || candidate.footGap <= PICK.footRadius;
    if (!underCursor && !(candidate.kind === 'npc' && candidate.id === labelId)) continue;
    if (best === null) {
      best = candidate;
      continue;
    }
    const rank: number = KIND_RANK[candidate.kind] - KIND_RANK[best.kind];
    if (rank < 0 || (rank === 0 && candidate.depth < best.depth)) best = candidate;
  }
  return best;
}

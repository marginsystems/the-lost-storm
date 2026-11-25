import type { ScreenRect } from './label-stack.ts';

export const LABEL_EDGE = {
  top: 48,
  side: 8,
  topClear: 24,
  hudGap: 4,
  awayDistance: 6,
  stackGap: 4,
  quietFrom: 3,
  quietScale: 0.62,
  edgeSlack: 1,
  reachHold: 48,
} as const;

export interface TagPlace {
  readonly x: number;
  readonly y: number;
  readonly away: boolean;
  readonly turn: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export function anchorInView(x: number, y: number, view: ViewSize): boolean {
  return x >= 0 && x <= view.width && y >= LABEL_EDGE.top && y <= view.height;
}

export function keepInside(x: number, width: number, view: ViewSize): number {
  const low: number = LABEL_EDGE.side + width / 2;
  const high: number = view.width - LABEL_EDGE.side - width / 2;
  return low > high ? view.width / 2 : Math.min(high, Math.max(low, x));
}

export function keepBelowTop(bottom: number, height: number, view: ViewSize): number {
  return Math.min(view.height - LABEL_EDGE.side, Math.max(LABEL_EDGE.topClear + height, bottom));
}

export function keepTagInView(x: number, y: number, width: number, height: number, view: ViewSize): readonly [number, number] {
  return [keepInside(x, width, view), keepBelowTop(y, height, view)];
}

function boxOf(x: number, y: number, width: number, height: number): ScreenRect {
  return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y };
}

export interface ItemPoint {
  readonly x: number;
  readonly y: number;
}

export function squaredDistance(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

function freeAt(x: number, y: number, width: number, height: number, rects: readonly ScreenRect[]): boolean {
  const left: number = x - width / 2;
  const right: number = x + width / 2;
  const top: number = y - height;
  const gap: number = LABEL_EDGE.hudGap;
  for (let index: number = 0; index < rects.length; index += 1) {
    const rect: ScreenRect | undefined = rects[index];
    if (rect !== undefined && left < rect.right + gap && rect.left - gap < right && top < rect.bottom + gap && rect.top - gap < y) return false;
  }
  return true;
}

function candidateX(x: number, column: number, width: number, rects: readonly ScreenRect[]): number {
  if (column === 0) return x;
  const rect: ScreenRect | undefined = rects[(column - 1) >> 1];
  if (rect === undefined) return x;
  const gap: number = LABEL_EDGE.hudGap + 1;
  return column % 2 === 1 ? rect.left - gap - width / 2 : rect.right + gap + width / 2;
}

function candidateY(y: number, row: number, height: number, rects: readonly ScreenRect[]): number {
  if (row === 0) return y;
  const rect: ScreenRect | undefined = rects[(row - 1) >> 1];
  if (rect === undefined) return y;
  const gap: number = LABEL_EDGE.hudGap + 1;
  return row % 2 === 1 ? rect.top - gap : rect.bottom + gap + height;
}

export function placeTag(anchorX: number, anchorY: number, width: number, height: number, view: ViewSize, rects: readonly ScreenRect[], item?: ItemPoint): TagPlace {
  const homeX: number = keepInside(anchorX, width, view);
  const homeY: number = keepBelowTop(anchorY, height, view);
  let x: number = homeX;
  let y: number = homeY;
  if (!freeAt(x, y, width, height, rects)) {
    const options: number = rects.length * 2 + 1;
    let best: number = Infinity;
    for (let column: number = 0; column < options; column += 1) {
      const optionX: number = keepInside(candidateX(homeX, column, width, rects), width, view);
      for (let row: number = 0; row < options; row += 1) {
        const optionY: number = keepBelowTop(candidateY(homeY, row, height, rects), height, view);
        const distance: number = squaredDistance(optionX - anchorX, optionY - anchorY);
        if (distance < best && freeAt(optionX, optionY, width, height, rects)) {
          best = distance;
          x = optionX;
          y = optionY;
        }
      }
    }
  }
  const away: boolean = squaredDistance(x - anchorX, y - anchorY) > LABEL_EDGE.awayDistance * LABEL_EDGE.awayDistance;
  const itemX: number = item === undefined ? anchorX : item.x;
  const itemY: number = item === undefined ? anchorY : item.y;
  return { x, y, away, turn: Math.atan2(itemY - (y - height / 2), itemX - x) };
}

export type ViewEdge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeTag {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reach: number;
  readonly offscreen: boolean;
  readonly home?: number;
}

export interface EdgeStack {
  readonly lift: ReadonlyMap<number, number>;
  readonly quiet: ReadonlySet<number>;
}

function levelOf(tag: EdgeTag): number {
  return tag.home ?? tag.y - tag.height / 2;
}

function liftsUp(tag: EdgeTag, view: ViewSize): boolean {
  return levelOf(tag) >= view.height / 2;
}

function stackInOrder(ordered: readonly EdgeTag[], fixed: readonly ScreenRect[], view: ViewSize): ReadonlyMap<number, number> {
  const gap: number = LABEL_EDGE.stackGap;
  const placed: ScreenRect[] = [...fixed];
  const lift: Map<number, number> = new Map<number, number>();
  for (const tag of ordered) {
    const upward: boolean = liftsUp(tag, view);
    let y: number = tag.y;
    for (let tries: number = 0; tries <= placed.length; tries += 1) {
      const box: ScreenRect = boxOf(tag.x, y, tag.width, tag.height);
      const blocker: ScreenRect | undefined = placed.find((rect: ScreenRect): boolean => box.left < rect.right + gap && rect.left - gap < box.right && box.top < rect.bottom + gap && rect.top - gap < box.bottom);
      if (blocker === undefined) break;
      y = upward ? blocker.top - gap : blocker.bottom + gap + tag.height;
    }
    placed.push(boxOf(tag.x, y, tag.width, tag.height));
    lift.set(tag.id, y - tag.y);
  }
  return lift;
}

function outward(view: ViewSize): (a: EdgeTag, b: EdgeTag) => number {
  return (a: EdgeTag, b: EdgeTag): number => {
    const rankA: number = liftsUp(a, view) ? -levelOf(a) : levelOf(a) - view.height;
    const rankB: number = liftsUp(b, view) ? -levelOf(b) : levelOf(b) - view.height;
    return rankA === rankB ? a.id - b.id : rankA - rankB;
  };
}

export function keepApart(tags: readonly EdgeTag[], fixed: readonly ScreenRect[], view: ViewSize): ReadonlyMap<number, number> {
  return stackInOrder(tags.toSorted(outward(view)), fixed, view);
}

export function heldReach(held: number | undefined, reach: number): number {
  return held === undefined || Math.abs(reach - held) > LABEL_EDGE.reachHold ? reach : held;
}

export function edgeOf(tag: EdgeTag, view: ViewSize): ViewEdge | null {
  const slack: number = LABEL_EDGE.side + LABEL_EDGE.edgeSlack;
  if (tag.y >= view.height - slack) return 'bottom';
  if (tag.x + tag.width / 2 >= view.width - slack) return 'right';
  if (tag.x - tag.width / 2 <= slack) return 'left';
  if (tag.y - tag.height <= LABEL_EDGE.topClear + LABEL_EDGE.edgeSlack) return 'top';
  return null;
}

export function stackAtEdges(tags: readonly EdgeTag[], view: ViewSize): EdgeStack {
  const crowds: Map<ViewEdge, number> = new Map<ViewEdge, number>();
  for (const tag of tags) {
    const edge: ViewEdge | null = edgeOf(tag, view);
    if (edge !== null) crowds.set(edge, (crowds.get(edge) ?? 0) + 1);
  }
  const quiet: Set<number> = new Set<number>(
    tags.flatMap((tag: EdgeTag): number[] => {
      const edge: ViewEdge | null = edgeOf(tag, view);
      return tag.offscreen && edge !== null && (crowds.get(edge) ?? 0) >= LABEL_EDGE.quietFrom ? [tag.id] : [];
    }),
  );
  const sized: EdgeTag[] = tags.map((tag: EdgeTag): EdgeTag => (quiet.has(tag.id) ? { ...tag, width: tag.width * LABEL_EDGE.quietScale, height: tag.height * LABEL_EDGE.quietScale } : tag));
  const ordered: EdgeTag[] = sized.toSorted((a: EdgeTag, b: EdgeTag): number => (a.reach === b.reach ? a.id - b.id : a.reach - b.reach));
  const lift: ReadonlyMap<number, number> = stackInOrder(ordered, [], view);
  return { lift, quiet };
}

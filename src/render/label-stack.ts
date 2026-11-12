export interface LabelBox {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function overlaps(a: LabelBox, b: LabelBox, gap: number): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && a.y > b.y - b.height - gap && a.y - a.height - gap < b.y;
}

export function stackLabels(boxes: readonly LabelBox[], gap: number): Map<number, number> {
  const ordered: LabelBox[] = boxes.toSorted((a: LabelBox, b: LabelBox): number => (a.y === b.y ? a.id - b.id : b.y - a.y));
  const placed: LabelBox[] = [];
  const lifts: Map<number, number> = new Map<number, number>();
  for (const box of ordered) {
    let current: LabelBox = box;
    for (;;) {
      const blocker: LabelBox | undefined = placed.find((other: LabelBox): boolean => overlaps(current, other, gap));
      if (blocker === undefined) break;
      current = { ...box, y: blocker.y - blocker.height - gap };
    }
    placed.push(current);
    lifts.set(box.id, current.y - box.y);
  }
  return lifts;
}

export interface RankedBox extends LabelBox {
  readonly rank: number;
}

export interface Folding {
  readonly folded: ReadonlySet<number>;
  readonly more: ReadonlyMap<number, number>;
}

export function foldPiles(boxes: readonly RankedBox[], reach: number, keep: number): Folding {
  const groupOf: Map<number, number> = new Map<number, number>();
  const find = (id: number): number => {
    let root: number = id;
    for (let next: number | undefined = groupOf.get(root); next !== undefined && next !== root; next = groupOf.get(root)) root = next;
    return root;
  };
  for (const box of boxes) groupOf.set(box.id, box.id);
  boxes.forEach((a: RankedBox, index: number): void => {
    for (const b of boxes.slice(index + 1)) {
      if (Math.hypot(a.x - b.x, a.y - b.y) <= reach) groupOf.set(find(a.id), find(b.id));
    }
  });
  const groups: Map<number, RankedBox[]> = new Map<number, RankedBox[]>();
  for (const box of boxes) {
    const root: number = find(box.id);
    groups.set(root, [...(groups.get(root) ?? []), box]);
  }
  const folded: Set<number> = new Set<number>();
  const more: Map<number, number> = new Map<number, number>();
  for (const members of groups.values()) {
    if (members.length <= keep) continue;
    const ordered: RankedBox[] = members.toSorted((a: RankedBox, b: RankedBox): number => (b.rank === a.rank ? a.id - b.id : b.rank - a.rank));
    const hidden: RankedBox[] = ordered.slice(keep);
    for (const box of hidden) folded.add(box.id);
    const last: RankedBox | undefined = ordered[keep - 1];
    if (last !== undefined) more.set(last.id, hidden.length);
  }
  return { folded, more };
}

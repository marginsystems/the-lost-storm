export interface LabelBox {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function clearOfHud(y: number, limit: number | null, height: number): number {
  if (limit === null) return y;
  return Math.min(y, limit - height);
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

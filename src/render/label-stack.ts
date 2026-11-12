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

function enters(box: LabelBox, rect: ScreenRect, gap: number): boolean {
  return box.x + box.width / 2 > rect.left - gap && box.x - box.width / 2 < rect.right + gap && box.y > rect.top - gap && box.y - box.height < rect.bottom + gap;
}

export function clearOfRects(box: LabelBox, rects: readonly ScreenRect[], gap: number): number {
  let y: number = box.y;
  for (let pass = 0; pass <= rects.length; pass++) {
    const blocker: ScreenRect | undefined = rects.find((rect: ScreenRect): boolean => enters({ ...box, y }, rect, gap));
    if (blocker === undefined) return y;
    y = blocker.top - gap;
  }
  return y;
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

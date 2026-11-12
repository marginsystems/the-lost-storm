export interface ItemPress {
  readonly onItem: boolean;
  readonly pickup: number | null;
}

export interface PressFrame {
  readonly fresh: boolean;
  readonly held: boolean;
  readonly free: boolean;
  readonly item: number | null;
}

export function itemPress(was: boolean, frame: PressFrame): ItemPress {
  if (frame.fresh) {
    const onItem: boolean = frame.free && frame.item !== null;
    return { onItem, pickup: onItem ? frame.item : null };
  }
  return { onItem: frame.held && was, pickup: null };
}

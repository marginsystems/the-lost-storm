export const BAG_DRAG = {
  slop: 6,
  reach: 6,
  settleMs: 520,
  dropWord: 'Drop',
} as const;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface BagDragOptions {
  readonly root: HTMLElement;
  readonly panel: HTMLElement;
  readonly cell: HTMLElement;
  readonly item: HTMLElement;
  readonly places: readonly HTMLElement[];
  canDrag(): boolean;
  canLeave(): boolean;
  started(): void;
  dropped(): void;
  moved(to: number): void;
}

export interface BagDragHandle {
  consumeClick(): boolean;
}

export function pulledFar(fromX: number, fromY: number, x: number, y: number): boolean {
  return Math.hypot(x - fromX, y - fromY) > BAG_DRAG.slop;
}

export function outside(box: Box, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}

function gapTo(box: Box, x: number, y: number): number {
  return Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
}

export function placeUnder(boxes: readonly Box[], x: number, y: number): number {
  let best: number = -1;
  let nearest: number = BAG_DRAG.reach;
  boxes.forEach((box: Box, index: number): void => {
    const gap: number = gapTo(box, x, y);
    if (gap > nearest || (best >= 0 && gap === nearest)) return;
    best = index;
    nearest = gap;
  });
  return best;
}

interface Pending {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
}

interface Dragging {
  readonly pointer: number;
  readonly ghost: HTMLElement;
  readonly grabX: number;
  readonly grabY: number;
}

function place(ghost: HTMLElement, root: HTMLElement, x: number, y: number): void {
  const frame: DOMRect = root.getBoundingClientRect();
  ghost.style.translate = `${String(x - frame.left)}px ${String(y - frame.top)}px`;
}

function settle(ghost: HTMLElement): void {
  window.setTimeout((): void => {
    ghost.remove();
  }, BAG_DRAG.settleMs);
}

export function attachBagDrag(options: BagDragOptions): BagDragHandle {
  const { root, panel, cell, item } = options;
  let pending: Pending | null = null;
  let dragging: Dragging | null = null;
  let swallow: boolean = false;
  let aimed: HTMLElement | null = null;

  const leaves = (x: number, y: number): boolean => options.canLeave() && outside(panel.getBoundingClientRect(), x, y);
  const targetAt = (x: number, y: number): number => {
    const index: number = placeUnder(options.places.map((spot: HTMLElement): DOMRect => spot.getBoundingClientRect()), x, y);
    return options.places[index] === cell ? -1 : index;
  };
  const aim = (spot: HTMLElement | null): void => {
    if (spot === aimed) return;
    aimed?.classList.remove('drop-target');
    aimed = spot;
    aimed?.classList.add('drop-target');
  };

  const begin = (event: PointerEvent, from: Pending): void => {
    const box: DOMRect = cell.getBoundingClientRect();
    const ghost: HTMLDivElement = document.createElement('div');
    ghost.className = 'bag-drag-ghost';
    ghost.style.width = `${String(box.width)}px`;
    ghost.style.height = `${String(box.height)}px`;
    const copy: Node = item.cloneNode(true);
    ghost.appendChild(copy);
    const word: HTMLDivElement = document.createElement('div');
    word.className = 'bag-drag-word';
    word.textContent = BAG_DRAG.dropWord;
    ghost.appendChild(word);
    root.appendChild(ghost);
    dragging = { pointer: from.pointer, ghost, grabX: from.x - box.left, grabY: from.y - box.top };
    place(ghost, root, event.clientX - dragging.grabX, event.clientY - dragging.grabY);
    if (!cell.hasPointerCapture(from.pointer)) cell.setPointerCapture(from.pointer);
    cell.classList.add('lifted');
    options.started();
    ghost.getBoundingClientRect();
    ghost.classList.add('on');
  };

  const finish = (event: PointerEvent, cancelled: boolean): void => {
    pending = null;
    const drag: Dragging | null = dragging;
    if (drag === null || drag.pointer !== event.pointerId) return;
    dragging = null;
    swallow = true;
    if (cell.hasPointerCapture(drag.pointer)) cell.releasePointerCapture(drag.pointer);
    aim(null);
    const leaving: boolean = !cancelled && leaves(event.clientX, event.clientY);
    const target: number = cancelled || leaving ? -1 : targetAt(event.clientX, event.clientY);
    cell.classList.remove('lifted');
    if (leaving) {
      drag.ghost.classList.add('dropped');
      options.dropped();
    } else {
      const landing: HTMLElement = options.places[target] ?? cell;
      const home: DOMRect = landing.getBoundingClientRect();
      drag.ghost.classList.add(landing === cell ? 'returning' : 'landing');
      drag.ghost.classList.remove('outside');
      place(drag.ghost, root, home.left, home.top);
      if (landing !== cell) options.moved(target);
    }
    drag.ghost.classList.remove('on');
    settle(drag.ghost);
  };

  cell.addEventListener('pointerdown', (event: PointerEvent): void => {
    swallow = false;
    if (event.pointerType === 'touch' || event.button !== 0 || !options.canDrag()) return;
    pending = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    cell.setPointerCapture(event.pointerId);
  });
  cell.addEventListener('pointermove', (event: PointerEvent): void => {
    if (dragging !== null && dragging.pointer === event.pointerId) {
      place(dragging.ghost, root, event.clientX - dragging.grabX, event.clientY - dragging.grabY);
      const away: boolean = leaves(event.clientX, event.clientY);
      dragging.ghost.classList.toggle('outside', away);
      aim(away ? null : (options.places[targetAt(event.clientX, event.clientY)] ?? null));
      return;
    }
    if (pending === null || pending.pointer !== event.pointerId) return;
    if (!pulledFar(pending.x, pending.y, event.clientX, event.clientY)) return;
    const from: Pending = pending;
    pending = null;
    if (options.canDrag()) begin(event, from);
  });
  cell.addEventListener('pointerup', (event: PointerEvent): void => {
    finish(event, false);
  });
  cell.addEventListener('pointercancel', (event: PointerEvent): void => {
    finish(event, true);
  });
  cell.addEventListener('lostpointercapture', (event: PointerEvent): void => {
    if (dragging !== null && dragging.pointer === event.pointerId) finish(event, true);
  });

  return {
    consumeClick(): boolean {
      const swallowed: boolean = swallow;
      swallow = false;
      return swallowed;
    },
  };
}

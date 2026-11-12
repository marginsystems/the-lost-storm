import { el } from './dom.ts';

const TOOLTIP = {
  offset: 16,
  margin: 8,
} as const;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Spot {
  readonly left: number;
  readonly top: number;
}

export function tooltipSpot(x: number, y: number, width: number, height: number, view: Box, beside: Box | null): Spot {
  const below: number = y + TOOLTIP.offset + height > view.bottom - TOOLTIP.margin ? y - TOOLTIP.offset - height : y + TOOLTIP.offset;
  const top: number = Math.max(view.top + TOOLTIP.margin, below);
  if (beside !== null) {
    const towardLeft: boolean = beside.left + beside.right > view.left + view.right;
    const left: number = towardLeft ? beside.left - TOOLTIP.offset - width : beside.right + TOOLTIP.offset;
    if (left >= view.left + TOOLTIP.margin && left + width <= view.right - TOOLTIP.margin) return { left, top };
  }
  const right: number = x + TOOLTIP.offset + width > view.right - TOOLTIP.margin ? x - TOOLTIP.offset - width : x + TOOLTIP.offset;
  return { left: Math.max(view.left + TOOLTIP.margin, right), top };
}

export interface Tooltip {
  show(content: HTMLElement, x: number, y: number, beside: Box | null): void;
  move(x: number, y: number): void;
  hide(): void;
}

export function createTooltip(root: HTMLElement): Tooltip {
  const node: HTMLDivElement = el('div', 'hud-tooltip', root);

  let shifted: boolean = false;
  let lastX: number = 0;
  let lastY: number = 0;
  let lastBeside: Box | null = null;
  const place = (x: number, y: number): void => {
    lastX = x;
    lastY = y;
    const spot: Spot = tooltipSpot(x, y, node.offsetWidth, node.offsetHeight, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }, lastBeside);
    node.style.left = `${spot.left}px`;
    node.style.top = `${spot.top}px`;
  };

  const compare = (event: KeyboardEvent): void => {
    if (event.key !== 'Shift') return;
    shifted = event.type === 'keydown';
    node.classList.toggle('compare', shifted);
    place(lastX, lastY);
  };
  window.addEventListener('keydown', compare);
  window.addEventListener('keyup', compare);
  window.addEventListener('blur', (): void => {
    shifted = false;
    node.classList.remove('compare');
  });

  return {
    show(content: HTMLElement, x: number, y: number, beside: Box | null): void {
      lastBeside = beside;
      node.replaceChildren(content);
      node.classList.toggle('compare', shifted);
      place(x, y);
      node.classList.add('visible');
    },
    move(x: number, y: number): void {
      place(x, y);
    },
    hide(): void {
      node.classList.remove('visible');
    },
  };
}

export function attachTooltip(tooltip: Tooltip, target: HTMLElement, build: () => HTMLElement | null): void {
  target.addEventListener('pointerenter', (event: PointerEvent): void => {
    const content: HTMLElement | null = build();
    if (content === null) tooltip.hide();
    else tooltip.show(content, event.clientX, event.clientY, target.closest('.hud-panel')?.getBoundingClientRect() ?? null);
  });
  target.addEventListener('pointermove', (event: PointerEvent): void => {
    tooltip.move(event.clientX, event.clientY);
  });
  target.addEventListener('pointerleave', (): void => {
    tooltip.hide();
  });
}

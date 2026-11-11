import { el } from './dom.ts';

const TOOLTIP = {
  offset: 16,
  margin: 8,
} as const;

export interface Tooltip {
  show(content: HTMLElement, x: number, y: number): void;
  move(x: number, y: number): void;
  hide(): void;
}

export function createTooltip(root: HTMLElement): Tooltip {
  const node: HTMLDivElement = el('div', 'hud-tooltip', root);

  const place = (x: number, y: number): void => {
    const width: number = node.offsetWidth;
    const height: number = node.offsetHeight;
    const left: number = x + TOOLTIP.offset + width > window.innerWidth - TOOLTIP.margin ? x - TOOLTIP.offset - width : x + TOOLTIP.offset;
    const top: number = y + TOOLTIP.offset + height > window.innerHeight - TOOLTIP.margin ? y - TOOLTIP.offset - height : y + TOOLTIP.offset;
    node.style.left = `${Math.max(TOOLTIP.margin, left)}px`;
    node.style.top = `${Math.max(TOOLTIP.margin, top)}px`;
  };

  return {
    show(content: HTMLElement, x: number, y: number): void {
      node.replaceChildren(content);
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
    else tooltip.show(content, event.clientX, event.clientY);
  });
  target.addEventListener('pointermove', (event: PointerEvent): void => {
    tooltip.move(event.clientX, event.clientY);
  });
  target.addEventListener('pointerleave', (): void => {
    tooltip.hide();
  });
}

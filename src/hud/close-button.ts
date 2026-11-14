import { el } from './dom.ts';
import { svg } from './svg.ts';

const CLOSE_GLYPH = {
  box: '0 0 16 16',
  stroke: '1.6',
  lines: ['M4 4 L12 12', 'M12 4 L4 12'],
} as const;

export function createCloseButton(parent: HTMLElement, name: string, onClose: () => void): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'panel-close', parent);
  button.type = 'button';
  button.setAttribute('aria-label', `Close ${name}`);
  const glyph: SVGSVGElement = svg('svg', 'panel-close-glyph', button, { viewBox: CLOSE_GLYPH.box, 'aria-hidden': 'true' });
  for (const line of CLOSE_GLYPH.lines) svg('path', '', glyph, { d: line, 'stroke-width': CLOSE_GLYPH.stroke });
  button.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    onClose();
  });
  button.addEventListener('pointerdown', (event: PointerEvent): void => event.stopPropagation());
  return button;
}

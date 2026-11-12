import type { FlaskResource } from '../../sim/content/flasks.ts';
import { isRestoring } from '../../sim/world/flasks.ts';
import type { FlaskState, PlayerState } from '../../sim/world/types.ts';
import { clamp01, el, label, pulseClass } from './dom.ts';
import { svg } from './svg.ts';

const BELT = {
  fillStep: 0.01,
  usedMs: 260,
  width: 28,
  height: 44,
  bodyTop: 13,
  bodyBottom: 42,
  body: 'M10.5 13V17.2C5.2 19.2 3 24.2 3 29.6C3 37 7.9 42 14 42C20.1 42 25 37 25 29.6C25 24.2 22.8 19.2 17.5 17.2V13Z',
  shine: 'M7.2 25.5C6.4 28 6.6 31.8 8.2 34.6',
  cork: { x: 10, y: 4.5, width: 8, height: 6.5 },
  lip: { x: 9, y: 10.5, width: 10, height: 2.8 },
} as const;

interface FlaskView {
  readonly element: HTMLElement;
  readonly liquid: SVGRectElement;
  fill: number;
}

export interface FlaskBelt {
  update(player: PlayerState): void;
  used(slot: number): void;
}

function drawFlask(parent: HTMLElement, flask: FlaskState): SVGRectElement {
  const clipId: string = `flask-clip-${flask.def.id}`;
  const picture: SVGSVGElement = svg('svg', 'flask-picture', null, { viewBox: `0 0 ${BELT.width} ${BELT.height}`, 'aria-hidden': 'true' });
  parent.appendChild(picture);
  const defs: SVGDefsElement = svg('defs', '', picture, {});
  const clip: SVGClipPathElement = svg('clipPath', '', defs, { id: clipId });
  svg('path', '', clip, { d: BELT.body });
  svg('rect', 'flask-cork', picture, { ...BELT.cork, rx: 1 });
  svg('rect', 'flask-lip', picture, { ...BELT.lip, rx: 0.8 });
  svg('path', 'flask-glass', picture, { d: BELT.body });
  const inside: SVGGElement = svg('g', '', picture, { 'clip-path': `url(#${clipId})` });
  const liquid: SVGRectElement = svg('rect', 'flask-liquid', inside, { x: 0, y: BELT.bodyTop, width: BELT.width, height: BELT.bodyBottom - BELT.bodyTop });
  const span: number = BELT.bodyBottom - BELT.bodyTop;
  for (let charges: number = flask.def.chargesPerUse; charges < flask.def.maxCharges; charges += flask.def.chargesPerUse) {
    const y: number = BELT.bodyBottom - (charges / flask.def.maxCharges) * span;
    svg('line', 'flask-notch', inside, { x1: 0, x2: BELT.width, y1: y, y2: y });
  }
  svg('path', 'flask-shine', picture, { d: BELT.shine });
  return liquid;
}

function buildFlask(root: HTMLElement, flask: FlaskState): FlaskView {
  const element: HTMLDivElement = el('div', `hud-flask ${flask.def.resource}`, root);
  const liquid: SVGRectElement = drawFlask(element, flask);
  label('flask-key', flask.def.label, element);
  return { element, liquid, fill: -1 };
}

function updateFlask(view: FlaskView, flask: FlaskState): void {
  const fraction: number = clamp01(flask.charges / flask.def.maxCharges);
  const quantised: number = Math.round(fraction / BELT.fillStep) * BELT.fillStep;
  if (quantised !== view.fill) {
    view.fill = quantised;
    view.liquid.style.transform = `scaleY(${quantised})`;
  }
  view.element.classList.toggle('empty', flask.charges < flask.def.chargesPerUse);
  view.element.classList.toggle('cooling', flask.cooldown > 0);
}

export function createFlaskBelt(root: HTMLElement, flasks: readonly FlaskState[], setRestoring: (resource: FlaskResource, on: boolean) => void): FlaskBelt {
  const views: FlaskView[] = flasks.map((flask: FlaskState): FlaskView => buildFlask(root, flask));
  return {
    update(player: PlayerState): void {
      const restoring: Record<FlaskResource, boolean> = { life: false, mana: false };
      player.flasks.forEach((flask: FlaskState, slot: number): void => {
        const view: FlaskView | undefined = views[slot];
        if (view !== undefined) updateFlask(view, flask);
        if (isRestoring(flask)) restoring[flask.def.resource] = true;
      });
      setRestoring('life', restoring.life);
      setRestoring('mana', restoring.mana);
    },
    used(slot: number): void {
      const view: FlaskView | undefined = views[slot];
      if (view !== undefined) pulseClass(view.element, 'used', BELT.usedMs);
    },
  };
}

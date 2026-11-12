import type { HudPart, HudView } from '../../sim/world/hud.ts';
import { HUD_PARTS, hudHidden, hudView } from '../../sim/world/hud.ts';
import type { World } from '../../sim/world/types.ts';
import type { HudPanel } from './hud-api.ts';

export const HUD_GATE = {
  roots: ['#hud', '.tc'],
  loose: ['.tc-rotate'],
  open: ['#overlays'],
  keep: ['pause', 'hud-fps', 'ctx-notice', 'name-echo', 'reader-veil', 'tc-stick', 'glitch-white', 'fb'],
  faint: 'tc-stick',
  faintIdle: 0.12,
  faintHeld: 0.3,
  revealAnimation: 'hud-gate-reveal',
  partAnimation: 'hud-part-in',
  partAttribute: 'data-hud-part',
  slotAttribute: 'data-hud-slot',
  slots: 12,
} as const;

export type HudGateState = 'closed' | 'opening' | 'open';

export interface HudGateTarget {
  readonly dataset: DOMStringMap;
}

export interface HudGate {
  set(hidden: boolean): void;
  show(view: HudView): void;
  settle(): void;
  state(): HudGateState;
}

function covered(): string {
  const keep: string = HUD_GATE.keep.map((name: string): string => `.${name}`).join(', ');
  const children: string[] = HUD_GATE.roots.map((root: string): string => `${root} > :not(${keep})`);
  return [...children, ...HUD_GATE.loose].join(',\n');
}

function scoped(state: HudGateState, selectors: string): string {
  return selectors
    .split(',\n')
    .map((selector: string): string => `body[data-hud-gate='${state}'] ${selector}`)
    .join(',\n');
}

export function partCss(): string {
  const parts: string = HUD_PARTS.map((name: HudPart): string => `body[data-hud-show]:not([data-hud-show~='${name}']) [${HUD_GATE.partAttribute}~='${name}']`).join(',\n');
  const slots: string = Array.from({ length: HUD_GATE.slots }, (_: unknown, slot: number): string => `body[data-hud-slots]:not([data-hud-slots~='${slot}']) [${HUD_GATE.slotAttribute}='${slot}']`).join(',\n');
  return `${parts},
${slots} {
  display: none !important;
}

[${HUD_GATE.partAttribute}],
[${HUD_GATE.slotAttribute}] {
  animation: ${HUD_GATE.partAnimation} var(--spring-snappy-ms) var(--spring-snappy);
}

@keyframes ${HUD_GATE.partAnimation} {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
`;
}

const PANEL_PARTS: Readonly<Record<HudPanel, HudPart>> = { inventory: 'inventory', character: 'character', tree: 'chart', map: 'map' };

export function panelPart(panel: HudPanel): HudPart {
  return PANEL_PARTS[panel];
}

export function tagPart(element: HTMLElement, part: HudPart): void {
  element.setAttribute(HUD_GATE.partAttribute, part);
}

export function tagSlot(element: HTMLElement, slot: number): void {
  element.setAttribute(HUD_GATE.slotAttribute, String(slot));
}

export function shownData(view: HudView): Readonly<Record<'hudShow' | 'hudSlots', string>> {
  return { hudShow: view.parts.join(' '), hudSlots: view.slots.join(' ') };
}

export function hudGateCss(): string {
  const hidden: string = scoped('closed', covered());
  const revealing: string = scoped('opening', covered());
  const faint: string = `body[data-hud-gate='closed'] .${HUD_GATE.faint}`;
  return `${hidden} {
  filter: opacity(0) !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

${faint} {
  opacity: ${HUD_GATE.faintIdle};
}

${faint}.on {
  opacity: ${HUD_GATE.faintHeld};
}

${revealing} {
  animation: ${HUD_GATE.revealAnimation} var(--spring-smooth-ms) var(--spring-smooth) both;
}

@keyframes ${HUD_GATE.revealAnimation} {
  from {
    filter: opacity(0);
  }
  to {
    filter: opacity(1);
  }
}

${partCss()}`;
}

export function createHudGate(body: HudGateTarget, hidden: boolean): HudGate {
  let state: HudGateState = hidden ? 'closed' : 'open';
  body.dataset['hudGate'] = state;
  const write = (key: string, value: string): void => {
    if (body.dataset[key] !== value) body.dataset[key] = value;
  };
  return {
    show(view: HudView): void {
      const data: Readonly<Record<'hudShow' | 'hudSlots', string>> = shownData(view);
      write('hudShow', data.hudShow);
      write('hudSlots', data.hudSlots);
    },
    set(next: boolean): void {
      const wanted: HudGateState = next ? 'closed' : state === 'closed' ? 'opening' : state;
      if (wanted === state) return;
      state = wanted;
      body.dataset['hudGate'] = state;
    },
    settle(): void {
      if (state !== 'opening') return;
      state = 'open';
      body.dataset['hudGate'] = state;
    },
    state(): HudGateState {
      return state;
    },
  };
}

export function followWorld(gate: HudGate, world: World): void {
  gate.set(hudHidden(world));
  gate.show(hudView(world));
}

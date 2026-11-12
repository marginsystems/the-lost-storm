import type { HudPart } from '../../sim/content/types.ts';
import { HUD_PARTS } from '../../sim/content/types.ts';
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
  partAnimation: 'hud-part-reveal',
  partAttribute: 'data-hud-part',
  partRise: 12,
  freshMs: 1400,
} as const;

export type HudGateState = 'closed' | 'opening' | 'open';

export interface HudGateTarget {
  readonly dataset: DOMStringMap;
}

export interface HudGate {
  set(hidden: boolean): void;
  hold(parts: readonly HudPart[], now: number): void;
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
  const part: (name: HudPart) => string = (name: HudPart): string => `[${HUD_GATE.partAttribute}~='${name}']`;
  const hidden: string = HUD_PARTS.map((name: HudPart): string => `body[data-hud-hold~='${name}'] ${part(name)}`).join(',\n');
  const fresh: string = HUD_PARTS.map((name: HudPart): string => `body[data-hud-fresh~='${name}'] ${part(name)}`).join(',\n');
  return `${hidden} {
  filter: opacity(0) !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

${fresh} {
  animation: ${HUD_GATE.partAnimation} var(--spring-bouncy-ms) var(--spring-bouncy) both;
}

@keyframes ${HUD_GATE.partAnimation} {
  from {
    filter: opacity(0);
    translate: 0 ${HUD_GATE.partRise}px;
  }
  to {
    filter: opacity(1);
    translate: 0 0;
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

export interface PartStage {
  readonly held: readonly HudPart[];
  readonly fresh: ReadonlyMap<HudPart, number>;
}

export function stageParts(previous: PartStage, held: readonly HudPart[], now: number): PartStage {
  const fresh: Map<HudPart, number> = new Map<HudPart, number>();
  for (const [name, at] of previous.fresh) if (now - at < HUD_GATE.freshMs) fresh.set(name, at);
  for (const name of previous.held) if (!held.includes(name)) fresh.set(name, now);
  return { held: [...held], fresh };
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
  let stage: PartStage | null = null;
  const write = (key: string, value: string): void => {
    if (body.dataset[key] !== value) body.dataset[key] = value;
  };
  return {
    hold(parts: readonly HudPart[], now: number): void {
      stage = stageParts(stage ?? { held: parts, fresh: new Map<HudPart, number>() }, parts, now);
      write('hudHold', stage.held.join(' '));
      write('hudFresh', [...stage.fresh.keys()].join(' '));
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

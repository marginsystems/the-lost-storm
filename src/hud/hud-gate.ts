export const HUD_GATE = {
  roots: ['#hud', '.tc'],
  loose: ['.tc-rotate'],
  open: ['#overlays'],
  keep: ['pause', 'hud-fps', 'tc-lost', 'name-echo', 'reader-veil', 'tc-stick'],
  faint: 'tc-stick',
  faintIdle: 0.12,
  faintHeld: 0.3,
  revealAnimation: 'hud-gate-reveal',
} as const;

export type HudGateState = 'closed' | 'opening' | 'open';

export interface HudGateTarget {
  readonly dataset: DOMStringMap;
}

export interface HudGate {
  set(hidden: boolean): void;
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
`;
}

export function createHudGate(body: HudGateTarget, hidden: boolean): HudGate {
  let state: HudGateState = hidden ? 'closed' : 'open';
  body.dataset['hudGate'] = state;
  return {
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

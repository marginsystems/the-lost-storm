import type { FlaskResource } from '../../sim/content/flasks.ts';
import { isRestoring } from '../../sim/world/flasks.ts';
import type { FlaskState, PlayerState } from '../../sim/world/types.ts';
import { el, pulseClass, setText } from './dom.ts';

const BELT = {
  usedMs: 520,
  fillStep: 0.05,
} as const;

export interface BeadState {
  readonly ready: boolean;
  readonly fill: number;
}

export interface BeadCharges {
  readonly charges: number;
  readonly chargesPerUse: number;
  readonly maxCharges: number;
}

interface BeadView {
  readonly element: HTMLElement;
  ready: boolean | null;
  fill: number;
}

interface FlaskView {
  readonly beads: readonly BeadView[];
  readonly resource: FlaskResource;
}

export interface FlaskHosts {
  beads(resource: FlaskResource): HTMLElement;
  key(resource: FlaskResource): HTMLElement;
}

export interface FlaskBelt {
  update(player: PlayerState): void;
  used(slot: number): void;
  refreshKeys(): void;
}

export function beadStates(flask: BeadCharges): BeadState[] {
  const uses: number = flask.chargesPerUse > 0 ? Math.floor(flask.maxCharges / flask.chargesPerUse) : 0;
  return Array.from({ length: uses }, (_: unknown, index: number): BeadState => {
    const need: number = (index + 1) * flask.chargesPerUse;
    if (flask.charges >= need) return { ready: true, fill: 1 };
    const into: number = (flask.charges - index * flask.chargesPerUse) / flask.chargesPerUse;
    return { ready: false, fill: Math.min(1, Math.max(0, into)) };
  });
}

function buildFlask(hosts: FlaskHosts, flask: FlaskState): FlaskView {
  const host: HTMLElement = hosts.beads(flask.def.resource);
  const beads: BeadView[] = beadStates({ charges: flask.charges, chargesPerUse: flask.def.chargesPerUse, maxCharges: flask.def.maxCharges }).map((): BeadView => ({ element: el('i', 'globe-bead', host), ready: null, fill: -1 }));
  return { beads, resource: flask.def.resource };
}

function updateFlask(view: FlaskView, flask: FlaskState): void {
  const states: BeadState[] = beadStates({ charges: flask.charges, chargesPerUse: flask.def.chargesPerUse, maxCharges: flask.def.maxCharges });
  view.beads.forEach((bead: BeadView, index: number): void => {
    const state: BeadState = states[index] ?? { ready: false, fill: 0 };
    if (state.ready !== bead.ready) {
      bead.ready = state.ready;
      bead.element.classList.toggle('ready', state.ready);
    }
    const fill: number = Math.round(state.fill / BELT.fillStep) * BELT.fillStep;
    if (fill !== bead.fill) {
      bead.fill = fill;
      bead.element.style.setProperty('--bead-fill', fill.toFixed(2));
    }
  });
}

export function createFlaskBelt(hosts: FlaskHosts, flasks: readonly FlaskState[], keyOf: (slot: number) => string, setRestoring: (resource: FlaskResource, on: boolean) => void): FlaskBelt {
  const views: FlaskView[] = flasks.map((flask: FlaskState): FlaskView => buildFlask(hosts, flask));
  const showKeys = (animate: boolean): void => {
    flasks.forEach((flask: FlaskState, slot: number): void => {
      setText(hosts.key(flask.def.resource), keyOf(slot), animate);
    });
  };
  showKeys(false);
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
    refreshKeys(): void {
      showKeys(true);
    },
    used(slot: number): void {
      const view: FlaskView | undefined = views[slot];
      if (view === undefined) return;
      const host: HTMLElement | null = view.beads[0]?.element.parentElement ?? null;
      if (host !== null) pulseClass(host, 'used', BELT.usedMs);
    },
  };
}

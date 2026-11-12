import type { FlaskResource } from '../../sim/content/flasks.ts';
import { isRestoring } from '../../sim/world/flasks.ts';
import type { FlaskState, PlayerState } from '../../sim/world/types.ts';
import { pulseClass, setText } from './dom.ts';

const BELT = {
  usedMs: 520,
} as const;

export interface FlaskCharges {
  readonly charges: number;
  readonly chargesPerUse: number;
}

interface FlaskView {
  readonly count: HTMLElement;
  uses: number;
}

export interface FlaskHosts {
  count(resource: FlaskResource): HTMLElement;
  key(resource: FlaskResource): HTMLElement;
}

export interface FlaskBelt {
  update(player: PlayerState): void;
  used(slot: number): void;
  refreshKeys(): void;
}

export function flaskUses(flask: FlaskCharges): number {
  return flask.chargesPerUse > 0 ? Math.max(0, Math.floor(flask.charges / flask.chargesPerUse)) : 0;
}

export function paintUses(element: HTMLElement, uses: number, animate: boolean): void {
  setText(element, String(uses), animate);
  element.classList.toggle('none', uses === 0);
}

function chargesOf(flask: FlaskState): FlaskCharges {
  return { charges: flask.charges, chargesPerUse: flask.def.chargesPerUse };
}

export function createFlaskBelt(hosts: FlaskHosts, flasks: readonly FlaskState[], keyOf: (slot: number) => string, setRestoring: (resource: FlaskResource, on: boolean) => void): FlaskBelt {
  const views: FlaskView[] = flasks.map((flask: FlaskState): FlaskView => {
    const count: HTMLElement = hosts.count(flask.def.resource);
    const uses: number = flaskUses(chargesOf(flask));
    paintUses(count, uses, false);
    return { count, uses };
  });
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
        if (view !== undefined) {
          const uses: number = flaskUses(chargesOf(flask));
          if (uses !== view.uses) {
            view.uses = uses;
            paintUses(view.count, uses, true);
          }
        }
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
      if (view !== undefined) pulseClass(view.count, 'used', BELT.usedMs);
    },
  };
}

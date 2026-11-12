import type { HudPart } from '../../sim/content/types.ts';
import { HUD_PARTS } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { hiddenHudParts } from '../../sim/world/hud.ts';
import type { WakeState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import openingCss from './opening.css?inline';

export const OPENING = {
  wakeDistance: 46,
  wakeRate: 0.45,
  revealAnimation: 'hud-part-reveal',
} as const;

export interface OpeningDeps {
  readonly world: World;
  readonly camera: IsoCamera;
  readonly hud: HTMLElement;
}

export interface Opening {
  update(): void;
}

export function createOpening(deps: OpeningDeps): Opening {
  const { world, camera, hud } = deps;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = openingCss;
  hud.append(style);
  let shift: Vec2 = { x: world.shift.x, z: world.shift.z };
  let eased: WakeState | null = null;
  let held: WakeState | null = null;
  let hidden: ReadonlySet<HudPart> = new Set<HudPart>(hiddenHudParts(world));
  for (const part of hidden) document.body.classList.add(`hud-hide-${part}`);
  document.body.addEventListener('animationend', (event: AnimationEvent): void => {
    if (event.animationName !== OPENING.revealAnimation) return;
    for (const part of HUD_PARTS) document.body.classList.remove(`hud-reveal-${part}`);
  });

  const showHud = (): void => {
    const now: ReadonlySet<HudPart> = new Set<HudPart>(hiddenHudParts(world));
    for (const part of HUD_PARTS) {
      if (now.has(part) === hidden.has(part)) continue;
      document.body.classList.toggle(`hud-hide-${part}`, now.has(part));
      if (!now.has(part)) document.body.classList.add(`hud-reveal-${part}`);
    }
    hidden = now;
  };

  return {
    update(): void {
      document.body.dataset['zoneKind'] = world.zone.kind;
      if (world.shift.x !== shift.x || world.shift.z !== shift.z) {
        camera.shift(world.shift.x - shift.x, world.shift.z - shift.z);
        shift = { x: world.shift.x, z: world.shift.z };
      }
      const wake: WakeState | null = world.wake;
      if (wake !== null && wake !== held) {
        held = wake;
        camera.hold(OPENING.wakeDistance);
      }
      if (wake !== null && wake !== eased && wake.elapsed > 0) {
        eased = wake;
        camera.ease(OPENING.wakeRate);
      }
      showHud();
    },
  };
}

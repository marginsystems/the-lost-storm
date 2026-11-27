import type { AuraReading } from '../../sim/world/aura.ts';
import { heroAuras } from '../../sim/world/aura.ts';
import type { PlayerState, World } from '../../sim/world/types.ts';
import type { Spring } from './character-spring.ts';
import { springTo, stepSpring } from './character-spring.ts';
import { clamp01, el, setClass, setText, setVar } from './dom.ts';
import { iconSvg } from './icons.ts';

export const AURA_SIGN = {
  longestFrame: 0.1,
  leave: 0.6,
} as const;

export interface AuraChipState {
  readonly form: string;
  readonly fuse: Spring;
  readonly name: string;
  readonly icon: string;
  seconds: string;
  up: boolean;
  gone: number;
}

export interface AuraChipReading {
  readonly form: string;
  readonly name: string;
  readonly icon: string;
  readonly seconds: string;
  readonly fuse: number;
  readonly up: boolean;
}

export interface AuraSignState {
  chips: AuraChipState[];
}

export function createAuraSignState(): AuraSignState {
  return { chips: [] };
}

function secondsLeft(timeLeft: number): string {
  return `${Math.max(0, Math.ceil(timeLeft))}s`;
}

function fuseOf(reading: AuraReading): number {
  return reading.duration > 0 ? clamp01(reading.timeLeft / reading.duration) : 0;
}

export function readAuraSign(state: AuraSignState, auras: readonly AuraReading[], dt: number): readonly AuraChipReading[] {
  const step: number = Math.min(AURA_SIGN.longestFrame, dt);
  for (const aura of auras) {
    if (state.chips.some((chip: AuraChipState): boolean => chip.form === aura.skill.form)) continue;
    const fuse: number = fuseOf(aura);
    state.chips.push({ form: aura.skill.form, fuse: { value: fuse, velocity: 0, target: fuse }, name: aura.skill.name, icon: aura.skill.icon, seconds: secondsLeft(aura.timeLeft), up: true, gone: 0 });
  }
  for (const chip of state.chips) {
    const aura: AuraReading | undefined = auras.find((entry: AuraReading): boolean => entry.skill.form === chip.form);
    chip.up = aura !== undefined;
    if (aura !== undefined) {
      chip.gone = 0;
      springTo(chip.fuse, fuseOf(aura));
      chip.seconds = secondsLeft(aura.timeLeft);
    } else {
      springTo(chip.fuse, 0);
      chip.gone += step;
    }
    stepSpring(chip.fuse, step);
  }
  state.chips = state.chips.filter((chip: AuraChipState): boolean => chip.up || chip.gone < AURA_SIGN.leave);
  return state.chips.map((chip: AuraChipState): AuraChipReading => ({ form: chip.form, name: chip.name, icon: chip.icon, seconds: chip.seconds, fuse: clamp01(chip.fuse.value), up: chip.up }));
}

interface ChipView {
  readonly root: HTMLElement;
  readonly seconds: HTMLElement;
  placed: boolean;
}

export interface AuraSign {
  update(world: World, player: PlayerState, dt: number): void;
}

export function createAuraSign(parent: HTMLElement): AuraSign {
  const root: HTMLDivElement = el('div', 'hud-auras', parent);
  const state: AuraSignState = createAuraSignState();
  const views: Map<string, ChipView> = new Map<string, ChipView>();
  const build = (reading: AuraChipReading): ChipView => {
    const chip: HTMLDivElement = el('div', 'hud-aura', root);
    const icon: HTMLDivElement = el('div', 'hud-aura-icon', chip);
    icon.innerHTML = iconSvg(reading.icon);
    el('div', 'hud-aura-name', chip).textContent = reading.name;
    const seconds: HTMLDivElement = el('div', 'hud-aura-time', chip);
    seconds.textContent = reading.seconds;
    const fuse: HTMLDivElement = el('div', 'hud-aura-fuse', chip);
    el('div', 'hud-aura-fill', fuse);
    return { root: chip, seconds, placed: false };
  };
  return {
    update(world: World, player: PlayerState, dt: number): void {
      const readings: readonly AuraChipReading[] = readAuraSign(state, heroAuras(world, player), dt);
      for (const reading of readings) {
        const view: ChipView = views.get(reading.form) ?? build(reading);
        views.set(reading.form, view);
        setText(view.seconds, reading.seconds, true);
        setVar(view.root, '--aura-fuse', reading.fuse.toFixed(4));
        if (view.placed) setClass(view.root, 'up', reading.up);
        view.placed = true;
      }
      for (const [id, view] of views) {
        if (readings.some((reading: AuraChipReading): boolean => reading.form === id)) continue;
        view.root.remove();
        views.delete(id);
      }
    },
  };
}

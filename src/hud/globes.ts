import type { PlayerState } from '../../sim/world/types.ts';
import { approach, clamp01, el, label, pulseClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';

const GLOBES = {
  fillStep: 0.005,
  hitMs: 140,
  goldRate: 7,
} as const;

interface GlobeView {
  readonly globe: HTMLElement;
  readonly liquid: HTMLElement;
  readonly readout: HTMLElement;
  fill: number;
}

export interface Globes {
  update(player: PlayerState, dt: number): void;
  flashLife(): void;
}

function buildGlobe(parent: HTMLElement, kind: 'life' | 'mana'): GlobeView {
  const globe: HTMLDivElement = el('div', `hud-globe ${kind}`, parent);
  const liquid: HTMLDivElement = el('div', 'globe-liquid', globe);
  el('div', 'globe-flash', globe);
  el('div', 'globe-gloss', globe);
  const readout: HTMLDivElement = label('globe-readout', '', parent);
  return { globe, liquid, readout, fill: -1 };
}

function updateGlobe(view: GlobeView, value: number, max: number): void {
  const fraction: number = max > 0 ? clamp01(value / max) : 0;
  const quantised: number = Math.round(fraction / GLOBES.fillStep) * GLOBES.fillStep;
  if (quantised !== view.fill) {
    view.fill = quantised;
    view.liquid.style.transform = `translateY(${(1 - quantised) * 100}%)`;
  }
  setText(view.readout, `${Math.ceil(value)} / ${Math.round(max)}`, false);
}

export function createGlobes(root: HTMLElement): Globes {
  const lifeGroup: HTMLDivElement = el('div', 'hud-globe-group life', root);
  const manaGroup: HTMLDivElement = el('div', 'hud-globe-group mana', root);
  const gold: HTMLDivElement = el('div', 'hud-gold', manaGroup);
  const coin: HTMLSpanElement = el('span', 'gold-icon', gold);
  coin.innerHTML = iconSvg('coin');
  const goldText: HTMLSpanElement = el('span', 'gold-text', gold);
  const life: GlobeView = buildGlobe(lifeGroup, 'life');
  const mana: GlobeView = buildGlobe(manaGroup, 'mana');
  let shownGold: number | null = null;

  return {
    update(player: PlayerState, dt: number): void {
      updateGlobe(life, player.life, player.maxLife);
      updateGlobe(mana, player.mana, player.stats.maxMana);
      shownGold = shownGold === null ? player.gold : approach(shownGold, player.gold, dt, GLOBES.goldRate);
      setText(goldText, String(Math.round(shownGold)), false);
    },
    flashLife(): void {
      pulseClass(life.globe, 'hit', GLOBES.hitMs);
    },
  };
}

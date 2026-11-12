import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { approach, clamp01, el, label, pulseClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { BoltPoint, FlashPhase, FlickerFrame, FlickerState } from './storm-flicker.ts';
import { boltPoints, manaStrength, startFlicker, stepFlicker } from './storm-flicker.ts';
import { svg } from './svg.ts';

const GLOBES = {
  fillStep: 0.005,
  hitMs: 140,
  goldRate: 7,
  low: 0.25,
  box: 132,
  strengthStep: 0.05,
} as const;

const WAVE: string =
  '<svg viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 5Q15 0 30 5T60 5T90 5T120 5T150 5T180 5T210 5T240 5V10H0Z"/></svg>';

const CLOUD: string =
  '<svg viewBox="0 0 264 132" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="globe-cloud" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.05" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.22 0 0 0 0 0.29 0 0 0 0 0.42 0 0 0 1.5 -0.6"/></filter></defs><rect width="132" height="132" filter="url(#globe-cloud)"/><rect x="132" width="132" height="132" filter="url(#globe-cloud)"/></svg>';

const GLASS: string =
  '<svg viewBox="0 0 132 132" aria-hidden="true"><defs><radialGradient id="globe-edge" cx="0.5" cy="0.5" r="0.5"><stop offset="0.78" stop-color="#fff" stop-opacity="0"/><stop offset="0.93" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.985" stop-color="#cfe0ff" stop-opacity="0.2"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient><linearGradient id="globe-shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="globe-soft" x="-0.5" y="-0.5" width="2" height="2"><feGaussianBlur stdDeviation="2.2"/></filter></defs><circle cx="66" cy="66" r="66" fill="url(#globe-edge)"/><path d="M 19.9 49.4 A 52.8 52.8 0 0 1 69.3 13.2" stroke="url(#globe-shine)" stroke-width="5" stroke-linecap="round" fill="none" filter="url(#globe-soft)"/><path d="M 27.6 39.1 A 48.8 48.8 0 0 1 54.5 19.8" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round" fill="none"/></svg>';

interface Storm {
  readonly core: SVGPolylineElement;
  readonly glow: SVGPolylineElement;
  readonly root: HTMLElement;
  flicker: FlickerState;
  phase: FlashPhase;
  strength: number;
}

interface GlobeView {
  readonly globe: HTMLElement;
  readonly liquid: HTMLElement;
  readonly readout: HTMLElement;
  readonly beads: HTMLElement;
  readonly key: HTMLElement;
  readonly storm: Storm | null;
  fill: number;
}

export interface Globes {
  update(player: PlayerState, dt: number): void;
  flashLife(): void;
  setRestoring(resource: FlaskResource, on: boolean): void;
  beads(resource: FlaskResource): HTMLElement;
  key(resource: FlaskResource): HTMLElement;
}

function buildStorm(liquid: HTMLElement): Storm {
  const cloud: HTMLDivElement = el('div', 'globe-cloud', liquid);
  cloud.innerHTML = CLOUD;
  const root: HTMLDivElement = el('div', 'globe-bolt', liquid);
  const picture: SVGSVGElement = svg('svg', '', null, { viewBox: `0 0 ${GLOBES.box} ${GLOBES.box}`, 'aria-hidden': 'true' });
  root.appendChild(picture);
  const glow: SVGPolylineElement = svg('polyline', 'bolt-glow', picture, {});
  const core: SVGPolylineElement = svg('polyline', 'bolt-core', picture, {});
  return { core, glow, root, flicker: startFlicker(Math.random), phase: 'quiet', strength: -1 };
}

function buildGlobe(parent: HTMLElement, kind: FlaskResource): GlobeView {
  const globe: HTMLDivElement = el('div', `hud-globe ${kind}`, parent);
  const glass: HTMLDivElement = el('div', 'globe-glass', globe);
  const liquid: HTMLDivElement = el('div', 'globe-liquid', glass);
  el('div', 'globe-body', liquid);
  const storm: Storm | null = kind === 'mana' ? buildStorm(liquid) : null;
  const back: HTMLDivElement = el('div', 'globe-wave back', liquid);
  back.innerHTML = WAVE;
  const front: HTMLDivElement = el('div', 'globe-wave', liquid);
  front.innerHTML = WAVE;
  el('div', 'globe-frost', glass);
  el('div', 'globe-flash', glass);
  el('div', 'globe-restore', glass);
  const gloss: HTMLDivElement = el('div', 'globe-gloss', glass);
  gloss.innerHTML = GLASS;
  const beads: HTMLDivElement = el('div', 'globe-beads', glass);
  const readout: HTMLDivElement = label('globe-readout', '', glass);
  const key: HTMLDivElement = label('globe-key', '', globe);
  return { globe, liquid, readout, beads, key, storm, fill: -1 };
}

function pointsText(points: readonly BoltPoint[]): string {
  return points.map((point: BoltPoint): string => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function updateStorm(storm: Storm, fraction: number, dt: number): void {
  const frame: FlickerFrame = stepFlicker(storm.flicker, dt, fraction, Math.random);
  storm.flicker = frame.state;
  if (frame.fresh) {
    const text: string = pointsText(boltPoints(Math.random, GLOBES.box, GLOBES.box));
    storm.core.setAttribute('points', text);
    storm.glow.setAttribute('points', text);
  }
  if (frame.phase !== storm.phase) {
    storm.phase = frame.phase;
    storm.root.dataset['flash'] = frame.phase;
  }
  const strength: number = Math.round(manaStrength(fraction) / GLOBES.strengthStep) * GLOBES.strengthStep;
  if (strength === storm.strength) return;
  storm.strength = strength;
  storm.root.style.setProperty('--bolt-strength', strength.toFixed(2));
}

function updateGlobe(view: GlobeView, value: number, max: number, dt: number): void {
  const fraction: number = max > 0 ? clamp01(value / max) : 0;
  const quantised: number = Math.round(fraction / GLOBES.fillStep) * GLOBES.fillStep;
  if (quantised !== view.fill) {
    view.fill = quantised;
    view.liquid.style.transform = `translateY(${(1 - quantised) * 100}%)`;
  }
  view.globe.classList.toggle('low', fraction < GLOBES.low);
  view.globe.classList.toggle('empty', fraction <= 0);
  if (view.storm !== null) updateStorm(view.storm, fraction, dt);
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
  const viewOf = (resource: FlaskResource): GlobeView => (resource === 'life' ? life : mana);

  return {
    update(player: PlayerState, dt: number): void {
      updateGlobe(life, player.life, player.maxLife, dt);
      updateGlobe(mana, player.mana, player.stats.maxMana, dt);
      shownGold = shownGold === null ? player.gold : approach(shownGold, player.gold, dt, GLOBES.goldRate);
      setText(goldText, String(Math.round(shownGold)), false);
    },
    flashLife(): void {
      pulseClass(life.globe, 'hit', GLOBES.hitMs);
    },
    setRestoring(resource: FlaskResource, on: boolean): void {
      viewOf(resource).globe.classList.toggle('restoring', on);
    },
    beads(resource: FlaskResource): HTMLElement {
      return viewOf(resource).beads;
    },
    key(resource: FlaskResource): HTMLElement {
      return viewOf(resource).key;
    },
  };
}

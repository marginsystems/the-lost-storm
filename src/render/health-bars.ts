import { Vector2 } from 'three';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from './iso-camera.ts';

export const HEALTH_BARS = {
  width: 38,
  bossWidth: 60,
  height: 3,
  bossHeight: 4,
  lift: 0.45,
  fillRate: 16,
  trailRate: 3.2,
  trailHold: 0.32,
  fadeRate: 12,
  gone: 0.02,
  back: { rgb: '6, 8, 12', alpha: 0.6 },
  fill: { rgb: '108, 66, 62', alpha: 0.85 },
  trail: { rgb: '214, 200, 186', alpha: 0.26 },
  glow: 'rgba(150, 96, 88, 0.35)',
  glowBlur: 5,
  ends: 0.24,
} as const;

export interface BarTone {
  readonly rgb: string;
  readonly alpha: number;
}

export interface FadeStop {
  readonly at: number;
  readonly color: string;
}

export function endStops(tone: BarTone, ends: number): readonly FadeStop[] {
  const clear: string = `rgba(${tone.rgb}, 0)`;
  const full: string = `rgba(${tone.rgb}, ${tone.alpha})`;
  return [
    { at: 0, color: clear },
    { at: ends, color: full },
    { at: 1 - ends, color: full },
    { at: 1, color: clear },
  ];
}

interface BarState {
  fill: number;
  trail: number;
  hold: number;
  alpha: number;
  wanted: boolean;
}

export interface HealthBars {
  update(dt: number, world: World, heightOf: (actorId: number) => number): void;
}

function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function barWanted(monster: Pick<MonsterState, 'alive' | 'life' | 'maxLife'>): boolean {
  return monster.alive && monster.life < monster.maxLife;
}

function layer(target: CanvasRenderingContext2D, tone: BarTone, left: number, top: number, full: number, span: number, barHeight: number): void {
  const shade: CanvasGradient = target.createLinearGradient(left, 0, left + full, 0);
  for (const stop of endStops(tone, HEALTH_BARS.ends)) shade.addColorStop(stop.at, stop.color);
  target.fillStyle = shade;
  target.fillRect(left, top, span, barHeight);
}

export function createHealthBars(root: HTMLElement, camera: IsoCamera): HealthBars {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'health-canvas';
  root.prepend(canvas);
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  const states: Map<number, BarState> = new Map<number, BarState>();
  const point: Vector2 = new Vector2();
  let width: number = 0;
  let height: number = 0;
  let scale: number = 0;

  const fit = (): void => {
    const nextScale: number = window.devicePixelRatio;
    if (root.clientWidth === width && root.clientHeight === height && nextScale === scale) return;
    width = root.clientWidth;
    height = root.clientHeight;
    scale = nextScale;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  };

  return {
    update(dt: number, world: World, heightOf: (actorId: number) => number): void {
      if (context === null) return;
      fit();
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const seen: Set<number> = new Set<number>();
      for (const monster of world.monsters) {
        const wanted: boolean = barWanted(monster);
        let state: BarState | undefined = states.get(monster.id);
        if (state === undefined) {
          if (!wanted) continue;
          state = { fill: 1, trail: 1, hold: 0, alpha: 0, wanted };
          states.set(monster.id, state);
        }
        seen.add(monster.id);
        const ratio: number = Math.max(0, monster.life / monster.maxLife);
        if (wanted) {
          if (ratio < state.fill - 0.001) state.hold = HEALTH_BARS.trailHold;
          if (ratio > state.trail) state.trail = ratio;
          state.wanted = true;
        } else {
          state.wanted = false;
        }
        state.fill = approach(state.fill, ratio, dt, HEALTH_BARS.fillRate);
        state.hold = Math.max(0, state.hold - dt);
        if (state.hold === 0) state.trail = approach(state.trail, ratio, dt, HEALTH_BARS.trailRate);
        state.alpha = approach(state.alpha, state.wanted ? 1 : 0, dt, HEALTH_BARS.fadeRate);
        if (state.alpha < HEALTH_BARS.gone && !state.wanted) {
          states.delete(monster.id);
          continue;
        }
        camera.project(monster.pos.x, heightOf(monster.id) + HEALTH_BARS.lift, monster.pos.z, point);
        const big: boolean = monster.def.boss !== null;
        const barWidth: number = big ? HEALTH_BARS.bossWidth : HEALTH_BARS.width;
        const barHeight: number = big ? HEALTH_BARS.bossHeight : HEALTH_BARS.height;
        const left: number = point.x - barWidth / 2;
        const top: number = point.y - barHeight / 2;
        context.globalAlpha = state.alpha;
        layer(context, HEALTH_BARS.back, left, top, barWidth, barWidth, barHeight);
        layer(context, HEALTH_BARS.trail, left, top, barWidth, barWidth * state.trail, barHeight);
        context.shadowColor = HEALTH_BARS.glow;
        context.shadowBlur = HEALTH_BARS.glowBlur;
        layer(context, HEALTH_BARS.fill, left, top, barWidth, barWidth * state.fill, barHeight);
        context.shadowBlur = 0;
      }
      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id);
      }
      context.globalAlpha = 1;
    },
  };
}

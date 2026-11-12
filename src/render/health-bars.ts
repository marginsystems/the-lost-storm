import { Vector2 } from 'three';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from './iso-camera.ts';

export const HEALTH_BARS = {
  width: 40,
  bossWidth: 64,
  height: 4,
  bossHeight: 5,
  lift: 0.45,
  fillRate: 16,
  trailRate: 3.2,
  trailHold: 0.32,
  fadeRate: 12,
  gone: 0.02,
  back: 'rgba(6, 8, 12, 0.82)',
  fill: '#a8322b',
  trail: 'rgba(240, 214, 184, 0.62)',
} as const;

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

export function createHealthBars(root: HTMLElement, camera: IsoCamera): HealthBars {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'health-canvas';
  root.append(canvas);
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
        const left: number = Math.round(point.x - barWidth / 2);
        const top: number = Math.round(point.y - barHeight / 2);
        context.globalAlpha = state.alpha;
        context.fillStyle = HEALTH_BARS.back;
        context.fillRect(left, top, barWidth, barHeight);
        context.fillStyle = HEALTH_BARS.trail;
        context.fillRect(left, top, Math.round(barWidth * state.trail), barHeight);
        context.fillStyle = HEALTH_BARS.fill;
        context.fillRect(left, top, Math.round(barWidth * state.fill), barHeight);
      }
      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id);
      }
      context.globalAlpha = 1;
    },
  };
}

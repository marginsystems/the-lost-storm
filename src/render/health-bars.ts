import { Vector2 } from 'three';
import { piecesHolding } from '../../sim/world/count.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from './iso-camera.ts';
import type { TagSize, TagSizes } from './tag-sizes.ts';
import { browserTagMeasure, clientBox, createTagSizes } from './tag-sizes.ts';
import { floorUp } from './terrain-lift.ts';

export const HEALTH_BARS = {
  width: 38,
  bossWidth: 60,
  height: 3,
  bossHeight: 4,
  pieceWidth: 64,
  pieceHeight: 6,
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
  pieceBack: { rgb: '6, 8, 12', alpha: 0.82 },
  pieceFill: { rgb: '226, 178, 88', alpha: 1 },
  pieceTrail: { rgb: '250, 236, 206', alpha: 0.5 },
  pieceGlow: 'rgba(232, 196, 106, 0.6)',
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

interface BarStops {
  readonly back: readonly FadeStop[];
  readonly trail: readonly FadeStop[];
  readonly fill: readonly FadeStop[];
}

export type BarKind = 'plain' | 'boss' | 'piece';

interface BarLook {
  readonly width: number;
  readonly height: number;
  readonly stops: BarStops;
  readonly glow: string;
}

const STOPS: BarStops = {
  back: endStops(HEALTH_BARS.back, HEALTH_BARS.ends),
  trail: endStops(HEALTH_BARS.trail, HEALTH_BARS.ends),
  fill: endStops(HEALTH_BARS.fill, HEALTH_BARS.ends),
};

const PIECE_STOPS: BarStops = {
  back: endStops(HEALTH_BARS.pieceBack, HEALTH_BARS.ends),
  trail: endStops(HEALTH_BARS.pieceTrail, HEALTH_BARS.ends),
  fill: endStops(HEALTH_BARS.pieceFill, HEALTH_BARS.ends),
};

const LOOKS: Readonly<Record<BarKind, BarLook>> = {
  plain: { width: HEALTH_BARS.width, height: HEALTH_BARS.height, stops: STOPS, glow: HEALTH_BARS.glow },
  boss: { width: HEALTH_BARS.bossWidth, height: HEALTH_BARS.bossHeight, stops: STOPS, glow: HEALTH_BARS.glow },
  piece: { width: HEALTH_BARS.pieceWidth, height: HEALTH_BARS.pieceHeight, stops: PIECE_STOPS, glow: HEALTH_BARS.pieceGlow },
};

export function lookOf(kind: BarKind): BarLook {
  return LOOKS[kind];
}

export function holdingPieces(world: World): Set<number> {
  const held: Set<number> = new Set<number>();
  for (const monster of world.monsters) {
    if (monster.def.boss === null || !monster.alive) continue;
    for (const piece of piecesHolding(world, monster)) if (piece.alive) held.add(piece.id);
  }
  return held;
}

export function barKindOf(monster: Pick<MonsterState, 'id' | 'def'>, pieces: ReadonlySet<number>): BarKind {
  if (monster.def.boss !== null) return 'boss';
  return pieces.has(monster.id) ? 'piece' : 'plain';
}

interface BarState {
  fill: number;
  trail: number;
  hold: number;
  alpha: number;
  wanted: boolean;
  width: number;
  height: number;
}

export interface HealthBars {
  update(dt: number, world: World, heightOf: (actorId: number) => number): void;
}

function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function barWanted(monster: Pick<MonsterState, 'alive' | 'life' | 'maxLife'>, kind: BarKind = 'plain'): boolean {
  return monster.alive && (monster.life < monster.maxLife || kind === 'piece');
}

function layer(target: CanvasRenderingContext2D, stops: readonly FadeStop[], left: number, top: number, full: number, span: number, barHeight: number): void {
  const shade: CanvasGradient = target.createLinearGradient(left, 0, left + full, 0);
  for (const stop of stops) shade.addColorStop(stop.at, stop.color);
  target.fillStyle = shade;
  target.fillRect(left, top, span, barHeight);
}

export function canvasVisibility(drawn: boolean): string {
  return drawn ? '' : 'hidden';
}

export function createHealthBars(root: HTMLElement, camera: IsoCamera): HealthBars {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'health-canvas';
  root.prepend(canvas);
  const rootSize: TagSizes<HTMLElement> = createTagSizes(browserTagMeasure(clientBox));
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  const states: Map<number, BarState> = new Map<number, BarState>();
  const seen: Set<number> = new Set<number>();
  let drawn: boolean = true;
  let shown: boolean = true;
  const point: Vector2 = new Vector2();
  let width: number = 0;
  let height: number = 0;
  let scale: number = 0;

  const fit = (): void => {
    const nextScale: number = window.devicePixelRatio;
    const box: TagSize = rootSize.size(root);
    if (box.width === width && box.height === height && nextScale === scale) return;
    width = box.width;
    height = box.height;
    scale = nextScale;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    drawn = false;
  };

  return {
    update(dt: number, world: World, heightOf: (actorId: number) => number): void {
      if (context === null) return;
      fit();
      context.setTransform(scale, 0, 0, scale, 0, 0);
      if (drawn) context.clearRect(0, 0, width, height);
      drawn = false;
      seen.clear();
      const pieces: Set<number> = holdingPieces(world);
      for (const monster of world.monsters) {
        const kind: BarKind = barKindOf(monster, pieces);
        const wanted: boolean = barWanted(monster, kind);
        let state: BarState | undefined = states.get(monster.id);
        if (state === undefined) {
          if (!wanted) continue;
          state = { fill: 1, trail: 1, hold: 0, alpha: 0, wanted, width: lookOf(kind).width, height: lookOf(kind).height };
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
        camera.project(monster.pos.x, floorUp(monster.pos.x, heightOf(monster.id) + HEALTH_BARS.lift, monster.pos.z), monster.pos.z, point);
        const look: BarLook = lookOf(kind);
        state.width = approach(state.width, look.width, dt, HEALTH_BARS.fillRate);
        state.height = approach(state.height, look.height, dt, HEALTH_BARS.fillRate);
        const barWidth: number = state.width;
        const barHeight: number = state.height;
        const left: number = point.x - barWidth / 2;
        const top: number = point.y - barHeight / 2;
        drawn = true;
        context.globalAlpha = state.alpha;
        layer(context, look.stops.back, left, top, barWidth, barWidth, barHeight);
        layer(context, look.stops.trail, left, top, barWidth, barWidth * state.trail, barHeight);
        context.shadowColor = look.glow;
        context.shadowBlur = HEALTH_BARS.glowBlur;
        layer(context, look.stops.fill, left, top, barWidth, barWidth * state.fill, barHeight);
        context.shadowBlur = 0;
      }
      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id);
      }
      context.globalAlpha = 1;
      if (drawn === shown) return;
      shown = drawn;
      canvas.style.visibility = canvasVisibility(drawn);
    },
  };
}

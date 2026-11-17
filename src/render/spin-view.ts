import type { Scene } from 'three';
import { Color } from 'three';
import type { PlayerState } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT, held } from './ground-light.ts';
import type { ParticleSystem } from './particles.ts';
import type { SpinMotion, WakeDrop } from './spin-motion.ts';
import { createSpinMotion, readSpin, SPIN_MOTION, spinShown, stepSpinMotion } from './spin-motion.ts';
import type { SpinClips, SpinStyle } from './spin-style.ts';
import { lapDelta, shownTurn, spinCycle, spinLean, turnStep } from './spin-style.ts';
import { floorUp } from './terrain-lift.ts';

export const SPIN_VIEW = {
  arc: 2.3,
  arcInner: 0.42,
  arcWobble: 0.07,
  arcRest: 0.2,
  arcGain: 0.35,
  footRadius: 1.25,
  footWidth: 0.16,
  footWobble: 0.12,
  footGlow: 0.4,
  footSteady: 0.25,
  wakeCount: 6,
  wakeHalf: 0.85,
  wakeLife: 0.6,
  wakeGlow: 0.32,
  wakeFill: 0.12,
  wakeBand: 0.4,
  wakeWidth: 0.24,
  wakeWobble: 0.3,
  wakeShare: 0.35,
  moteCount: 3,
  moteSize: 0.45,
  moteHeight: 0.5,
  liftOrder: 0.02,
  bladeOffset: 0,
} as const;

const STEEL: Color = new Color(0xd6ecff);
const GALE: Color = new Color(0xf4fbff);
const MIST: Color = new Color(0xdfe8f0);

interface Wake {
  readonly light: GroundLight;
  age: number;
}

export interface SpinPose {
  readonly animation: string | null;
  readonly turn: number;
  readonly lean: number;
  readonly leanAt: number;
  readonly cycle: number | null;
  readonly clips: SpinClips | null;
}

export interface SpinView {
  step(dt: number, time: number, player: PlayerState): SpinPose;
  clear(): void;
  dispose(): void;
}

export function createSpinView(scene: Scene, particles: ParticleSystem | null, style: SpinStyle): SpinView {
  const motion: SpinMotion = createSpinMotion();
  const arc: GroundLight = createGroundLight(STEEL, { kind: 'round', radius: 1, inner: SPIN_VIEW.arcInner, arc: SPIN_VIEW.arc }, { fill: style.trail.fill, band: style.trail.arcBand, width: style.trail.width, wobble: SPIN_VIEW.arcWobble, hollow: 1 });
  const trail: GroundLight = createGroundLight(STEEL, { kind: 'round', radius: 1, inner: SPIN_VIEW.arcInner, arc: SPIN_VIEW.arc }, { fill: 0, band: style.trail.band, width: style.trail.width, wobble: SPIN_VIEW.arcWobble, hollow: 1 });
  const foot: GroundLight = createGroundLight(GALE, { kind: 'round', radius: SPIN_VIEW.footRadius, inner: 0, arc: Math.PI * 2 }, { fill: 0.05, band: 1, width: SPIN_VIEW.footWidth, wobble: SPIN_VIEW.footWobble, hollow: 1 });
  const base: number = arc.mesh.scale.x;
  const wakes: Wake[] = Array.from({ length: SPIN_VIEW.wakeCount }, (): Wake => {
    const light: GroundLight = createGroundLight(MIST, { kind: 'lane', halfWidth: SPIN_VIEW.wakeHalf, start: 0, length: SPIN_MOTION.wakeEvery }, { fill: SPIN_VIEW.wakeFill, band: SPIN_VIEW.wakeBand, width: SPIN_VIEW.wakeWidth, wobble: SPIN_VIEW.wakeWobble });
    light.mesh.visible = false;
    scene.add(light.mesh);
    return { light, age: SPIN_VIEW.wakeLife };
  });
  for (const light of [arc, trail, foot]) {
    light.mesh.visible = false;
    scene.add(light.mesh);
  }
  let next: number = 0;
  let spun: number = 0;
  let lastTurned: number | null = null;
  let leanAt: number = 0;
  let was: { x: number; z: number } | null = null;

  const dropWake = (drop: WakeDrop, strength: number): void => {
    const wake: Wake | undefined = wakes[next];
    next = (next + 1) % wakes.length;
    if (wake === undefined) return;
    const length: number = Math.hypot(drop.to.x - drop.from.x, drop.to.z - drop.from.z);
    if (length <= 0) return;
    wake.age = 0;
    wake.light.mesh.visible = true;
    wake.light.mesh.position.set(drop.from.x, floorUp(drop.from.x, GROUND_LIGHT.height + SPIN_VIEW.liftOrder, drop.from.z), drop.from.z);
    wake.light.mesh.rotation.z = Math.atan2(drop.from.x - drop.to.x, drop.from.z - drop.to.z);
    wake.light.pose(0, 0);
    if (particles === null) return;
    const count: number = Math.round(SPIN_VIEW.moteCount * strength);
    if (count <= 0) return;
    particles.burst({ x: drop.from.x, y: SPIN_VIEW.moteHeight, z: drop.from.z, count, color: MIST, speed: { min: 0.6, max: 2.2 }, lift: { min: 0.4, max: 1.6 }, life: { min: 0.35, max: 0.7 }, size: { min: SPIN_VIEW.moteSize * 0.5, max: SPIN_VIEW.moteSize }, gravity: -0.6, drag: 2.4, dirX: drop.from.x - drop.to.x, dirZ: drop.from.z - drop.to.z, spread: 1.6, jitter: 0.6 });
  };

  return {
    step(dt: number, time: number, player: PlayerState): SpinPose {
      const drop: WakeDrop | null = stepSpinMotion(motion, readSpin(player), player.pos, dt);
      const shown: number = spinShown(motion);
      const share: number = Math.min(1, Math.max(0, motion.share.value));
      const steady: number = Math.min(1, Math.max(0, motion.steady.value));
      const reach: number = Math.max(0.5, motion.reach.value);
      const spinning: boolean = motion.animation !== null;
      spun = spinning ? spun + turnStep(style, lastTurned === null ? 0 : lapDelta(lastTurned, motion.angle), share) : 0;
      lastTurned = spinning ? motion.angle : null;
      const turn: number = shownTurn(style, spun);
      const gliding: boolean = spinning && player.moving;
      if (was !== null && gliding && Math.hypot(player.pos.x - was.x, player.pos.z - was.z) > 1e-4) leanAt = Math.atan2(player.pos.x - was.x, player.pos.z - was.z);
      else if (!gliding) leanAt = player.facing + turn;
      was = { x: player.pos.x, z: player.pos.z };
      arc.mesh.visible = shown > 0;
      trail.mesh.visible = shown > 0;
      if (shown > 0) {
        const strength: number = shown * (SPIN_VIEW.arcRest + SPIN_VIEW.arcGain * share);
        arc.mesh.position.set(player.pos.x, floorUp(player.pos.x, GROUND_LIGHT.height + SPIN_VIEW.liftOrder * 2, player.pos.z), player.pos.z);
        arc.mesh.scale.setScalar(base * reach);
        const lead: number = player.facing + turn + Math.PI + SPIN_VIEW.bladeOffset;
        arc.mesh.rotation.z = lead;
        arc.pose(strength, time);
        trail.mesh.position.copy(arc.mesh.position);
        trail.mesh.scale.setScalar(base * reach * style.trail.length);
        trail.mesh.rotation.z = lead - SPIN_VIEW.arc * style.trail.lag;
        trail.pose(strength * style.trail.strength, time);
      }
      const glow: number = share * SPIN_VIEW.footGlow + steady * SPIN_VIEW.footSteady;
      foot.mesh.visible = glow > 0.002;
      if (foot.mesh.visible) {
        foot.mesh.position.set(player.pos.x, floorUp(player.pos.x, GROUND_LIGHT.height + SPIN_VIEW.liftOrder, player.pos.z), player.pos.z);
        foot.pose(glow, time);
      }
      if (drop !== null && player.moving) dropWake(drop, shown * (SPIN_VIEW.wakeShare + (1 - SPIN_VIEW.wakeShare) * share));
      for (const wake of wakes) {
        if (!wake.light.mesh.visible) continue;
        wake.age += dt;
        const t: number = wake.age / SPIN_VIEW.wakeLife;
        if (t >= 1) {
          wake.light.mesh.visible = false;
          continue;
        }
        wake.light.pose(SPIN_VIEW.wakeGlow * held(t) * (SPIN_VIEW.wakeShare + (1 - SPIN_VIEW.wakeShare) * share), time);
      }
      return { animation: motion.animation, turn, lean: spinning ? spinLean(style, share, gliding) : 0, leanAt, cycle: spinCycle(style, turn), clips: style.clips };
    },
    clear(): void {
      for (const wake of wakes) wake.light.mesh.visible = false;
    },
    dispose(): void {
      for (const light of [arc, trail, foot, ...wakes.map((wake: Wake): GroundLight => wake.light)]) {
        scene.remove(light.mesh);
        light.dispose();
      }
    },
  };
}

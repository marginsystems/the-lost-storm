import type { AnimationAction } from 'three';
import { Color, LoopOnce, LoopRepeat } from 'three';
import type { ActionAnimation, AnimationKey } from '../../sim/content/types.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { RigInstance } from './character-loader.ts';

export const ACTOR = {
  turnRate: 22,
  locomotionFade: 0.14,
  actionFade: 0.05,
  actionTail: 0.22,
  hitFade: 0.05,
  hitSpeed: 1.7,
  hitTime: 0.28,
  deathFade: 0.08,
  flashDecay: 9,
  punchDecay: 11,
  punchSquash: 0.14,
  hoverGlow: 0.16,
  hostileHover: 0xff5a3c,
  friendlyHover: 0xffd9a0,
  npcTurnRate: 6,
  minActionSpeed: 0.35,
  maxActionSpeed: 5,
  sinkDelay: 3.4,
  sinkSpeed: 1.1,
  riseDepth: 2.4,
  runReferenceSpeed: 6.4,
  minRunSpeed: 0.7,
  maxRunSpeed: 1.7,
} as const;

export interface ActorPose {
  readonly pos: ReadonlyVec2;
  readonly facing: number;
  readonly moving: boolean;
  readonly busy: boolean;
  readonly deadTime: number;
}

export interface SyncOptions {
  readonly moveSpeed: number;
  readonly rise: number;
  readonly floor: number;
  readonly turnRate: number;
}

export interface ActorView {
  readonly rig: RigInstance;
  readonly height: number;
  sync(dt: number, actor: ActorPose, options: SyncOptions): void;
  startAction(animation: ActionAnimation, windup: number, recovery: number): void;
  interrupt(): void;
  hit(color: Color, strength: number, stagger: boolean): void;
  die(): void;
  revive(): void;
  setHover(hovered: boolean): void;
  dispose(): void;
}

function turnToward(current: number, target: number, maxStep: number): number {
  let delta: number = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export function createActorView(rig: RigInstance, scale: number, facing: number, hoverTint: number = ACTOR.hostileHover): ActorView {
  let current: AnimationKey = 'idle';
  let oneShot: number = 0;
  let dead: boolean = false;
  let flash: number = 0;
  let punch: number = 0;
  let hover: boolean = false;
  let yaw: number = facing;
  const flashColor: Color = new Color(0xffffff);
  const hoverColor: Color = new Color(hoverTint);
  const mixed: Color = new Color();
  rig.root.scale.setScalar(scale);
  rig.root.rotation.y = yaw;
  rig.actions.idle.play();

  const play = (key: AnimationKey, fade: number, speed: number, once: boolean, restart: boolean): void => {
    const next: AnimationAction = rig.actions[key];
    const previous: AnimationAction = rig.actions[current];
    if (key === current && !restart) {
      next.timeScale = speed;
      return;
    }
    next.enabled = true;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.setEffectiveWeight(1);
    if (previous !== next) next.crossFadeFrom(previous, fade, false);
    next.play();
    current = key;
  };

  return {
    rig,
    height: rig.def.height * rig.def.scale * scale,
    sync(dt: number, actor: ActorPose, options: SyncOptions): void {
      rig.root.position.set(actor.pos.x, options.floor, actor.pos.z);
      if (dead) {
        const sunk: number = Math.max(0, actor.deadTime - ACTOR.sinkDelay) * ACTOR.sinkSpeed;
        rig.root.position.y = options.floor - sunk;
      } else {
        rig.root.position.y = options.floor - (1 - options.rise) * ACTOR.riseDepth;
        yaw = turnToward(yaw, actor.facing, options.turnRate * dt);
        rig.root.rotation.y = yaw;
        if (oneShot > 0) {
          oneShot -= dt;
          if (!actor.busy && actor.moving) oneShot = 0;
        }
        if (oneShot <= 0) {
          const run: boolean = actor.moving;
          const speed: number = run ? Math.min(ACTOR.maxRunSpeed, Math.max(ACTOR.minRunSpeed, options.moveSpeed / ACTOR.runReferenceSpeed)) : 1;
          play(run ? 'run' : 'idle', ACTOR.locomotionFade, speed, false, false);
        }
      }
      flash = Math.max(0, flash - ACTOR.flashDecay * dt);
      punch = Math.max(0, punch - ACTOR.punchDecay * dt);
      const squash: number = punch * ACTOR.punchSquash;
      const grow: number = 0.35 + 0.65 * options.rise;
      rig.root.scale.set(scale * grow * (1 + squash), scale * grow * (1 - squash), scale * grow * (1 + squash));
      const hoverAmount: number = hover && !dead ? ACTOR.hoverGlow : 0;
      mixed.copy(hoverColor).lerp(flashColor, flash > 0 ? 1 : 0);
      rig.setFlash(mixed, Math.max(flash, hoverAmount));
      rig.mixer.update(dt);
    },
    startAction(animation: ActionAnimation, windup: number, recovery: number): void {
      if (dead) return;
      const impact: number = rig.durations[animation] * rig.def.clips[animation].impactFraction;
      const speed: number = impact > 0 && windup > 0 ? Math.min(ACTOR.maxActionSpeed, Math.max(ACTOR.minActionSpeed, impact / windup)) : 1;
      play(animation, ACTOR.actionFade, speed, true, true);
      oneShot = windup + recovery + ACTOR.actionTail;
    },
    interrupt(): void {
      if (dead) return;
      play('hit', ACTOR.hitFade, ACTOR.hitSpeed, true, true);
      oneShot = ACTOR.hitTime;
    },
    hit(color: Color, strength: number, stagger: boolean): void {
      flashColor.copy(color);
      flash = Math.max(flash, strength);
      punch = Math.max(punch, strength);
      if (dead || !stagger) return;
      play('hit', ACTOR.hitFade, ACTOR.hitSpeed, true, true);
      oneShot = ACTOR.hitTime;
    },
    die(): void {
      if (dead) return;
      dead = true;
      oneShot = 0;
      play('death', ACTOR.deathFade, 1.25, true, true);
    },
    revive(): void {
      dead = false;
      oneShot = 0;
      play('idle', ACTOR.locomotionFade, 1, false, true);
    },
    setHover(hovered: boolean): void {
      hover = hovered;
    },
    dispose(): void {
      rig.root.removeFromParent();
      rig.dispose();
    },
  };
}

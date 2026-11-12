import type { AnimationAction, AnimationClip } from 'three';
import type { Box3 } from 'three';
import { Color, LoopOnce, LoopRepeat } from 'three';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { ActionClip, RigInstance } from './character-loader.ts';

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
  minFollowSpeed: 0.6,
  deathSpeed: 1.25,
  sinkDelay: 3.4,
  sinkSpeed: 1.1,
  sinkLimit: 0.35,
  riseDepth: 2.4,
  minRunSpeed: 0.7,
  maxRunSpeed: 1.7,
} as const;

export type Chance = () => number;

interface FollowThrough {
  left: number;
  readonly speed: number;
}

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
  startAction(animation: string, windup: number, recovery: number): void;
  interrupt(): void;
  hit(color: Color, strength: number, stagger: boolean): void;
  die(): void;
  revive(): void;
  setHover(hovered: boolean): void;
  bounds(out: Box3): void;
  dispose(): void;
}

function turnToward(current: number, target: number, maxStep: number): number {
  let delta: number = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function clamped(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function oneOf(clips: readonly AnimationClip[], chance: Chance): AnimationClip | null {
  return clips[Math.min(clips.length - 1, Math.floor(chance() * clips.length))] ?? null;
}

export function createActorView(rig: RigInstance, scale: number, facing: number, hoverTint: number = ACTOR.hostileHover, chance: Chance = Math.random): ActorView {
  let current: AnimationAction = rig.mixer.clipAction(rig.clips.idle);
  let follow: FollowThrough | null = null;
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
  current.play();

  const play = (clip: AnimationClip, fade: number, speed: number, once: boolean, restart: boolean): void => {
    const next: AnimationAction = rig.mixer.clipAction(clip);
    const previous: AnimationAction = current;
    if (next === previous && !restart) {
      next.timeScale = speed;
      return;
    }
    follow = null;
    next.enabled = true;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.setEffectiveWeight(1);
    if (previous !== next) next.crossFadeFrom(previous, fade, false);
    next.play();
    current = next;
  };

  const react = (): void => {
    const clip: AnimationClip | null = oneOf(rig.clips.hit, chance);
    if (clip === null) return;
    play(clip, ACTOR.hitFade, ACTOR.hitSpeed, true, true);
    oneShot = ACTOR.hitTime;
  };

  return {
    rig,
    height: rig.def.height * rig.def.scale * scale,
    sync(dt: number, actor: ActorPose, options: SyncOptions): void {
      rig.root.position.set(actor.pos.x, options.floor, actor.pos.z);
      if (dead) {
        const sunk: number = Math.min(ACTOR.sinkLimit, Math.max(0, actor.deadTime - ACTOR.sinkDelay) * ACTOR.sinkSpeed);
        rig.root.position.y = options.floor - sunk;
      } else {
        rig.root.position.y = options.floor - (1 - options.rise) * ACTOR.riseDepth;
        yaw = turnToward(yaw, actor.facing, options.turnRate * dt);
        rig.root.rotation.y = yaw;
        if (oneShot > 0) {
          oneShot -= dt;
          if (!actor.busy && actor.moving) oneShot = 0;
        }
        if (follow !== null) {
          follow.left -= dt;
          if (follow.left <= 0) {
            current.timeScale = follow.speed;
            follow = null;
          }
        }
        if (oneShot <= 0) {
          const run: boolean = actor.moving;
          const speed: number = run ? clamped(options.moveSpeed / rig.def.runSpeed, ACTOR.minRunSpeed, ACTOR.maxRunSpeed) : 1;
          play(run ? rig.clips.run : rig.clips.idle, ACTOR.locomotionFade, speed, false, false);
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
    startAction(animation: string, windup: number, recovery: number): void {
      const entry: ActionClip | undefined = rig.clips.actions.get(animation);
      if (dead || entry === undefined) return;
      const timed: boolean = entry.impactTime > 0 && windup > 0;
      play(entry.clip, ACTOR.actionFade, timed ? clamped(entry.impactTime / windup, ACTOR.minActionSpeed, ACTOR.maxActionSpeed) : 1, true, true);
      oneShot = windup + recovery + ACTOR.actionTail;
      if (timed) follow = { left: windup, speed: clamped((entry.clip.duration - entry.impactTime) / (recovery + ACTOR.actionTail), ACTOR.minFollowSpeed, ACTOR.maxActionSpeed) };
    },
    interrupt(): void {
      if (!dead) react();
    },
    hit(color: Color, strength: number, stagger: boolean): void {
      flashColor.copy(color);
      flash = Math.max(flash, strength);
      punch = Math.max(punch, strength);
      if (!dead && stagger) react();
    },
    die(): void {
      if (dead) return;
      dead = true;
      oneShot = 0;
      const clip: AnimationClip | null = oneOf(rig.clips.death, chance);
      if (clip !== null) play(clip, ACTOR.deathFade, ACTOR.deathSpeed, true, true);
    },
    revive(): void {
      dead = false;
      oneShot = 0;
      play(rig.clips.idle, ACTOR.locomotionFade, 1, false, true);
    },
    setHover(hovered: boolean): void {
      hover = hovered;
    },
    bounds(out: Box3): void {
      out.setFromObject(rig.root);
    },
    dispose(): void {
      rig.root.removeFromParent();
      rig.dispose();
    },
  };
}

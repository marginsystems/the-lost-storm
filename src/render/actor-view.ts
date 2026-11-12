import type { AnimationAction, AnimationClip } from 'three';
import type { Box3, Mesh, Object3D } from 'three';
import { Color, LoopOnce, LoopRepeat, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { WakePose } from './wake-pose.ts';
import { WAKE_POSE } from './wake-pose.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { Motion } from '../../sim/world/types.ts';
import type { ActionClip, GaitClip, RigInstance, UnarmedClipSet } from './character-loader.ts';
import type { BodyState, ClipKind, GaitChoice, KnockPose } from './locomotion.ts';
import { chooseGait, clipKindOf, clipsFor, knockPose } from './locomotion.ts';
import { CONTACT_SHADOW, contactShadow, SHADOW_OWNERS } from './contact-shadow.ts';

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
  standFade: 0.45,
  head: 'DEF-head',
  neck: 'DEF-neck',
  fingers: ['DEF-f_index.01.R', 'DEF-f_index.02.R', 'DEF-thumb.01.R', 'DEF-f_index.01.L', 'DEF-f_index.02.L'],
} as const;

const UP: Vector3 = new Vector3(0, 1, 0);
const SIDE: Vector3 = new Vector3(1, 0, 0);

function turnInWorld(bone: Object3D, axis: Vector3, angle: number, spare: { readonly q: Quaternion; readonly turn: Quaternion; readonly v: Vector3 }): void {
  const parent: Object3D | null = bone.parent;
  if (parent === null || angle === 0) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(spare.q);
  spare.v.copy(axis).applyQuaternion(spare.q.invert()).normalize();
  spare.turn.setFromAxisAngle(spare.v, angle);
  bone.quaternion.premultiply(spare.turn);
}

export type Chance = () => number;

interface FollowThrough {
  left: number;
  readonly speed: number;
}

export interface ActorPose {
  readonly pos: ReadonlyVec2;
  readonly facing: number;
  readonly motion: Motion;
  readonly gait: number;
  readonly knockTime: number;
  readonly busy: boolean;
  readonly deadTime: number;
}

export interface SyncOptions {
  readonly rise: number;
  readonly floor: number;
  readonly turnRate: number;
}

export interface ActorView {
  readonly rig: RigInstance;
  readonly height: number;
  sync(dt: number, actor: ActorPose, options: SyncOptions): void;
  setShadowOpacity(amount: number): void;
  startAction(animation: string, windup: number, recovery: number): boolean;
  interrupt(): void;
  hit(color: Color, strength: number, stagger: boolean): void;
  die(): void;
  revive(): void;
  detach(): void;
  wake(pose: WakePose | null): void;
  setHover(hovered: boolean): void;
  face(facing: number): void;
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

function idleClip(rig: RigInstance): AnimationClip {
  const bare: UnarmedClipSet | null = rig.armed() ? null : rig.clips.unarmed;
  return bare === null ? rig.clips.idle : bare.idle;
}

function bodyClip(rig: RigInstance, state: BodyState, chance: Chance): AnimationClip {
  const choices: readonly AnimationClip[] = clipsFor(state, { idle: idleClip(rig), gaits: rig.clips.gaits.map((gait: GaitClip): AnimationClip => gait.clip), hit: rig.clips.hit, death: rig.clips.death, rise: rig.clips.rise, action: null });
  return oneOf(choices, chance) ?? idleClip(rig);
}

function actionClip(rig: RigInstance, animation: string): ActionClip | undefined {
  const bare: UnarmedClipSet | null = rig.armed() ? null : rig.clips.unarmed;
  return bare?.actions.get(animation) ?? rig.clips.actions.get(animation);
}

export function createActorView(rig: RigInstance, scale: number, facing: number, hoverTint: number = ACTOR.hostileHover, chance: Chance = Math.random): ActorView {
  let current: AnimationAction = rig.mixer.clipAction(idleClip(rig));
  let follow: FollowThrough | null = null;
  let oneShot: number = 0;
  let dead: boolean = false;
  let lying: boolean = false;
  let woke: WakePose | null = null;
  let risen: boolean = false;
  const spare = { q: new Quaternion(), turn: new Quaternion(), v: new Vector3() };
  const side: Vector3 = new Vector3();
  const head: Object3D | undefined = rig.root.getObjectByName(ACTOR.head);
  const neck: Object3D | undefined = rig.root.getObjectByName(ACTOR.neck);
  const fingers: Object3D[] = ACTOR.fingers.flatMap((name: string): Object3D[] => {
    const bone: Object3D | undefined = rig.root.getObjectByName(name);
    return bone === undefined ? [] : [bone];
  });

  const layerWake = (pose: WakePose): void => {
    const turn: number = (pose.turn * WAKE_POSE.turnDegrees * Math.PI) / 180;
    if (neck !== undefined) turnInWorld(neck, UP, turn * WAKE_POSE.neckShare, spare);
    if (head !== undefined) turnInWorld(head, UP, turn * (1 - WAKE_POSE.neckShare), spare);
    if (head !== undefined && pose.dip > 0) {
      side.copy(SIDE).applyAxisAngle(UP, rig.root.rotation.y);
      turnInWorld(head, side, pose.dip, spare);
    }
    if (pose.curl > 0) for (const finger of fingers) finger.rotateX(pose.curl / fingers.length);
  };
  let flash: number = 0;
  let punch: number = 0;
  let hover: boolean = false;
  let yaw: number = facing;
  let gaitIndex: number = -1;
  let lastKind: ClipKind = 'idle';
  let knockSpan: number = 0;
  let knockLeft: number = 0;
  const flashColor: Color = new Color(0xffffff);
  const hoverColor: Color = new Color(hoverTint);
  const mixed: Color = new Color();
  rig.root.scale.setScalar(scale);
  rig.root.rotation.order = 'YXZ';
  rig.root.rotation.y = yaw;
  const shadow: Mesh = contactShadow();
  SHADOW_OWNERS.set(shadow, rig.root);
  let ownShadow: MeshBasicMaterial | null = null;
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
    play(bodyClip(rig, 'hit', chance), ACTOR.hitFade, ACTOR.hitSpeed, true, true);
    oneShot = ACTOR.hitTime;
  };

  const reel = (actor: ActorPose): void => {
    const fresh: boolean = lastKind !== 'knock' || actor.knockTime > knockLeft;
    knockLeft = actor.knockTime;
    if (fresh) {
      knockSpan = actor.knockTime;
      react();
    }
    oneShot = Math.max(oneShot, ACTOR.hitTime, actor.knockTime);
  };

  const locomote = (actor: ActorPose): void => {
    const choice: GaitChoice | null = chooseGait(rig.clips.gaits, scale, actor.gait, gaitIndex);
    const gait: GaitClip | undefined = choice === null ? undefined : rig.clips.gaits[choice.index];
    if (choice === null || gait === undefined) {
      play(idleClip(rig), ACTOR.locomotionFade, 1, false, false);
      return;
    }
    gaitIndex = choice.index;
    play(gait.clip, ACTOR.locomotionFade, choice.rate, false, false);
  };

  return {
    rig,
    height: rig.def.height * rig.def.scale * scale,
    face(heading: number): void {
      yaw = heading;
      rig.root.rotation.y = yaw;
    },
    sync(dt: number, actor: ActorPose, options: SyncOptions): void {
      rig.root.position.set(actor.pos.x, options.floor, actor.pos.z);
      rig.root.rotation.x = 0;
      if (dead) {
        const sunk: number = Math.min(ACTOR.sinkLimit, Math.max(0, actor.deadTime - ACTOR.sinkDelay) * ACTOR.sinkSpeed);
        rig.root.position.y = options.floor - sunk;
      } else if (lying) {
        rig.root.position.y = options.floor;
        rig.root.rotation.y = yaw;
      } else {
        rig.root.position.y = options.floor - (1 - options.rise) * ACTOR.riseDepth;
        yaw = turnToward(yaw, actor.facing, options.turnRate * dt);
        rig.root.rotation.y = yaw;
        const kind: ClipKind = clipKindOf(actor.motion);
        if (oneShot > 0) {
          oneShot -= dt;
          if (!actor.busy && kind === 'gait') oneShot = 0;
        }
        if (follow !== null) {
          follow.left -= dt;
          if (follow.left <= 0) {
            current.timeScale = follow.speed;
            follow = null;
          }
        }
        if (kind === 'knock') reel(actor);
        else knockSpan = 0;
        const knocked: KnockPose = knockPose(knockSpan, actor.knockTime);
        rig.root.position.y += knocked.lift;
        rig.root.rotation.x = -knocked.lean;
        lastKind = kind;
        if (oneShot <= 0) locomote(actor);
      }
      flash = Math.max(0, flash - ACTOR.flashDecay * dt);
      punch = Math.max(0, punch - ACTOR.punchDecay * dt);
      const squash: number = punch * ACTOR.punchSquash;
      const grow: number = 0.35 + 0.65 * options.rise;
      rig.root.scale.set(scale * grow * (1 + squash), scale * grow * (1 - squash), scale * grow * (1 + squash));
      const parent: Object3D | null = rig.root.parent;
      if (parent !== null && shadow.parent !== parent) parent.add(shadow);
      shadow.position.set(rig.root.position.x, rig.root.position.y + CONTACT_SHADOW.lift, rig.root.position.z);
      shadow.scale.setScalar(scale * grow);
      shadow.visible = rig.root.visible && (ownShadow === null || ownShadow.opacity > 0);
      const hoverAmount: number = hover && !dead ? ACTOR.hoverGlow : 0;
      mixed.copy(hoverColor).lerp(flashColor, flash > 0 ? 1 : 0);
      rig.setFlash(mixed, Math.max(flash, hoverAmount));
      rig.mixer.update(dt);
      rig.stepWear(dt);
      if (lying && woke !== null) layerWake(woke);
    },
    startAction(animation: string, windup: number, recovery: number): boolean {
      const entry: ActionClip | undefined = actionClip(rig, animation);
      if (dead || entry === undefined) return false;
      const timed: boolean = entry.impactTime > 0 && windup > 0;
      play(entry.clip, ACTOR.actionFade, timed ? clamped(entry.impactTime / windup, ACTOR.minActionSpeed, ACTOR.maxActionSpeed) : 1, true, true);
      oneShot = windup + recovery + ACTOR.actionTail;
      if (timed) follow = { left: windup, speed: clamped((entry.clip.duration - entry.impactTime) / (recovery + ACTOR.actionTail), ACTOR.minFollowSpeed, ACTOR.maxActionSpeed) };
      return true;
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
      play(bodyClip(rig, 'death', chance), ACTOR.deathFade, ACTOR.deathSpeed, true, true);
    },
    revive(): void {
      dead = false;
      oneShot = 0;
      play(idleClip(rig), ACTOR.locomotionFade, 1, false, true);
    },
    wake(pose: WakePose | null): void {
      const clip: AnimationClip | null = rig.clips.rise;
      woke = pose;
      if (pose === null || clip === null || dead) {
        if (lying && !risen) play(idleClip(rig), ACTOR.standFade, 1, false, true);
        lying = false;
        risen = false;
        return;
      }
      if (!lying) {
        play(clip, ACTOR.locomotionFade, 0, true, true);
        lying = true;
        risen = false;
      }
      if (pose.standing && !risen) {
        play(idleClip(rig), ACTOR.standFade, 1, false, true);
        risen = true;
      }
      if (!risen) current.time = clip.duration * (1 - pose.share);
    },
    setHover(hovered: boolean): void {
      hover = hovered;
    },
    bounds(out: Box3): void {
      out.setFromObject(rig.root);
    },
    setShadowOpacity(amount: number): void {
      if (ownShadow === null) {
        if (!(shadow.material instanceof MeshBasicMaterial)) return;
        ownShadow = shadow.material.clone();
        shadow.material = ownShadow;
      }
      ownShadow.opacity = CONTACT_SHADOW.opacity * Math.min(1, Math.max(0, amount));
      shadow.visible = rig.root.visible && ownShadow.opacity > 0;
    },
    detach(): void {
      shadow.removeFromParent();
      rig.root.removeFromParent();
    },
    dispose(): void {
      ownShadow?.dispose();
      shadow.removeFromParent();
      rig.root.removeFromParent();
      rig.dispose();
    },
  };
}

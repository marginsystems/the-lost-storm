import type { AnimationAction, AnimationClip, Box3, Mesh, Object3D } from 'three';
import { Color, LoopOnce, LoopRepeat, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { beatWings, firebirdMesh } from './firebird.ts';
import type { Contact, WakePose } from './wake-pose.ts';
import { restOffset, restWeight, WAKE_POSE } from './wake-pose.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { ActorPose, SyncOptions } from './actor-pose.ts';
export type { ActorPose, SyncOptions } from './actor-pose.ts';
export { poseOf } from './actor-pose.ts';
import { angleBetween, turnToward } from '../../sim/world/movement.ts';
import type { RigContact } from '../../sim/content/types.ts';
import type { BodyRoles } from '../lobby/lobby-life.ts';
import { bodyRoles, boneNamed, spineBelow } from '../lobby/lobby-life.ts';
import type { ActionClip, GaitClip, RigInstance } from './character-loader.ts';
import { findNode } from './character-loader.ts';
import type { BodyState, ClipKind, GaitChoice, KnockPose } from './locomotion.ts';
import { chooseGait, clipKindOf, clipsFor, knockPose } from './locomotion.ts';
import { CONTACT_SHADOW, contactShadow } from './contact-shadow.ts';
import { actorBounds } from './actor-bounds.ts';
import type { RestShadows } from './rest-shadows.ts';
import { createRestShadows } from './rest-shadows.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import { headReader } from './head-top.ts';
import type { AnimationBank } from './animation-bank.ts';
import { animationBank, closeRate } from './animation-bank.ts';
import type { SpinCentre } from './spin-centre.ts';
import { centreShift, createSpinCentre, holdSpinCentre, measurePivot } from './spin-centre.ts';
import type { SpinPose } from './spin-view.ts';
import type { ClipSpin } from './spin-clips.ts';
import { loopDue, SPIN_CLIPS, startClipSpin } from './spin-clips.ts';

const FLIGHT = { height: 0.8, lift: 0.45, takeoff: 0.16 } as const;

export const ACTOR = {
  turnRate: 22,
  spinFade: 0.12,
  spinPose: 0.5,
  locomotionFade: 0.14,
  actionFade: 0.05,
  actionTail: 0.22,
  hitFade: 0.05,
  hitSpeed: 1.7,
  hitTime: 0.28,
  recoverFade: 0.3,
  flinchFade: 0.08,
  heldPace: 0.04,
  heldGlow: 0.42,
  heldPulse: 0.35,
  heldPulseRate: 5.2,
  heldTint: 0xa9bfdc,
  deathFade: 0.08,
  flashDecay: 9,
  punchDecay: 11,
  punchSquash: 0.14,
  hoverGlow: 1,
  hostileHover: 0xff5a3c,
  friendlyHover: 0xffd9a0,
  edgeTint: 0xf2e6d2,
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
  chestJoints: 2,
  fallTime: 0.9,
  fallDepth: 0.6,
  dropTime: 0.45,
  bobHeight: 0.07,
  bobRate: 2.3,
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

interface Glance {
  readonly from: number;
  readonly span: number;
  left: number;
}

interface Resume {
  readonly action: AnimationAction;
  readonly time: number;
  readonly speed: number;
  readonly oneShot: number;
  readonly follow: FollowThrough | null;
}

export interface ActorView {
  readonly rig: RigInstance;
  readonly height: number;
  readonly headRise: (dt: number) => number;
  sync(dt: number, actor: ActorPose, options: SyncOptions): void;
  setShadowOpacity(amount: number): void;
  startAction(animation: string, windup: number, recovery: number): boolean;
  gesture(clip: AnimationClip | null, hold: AnimationClip | null): void;
  interrupt(): void;
  hit(color: Color, strength: number, stagger: boolean): void;
  glance(span: number): void;
  flinch(span: number): void;
  die(): void;
  standDown(): void;
  revive(): void;
  detach(): void;
  wake(pose: WakePose | null): void;
  setHover(hovered: boolean): void;
  setEdge(amount: number): void;
  face(facing: number): void;
  spin(pose: SpinPose): void;
  bounds(out: Box3): void;
  prime(): void;
  dispose(): void;
}

function clamped(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function oneOf(clips: readonly AnimationClip[], chance: Chance): AnimationClip | null {
  return clips[Math.min(clips.length - 1, Math.floor(chance() * clips.length))] ?? null;
}

export function easeInOut(share: number): number {
  const clampedShare: number = Math.min(1, Math.max(0, share));
  return clampedShare * clampedShare * (3 - 2 * clampedShare);
}

export function easeIn(share: number): number {
  const clampedShare: number = Math.min(1, Math.max(0, share));
  return clampedShare * clampedShare;
}

export function liftAt(lift: number, scale: number, deadTime: number | null, clock: number): number {
  if (lift <= 0) return 0;
  if (deadTime !== null) return lift * scale * (1 - easeIn(deadTime / ACTOR.dropTime));
  return lift * scale + Math.sin(clock * ACTOR.bobRate) * ACTOR.bobHeight * scale;
}

export function fallAt(deadTime: number): number {
  return easeIn(deadTime / ACTOR.fallTime);
}

function idleClip(rig: RigInstance): AnimationClip {
  return rig.stance()?.idle ?? rig.clips.idle;
}

function bodyClip(rig: RigInstance, state: BodyState, chance: Chance): AnimationClip {
  const choices: readonly AnimationClip[] = clipsFor(state, { idle: idleClip(rig), gaits: rig.clips.gaits.map((gait: GaitClip): AnimationClip => gait.clip), hit: rig.clips.hit, death: rig.clips.death, rise: rig.clips.rise, action: null });
  return oneOf(choices, chance) ?? idleClip(rig);
}

function actionClip(rig: RigInstance, animation: string): ActionClip | undefined {
  return rig.stance()?.actions.get(animation) ?? rig.clips.actions.get(animation);
}

export function createActorView(rig: RigInstance, scale: number, facing: number, hoverTint: number = ACTOR.hostileHover, chance: Chance = Math.random): ActorView {
  let current: AnimationAction = rig.mixer.clipAction(idleClip(rig));
  let follow: FollowThrough | null = null;
  let oneShot: number = 0;
  let dead: boolean = false;
  let fading: boolean = false;
  let clock: number = 0;
  let lying: boolean = false;
  let woke: WakePose | null = null;
  let settled: boolean = false;
  const bank: AnimationBank = animationBank();
  let bird: ReturnType<typeof firebirdMesh> | null = null;
  let risen: boolean = false;
  const spare = { q: new Quaternion(), turn: new Quaternion(), v: new Vector3() };
  const side: Vector3 = new Vector3();
  const roles: BodyRoles = bodyRoles(rig.def.bodyParts);
  const head: Object3D | undefined = boneNamed(rig.root, roles.head) ?? undefined;
  const spine: Object3D[] = spineBelow(head ?? null, roles.torso);
  const above: Object3D | null = head?.parent ?? null;
  const neck: Object3D | undefined = above === null || spine.includes(above) ? undefined : above;
  const chest: Object3D[] = spine.slice(-ACTOR.chestJoints);
  const hips: Object3D | null = spine[0]?.parent ?? null;
  const centre: SpinCentre = createSpinCentre();
  const hipsAt: Vector3 = new Vector3();
  let centring: boolean = false;
  let spinPose: AnimationAction | null = null;
  let clipSpin: ClipSpin | null = null;
  let pivot: Object3D | null = null;
  const contacts: { readonly bone: Object3D; readonly radius: number }[] = rig.def.contacts.flatMap((contact: RigContact): { readonly bone: Object3D; readonly radius: number }[] => {
    const bone: Object3D | undefined = findNode(rig.root, contact.bone);
    return bone === undefined ? [] : [{ bone, radius: contact.radius }];
  });
  const grounded: RestShadows = createRestShadows(contacts);
  const touching: Vector3 = new Vector3();
  const rest = (pose: WakePose, floor: number): void => {
    rig.root.updateMatrixWorld(true);
    const reached: Contact[] = contacts.map(({ bone, radius }): Contact => ({ y: bone.getWorldPosition(touching).y, radius }));
    rig.root.position.y += restOffset(reached, floor) * restWeight(pose.share);
  };
  const layered: Object3D[] = [...new Set([...(head === undefined ? [] : [head]), ...(neck === undefined ? [] : [neck]), ...chest])];
  const beneath: Quaternion[] = layered.map((bone: Object3D): Quaternion => bone.quaternion.clone());
  let layering: boolean = false;
  const unlayer = (): void => {
    if (!layering) return;
    layering = false;
    layered.forEach((bone: Object3D, index: number): void => {
      const under: Quaternion | undefined = beneath[index];
      if (under !== undefined) bone.quaternion.copy(under);
    });
  };
  const layerWake = (pose: WakePose): void => {
    layered.forEach((bone: Object3D, index: number): void => {
      beneath[index]?.copy(bone.quaternion);
    });
    layering = true;
    const turn: number = (pose.turn * WAKE_POSE.turnDegrees * Math.PI) / 180;
    if (neck !== undefined) turnInWorld(neck, UP, turn * WAKE_POSE.neckShare, spare);
    if (head !== undefined) turnInWorld(head, UP, turn * (1 - WAKE_POSE.neckShare), spare);
    side.copy(SIDE).applyAxisAngle(UP, rig.root.rotation.y);
    if (head !== undefined && pose.dip > 0) turnInWorld(head, side, pose.dip, spare);
    if (pose.breath !== 0) for (const bone of chest) turnInWorld(bone, side, pose.breath / chest.length, spare);
  };
  let flash: number = 0;
  let punch: number = 0;
  let hover: boolean = false;
  const hoverLevel: Spring = { value: 0, velocity: 0, target: 0 };
  const edgeLevel: Spring = { value: 0, velocity: 0, target: 0 };
  let yaw: number = facing;
  let turned: number = 0;
  let spinning: boolean = false;
  const leanX: Spring = { value: 0, velocity: 0, target: 0 };
  const leanZ: Spring = { value: 0, velocity: 0, target: 0 };
  let gaitIndex: number = -1;
  let lastKind: ClipKind = 'idle';
  let knockSpan: number = 0;
  let knockLeft: number = 0;
  let recovering: boolean = false;
  let acting: AnimationAction | null = null;
  let glance: Glance | null = null;
  let flinchLeft: number = 0;
  let resume: Resume | null = null;
  let stand: AnimationClip | null = null;
  const pace: Spring = { value: 1, velocity: 0, target: 1 };
  const heldLevel: Spring = { value: 0, velocity: 0, target: 0 };
  let heldClock: number = 0;
  const flashColor: Color = new Color(0xffffff);
  const heldColor: Color = new Color(ACTOR.heldTint);
  const glowColor: Color = new Color();
  const hoverColor: Color = new Color(hoverTint);
  const edgeColor: Color = new Color(ACTOR.edgeTint);
  const shownHover: Color = new Color();
  rig.root.scale.setScalar(scale);
  rig.root.rotation.order = 'YXZ';
  rig.root.rotation.y = yaw;
  const shadow: Mesh = contactShadow();
  let ownShadow: MeshBasicMaterial | null = null;
  current.play();

  const shade = (amount: number): void => {
    if (ownShadow === null) {
      if (!(shadow.material instanceof MeshBasicMaterial)) return;
      ownShadow = shadow.material.clone();
      shadow.material = ownShadow;
    }
    ownShadow.opacity = CONTACT_SHADOW.opacity * Math.min(1, Math.max(0, amount));
    shadow.visible = rig.root.visible && ownShadow.opacity > 0;
  };

  const payOwed = (): void => {
    const owed: number = bank.owe();
    if (owed > 0) rig.mixer.update(owed);
  };

  const play = (clip: AnimationClip, fade: number, speed: number, once: boolean, restart: boolean): void => {
    const next: AnimationAction = rig.mixer.clipAction(clip);
    const previous: AnimationAction = current;
    if (next === previous && !restart && (next.timeScale === speed || (bank.owing() && closeRate(next.timeScale, speed)))) return;
    payOwed();
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
    if (previous !== next && fade > 0) next.crossFadeFrom(previous, fade, false);
    else if (previous !== next) previous.stop();
    next.play();
    current = next;
  };

  const react = (span: number): void => {
    if (rig.clips.hit.length === 0) return;
    const clip: AnimationClip = bodyClip(rig, 'hit', chance);
    const length: number = Math.max(ACTOR.hitTime, span);
    play(clip, ACTOR.hitFade, clip.duration > 0 ? clamped(clip.duration / length, ACTOR.minActionSpeed, ACTOR.hitSpeed) : ACTOR.hitSpeed, true, true);
    oneShot = length;
    recovering = true;
    acting = null;
  };

  const unflinch = (): void => {
    const back: Resume | null = resume;
    resume = null;
    flinchLeft = 0;
    recovering = true;
    oneShot = 0;
    if (back === null || dead) return;
    payOwed();
    const previous: AnimationAction = current;
    const next: AnimationAction = back.action;
    next.reset();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.time = back.time;
    next.timeScale = back.speed;
    next.setEffectiveWeight(1);
    if (previous !== next) next.crossFadeFrom(previous, ACTOR.recoverFade, false);
    next.play();
    current = next;
    acting = next;
    oneShot = back.oneShot;
    follow = back.follow === null ? null : { ...back.follow };
    recovering = false;
  };

  const reel = (actor: ActorPose): void => {
    const fresh: boolean = lastKind !== 'knock' || actor.knockTime > knockLeft;
    knockLeft = actor.knockTime;
    if (fresh) {
      knockSpan = actor.knockTime;
      react(actor.knockTime);
    }
    oneShot = Math.max(oneShot, actor.knockTime);
  };

  const locomote = (actor: ActorPose): void => {
    const choice: GaitChoice | null = chooseGait(rig.clips.gaits, scale, actor.gait, gaitIndex);
    const gait: GaitClip | undefined = choice === null ? undefined : rig.clips.gaits[choice.index];
    const fade: number = recovering ? ACTOR.recoverFade : ACTOR.locomotionFade;
    recovering = false;
    acting = null;
    if (choice === null || gait === undefined) {
      play(stand ?? idleClip(rig), fade, 1, false, false);
      return;
    }
    gaitIndex = choice.index;
    play(gait.clip, fade, choice.rate, false, false);
  };

  return {
    rig,
    height: (rig.def.height * rig.def.scale + rig.def.lift) * scale,
    headRise: headReader(rig.root, head ?? null, (rig.def.height * rig.def.scale + rig.def.lift) * scale),
    face(heading: number): void {
      yaw = heading;
      rig.root.rotation.y = yaw;
    },
    sync(dt: number, actor: ActorPose, options: SyncOptions): void {
      if (actor.flightTime !== undefined && !dead) {
        bird ??= firebirdMesh();
        if (bird.parent === null) rig.root.add(bird);
        rig.model.visible = false;
        bird.position.y = FLIGHT.height + Math.min(1, actor.flightTime / FLIGHT.takeoff) * FLIGHT.lift;
        beatWings(bird, actor.flightTime, 0);
      } else if (bird?.parent === rig.root) {
        bird.removeFromParent();
        rig.model.visible = true;
      }
      rig.root.position.set(actor.pos.x, options.floor, actor.pos.z);
      rig.root.rotation.x = 0;
      rig.root.rotation.z = 0;
      centring = false;
      clock += dt;
      if (fading) {
        const fall: number = fallAt(actor.deadTime);
        rig.root.position.y = options.floor + liftAt(rig.def.lift, scale, actor.deadTime, clock) - fall * ACTOR.fallDepth * rig.def.height * rig.def.scale * scale;
        rig.setFade(1 - fall);
        shade(1 - fall);
        settled = fall >= 1;
      } else if (dead) {
        const sunk: number = Math.min(ACTOR.sinkLimit, Math.max(0, actor.deadTime - ACTOR.sinkDelay) * ACTOR.sinkSpeed);
        rig.root.position.y = options.floor + liftAt(rig.def.lift, scale, actor.deadTime, clock) - sunk;
        settled = sunk >= ACTOR.sinkLimit && !current.isRunning();
      } else if (lying) {
        rig.root.position.y = options.floor;
        rig.root.rotation.y = yaw;
      } else {
        rig.root.position.y = options.floor - (1 - options.rise) * ACTOR.riseDepth + liftAt(rig.def.lift, scale, null, clock);
        if (glance === null) yaw = turnToward(yaw, actor.facing, options.turnRate * dt * pace.value);
        else {
          glance.left = Math.max(0, glance.left - dt);
          yaw = glance.from + angleBetween(glance.from, actor.facing) * easeInOut(1 - glance.left / glance.span);
          if (glance.left <= 0) glance = null;
        }
        rig.root.rotation.y = yaw + turned;
        centring = hips !== null && holdSpinCentre(centre, spinPose !== null && spinPose.enabled ? spinPose.getEffectiveWeight() : 0);
        if (!centring && !spinning) spinPose = null;
        if (centring) {
          const shift: ReadonlyVec2 = centreShift(centre, rig.root.rotation.y);
          rig.root.position.x += shift.x;
          rig.root.position.z += shift.z;
        }
        const kind: ClipKind = clipKindOf(actor.motion);
        if (flinchLeft > 0 && kind === 'knock') {
          flinchLeft = 0;
          resume = null;
        }
        if (flinchLeft > 0) {
          flinchLeft -= dt * pace.value;
          if (flinchLeft <= 0) unflinch();
        } else if (oneShot > 0) {
          oneShot -= dt * pace.value;
          if (!actor.busy && kind === 'gait') oneShot = 0;
        }
        if (follow !== null) {
          follow.left -= dt * pace.value;
          if (follow.left <= 0) {
            payOwed();
            current.timeScale = follow.speed;
            follow = null;
          }
        }
        if (flinchLeft > 0) knockSpan = 0;
        else if (kind === 'knock') reel(actor);
        else knockSpan = 0;
        const knocked: KnockPose = knockPose(knockSpan, actor.knockTime);
        rig.root.position.y += knocked.lift;
        springTo(leanX, spinning ? leanX.target : 0);
        springTo(leanZ, spinning ? leanZ.target : 0);
        stepSpring(leanX, dt);
        stepSpring(leanZ, dt);
        const body: number = rig.root.rotation.y;
        rig.root.rotation.x = -knocked.lean + leanX.value * Math.sin(body) + leanZ.value * Math.cos(body);
        rig.root.rotation.z = -(leanX.value * Math.cos(body) - leanZ.value * Math.sin(body));
        lastKind = kind;
        if (oneShot <= 0 && flinchLeft <= 0) locomote(actor);
      }
      springTo(pace, actor.held && !dead ? ACTOR.heldPace : 1);
      stepSpring(pace, dt);
      pace.value = clamped(pace.value, ACTOR.heldPace, 1);
      springTo(heldLevel, actor.held && !dead ? 1 : 0);
      stepSpring(heldLevel, dt);
      heldClock = heldLevel.value > 0 ? heldClock + dt : 0;
      flash = Math.max(0, flash - ACTOR.flashDecay * dt);
      punch = Math.max(0, punch - ACTOR.punchDecay * dt);
      const squash: number = punch * ACTOR.punchSquash;
      const grow: number = 0.35 + 0.65 * options.rise;
      rig.root.scale.set(scale * grow * (1 + squash), scale * grow * (1 - squash), scale * grow * (1 + squash));
      const parent: Object3D | null = rig.root.parent;
      if (parent !== null && shadow.parent !== parent) parent.add(shadow);
      shadow.position.set(rig.root.position.x, (rig.def.lift > 0 ? options.floor : rig.root.position.y) + CONTACT_SHADOW.lift, rig.root.position.z);
      shadow.scale.setScalar(scale * grow);
      shadow.visible = rig.root.visible && (ownShadow === null || ownShadow.opacity > 0);
      springTo(hoverLevel, hover && !dead ? ACTOR.hoverGlow : 0);
      stepSpring(hoverLevel, dt);
      const cool: number = Math.max(0, heldLevel.value) * ACTOR.heldGlow * (1 - ACTOR.heldPulse * (0.5 - 0.5 * Math.cos(heldClock * ACTOR.heldPulseRate)));
      glowColor.copy(flashColor).lerp(heldColor, flash + cool > 0 ? cool / (flash + cool) : 0);
      rig.setFlash(glowColor, Math.max(flash, cool));
      stepSpring(edgeLevel, dt);
      shownHover.copy(hoverColor).multiplyScalar(Math.max(0, hoverLevel.value));
      shownHover.r += edgeColor.r * Math.max(0, edgeLevel.value);
      shownHover.g += edgeColor.g * Math.max(0, edgeLevel.value);
      shownHover.b += edgeColor.b * Math.max(0, edgeLevel.value);
      rig.setHover(shownHover, 1);
      unlayer();
      const posing: boolean = lying || woke !== null;
      const step: number | null = settled && !posing ? null : bank.take(dt * pace.value, posing || options.seen);
      if (step !== null && actor.beat !== null && !actor.held && flinchLeft <= 0 && acting === null && current.getClip() === idleClip(rig)) {
        const length: number = current.getClip().duration;
        if (length > 0) current.time = (((actor.beat - step) % length) + length) % length;
      }
      if (step !== null) rig.mixer.update(step);
      if (centring && hips !== null) {
        rig.root.updateMatrixWorld(true);
        (pivot ?? hips).getWorldPosition(hipsAt);
        measurePivot(centre, { x: hipsAt.x, z: hipsAt.z }, { x: rig.root.position.x, z: rig.root.position.z }, rig.root.rotation.y);
      }
      rig.stepWear(dt);
      if (lying && woke !== null) {
        layerWake(woke);
        if (!risen) rest(woke, options.floor);
        rig.root.updateMatrixWorld(true);
        grounded.place(rig.root.visible ? parent : null, options.floor, scale * grow, risen ? 1 : woke.share);
      } else {
        grounded.hide();
      }
    },
    spin(pose: SpinPose): void {
      const animation: string | null = pose.animation;
      const turn: number = pose.turn;
      leanX.target = pose.lean * Math.sin(pose.leanAt);
      leanZ.target = pose.lean * Math.cos(pose.leanAt);
      if (animation === null || dead) {
        if (!spinning) return;
        yaw += turned;
        turned = 0;
        spinning = false;
        const handedOver: boolean = acting !== null && acting !== spinPose && acting === current;
        const ending: ActionClip | undefined = clipSpin === null || dead || handedOver ? undefined : actionClip(rig, clipSpin.clips.end);
        clipSpin = null;
        if (handedOver) return;
        if (ending !== undefined) {
          play(ending.clip, ACTOR.spinFade, 1, true, true);
          acting = current;
          spinPose = current;
        }
        oneShot = ending === undefined ? Math.min(oneShot, ACTOR.actionTail) : ending.clip.duration;
        recovering = true;
        return;
      }
      turned = turn;
      oneShot = Math.max(oneShot, ACTOR.actionTail);
      if (spinning) {
        if (loopDue(clipSpin, current)) {
          const looping: ActionClip | undefined = actionClip(rig, clipSpin.clips.loop);
          if (looping !== undefined) {
            play(looping.clip, SPIN_CLIPS.loopFade, 1, false, true);
            acting = current;
            spinPose = current;
            clipSpin.loop = current;
          }
        }
        const cycled: AnimationAction | null = clipSpin === null ? spinPose : clipSpin.loop;
        if (pose.cycle !== null && cycled !== null) cycled.time = pose.cycle * cycled.getClip().duration;
        return;
      }
      spinning = true;
      clipSpin = pose.clips === null || [pose.clips.start, pose.clips.loop, pose.clips.end].some((name: string): boolean => actionClip(rig, name) === undefined) ? null : startClipSpin(rig.root, pose.clips);
      pivot = clipSpin === null ? null : clipSpin.pivot;
      const opening: ActionClip | undefined = clipSpin === null ? undefined : actionClip(rig, clipSpin.clips.start);
      if (opening !== undefined) {
        play(opening.clip, ACTOR.spinFade, 1, true, true);
        acting = current;
        spinPose = current;
        return;
      }
      const entry: ActionClip | undefined = actionClip(rig, animation);
      if (entry === undefined) return;
      play(entry.clip, ACTOR.spinFade, 1, true, true);
      current.time = entry.impactTime > 0 ? entry.impactTime : entry.clip.duration * ACTOR.spinPose;
      current.timeScale = 0;
      acting = current;
      spinPose = current;
    },
    startAction(animation: string, windup: number, recovery: number): boolean {
      const entry: ActionClip | undefined = actionClip(rig, animation);
      if (dead || entry === undefined) return false;
      const timed: boolean = entry.impactTime > 0 && windup > 0;
      play(entry.clip, ACTOR.actionFade, timed ? clamped(entry.impactTime / windup, ACTOR.minActionSpeed, ACTOR.maxActionSpeed) : 1, true, true);
      oneShot = windup + recovery + ACTOR.actionTail;
      acting = current;
      flinchLeft = 0;
      resume = null;
      if (timed) follow = { left: windup, speed: clamped((entry.clip.duration - entry.impactTime) / (recovery + ACTOR.actionTail), ACTOR.minFollowSpeed, ACTOR.maxActionSpeed) };
      return true;
    },
    gesture(clip: AnimationClip | null, hold: AnimationClip | null): void {
      stand = hold;
      acting = null;
      recovering = true;
      oneShot = clip === null || dead ? 0 : Math.max(0, clip.duration - ACTOR.recoverFade);
      if (clip !== null && !dead) play(clip, ACTOR.recoverFade, 1, true, true);
    },
    interrupt(): void {
      if (!dead) react(0);
    },
    hit(color: Color, strength: number, stagger: boolean): void {
      flashColor.copy(color);
      flash = Math.max(flash, strength);
      punch = Math.max(punch, strength);
      if (!dead && stagger) react(0);
    },
    glance(span: number): void {
      if (dead || lying || span <= 0) return;
      glance = { from: yaw, span, left: span };
    },
    flinch(span: number): void {
      const clip: AnimationClip | undefined = rig.clips.hit[0];
      if (dead || lying || span <= 0 || clip === undefined) return;
      if (flinchLeft <= 0) resume = acting !== null && current === acting && oneShot > 0 ? { action: acting, time: acting.time, speed: acting.timeScale, oneShot, follow: follow === null ? null : { ...follow } } : null;
      play(clip, ACTOR.flinchFade, clip.duration > 0 ? clamped(clip.duration / span, ACTOR.minActionSpeed, ACTOR.hitSpeed) : ACTOR.hitSpeed, true, true);
      acting = null;
      flinchLeft = span;
    },
    die(): void {
      if (dead) return;
      dead = true;
      oneShot = 0;
      flinchLeft = 0;
      resume = null;
      glance = null;
      acting = null;
      if (rig.clips.death.length === 0) {
        fading = true;
        current.paused = true;
        return;
      }
      play(bodyClip(rig, 'death', chance), ACTOR.deathFade, ACTOR.deathSpeed, true, true);
    },
    standDown(): void {
      oneShot = 0;
      flinchLeft = 0;
      resume = null;
      glance = null;
      acting = null;
      play(idleClip(rig), ACTOR.standFade, 1, false, true);
    },
    revive(): void {
      dead = false;
      flinchLeft = 0;
      resume = null;
      glance = null;
      if (fading) {
        fading = false;
        current.paused = false;
        rig.setFade(1);
        shade(1);
      }
      settled = false;
      bank.drop();
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
        play(clip, 0, 0, true, true);
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
    setEdge(amount: number): void {
      springTo(edgeLevel, amount);
    },
    bounds(out: Box3): void {
      actorBounds(rig.root, out);
    },
    prime(): void {
      for (const clip of rig.clips.death) rig.mixer.clipAction(clip);
      for (const clip of rig.clips.hit) rig.mixer.clipAction(clip);
    },
    setShadowOpacity(amount: number): void {
      shade(amount);
    },
    detach(): void {
      shadow.removeFromParent();
      grounded.hide();
      rig.root.removeFromParent();
    },
    dispose(): void {
      bird?.removeFromParent();
      bird?.geometry.dispose();
      bird?.material.dispose();
      ownShadow?.dispose();
      grounded.detach();
      shadow.removeFromParent();
      rig.root.removeFromParent();
      rig.dispose();
    },
  };
}

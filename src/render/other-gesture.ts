import type { GestureDef, PostureDef } from '../../sim/content/gestures.ts';
import { gestureOf } from '../../sim/content/gestures.ts';
import type { LiveAct } from '../backend/live-protocol.ts';
import type { TrackPose } from './other-track.ts';
import { ACTOR, easeInOut } from './actor-view.ts';

export const GESTURE = {
  blend: ACTOR.recoverFade,
  staleMs: 2000,
  catchUpSeconds: 0.45,
  catchUpFrom: 0.01,
} as const;

export interface GestureCue {
  readonly serial: number;
  readonly once: string | null;
  readonly hold: string | null;
}

export type ClipTimes = (clip: string) => number | null;

interface Seat {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

type Phase =
  | { readonly kind: 'still' }
  | { readonly kind: 'once'; left: number }
  | { readonly kind: 'hold' }
  | { readonly kind: 'seated'; readonly posture: PostureDef }
  | { readonly kind: 'rising'; left: number; readonly posture: PostureDef; readonly seat: Seat; readonly after: { readonly act: LiveAct | null } | null };

interface ActSample {
  readonly at: number;
  readonly act: LiveAct | null;
}

interface CatchUp {
  readonly from: Seat;
  left: number;
}

export interface GestureState {
  cue: GestureCue;
  phase: Phase;
  readonly pending: ActSample[];
  shown: LiveAct | null;
  catchUp: CatchUp | null;
  last: Seat | null;
}

export function createGestureState(): GestureState {
  return { cue: { serial: 0, once: null, hold: null }, phase: { kind: 'still' }, pending: [], shown: null, catchUp: null, last: null };
}

function cue(state: GestureState, once: string | null, hold: string | null): void {
  state.cue = { serial: state.cue.serial + 1, once, hold };
}

function sameAct(one: LiveAct | null, other: LiveAct | null): boolean {
  return one?.id === other?.id && one?.at === other?.at;
}

function clipsOf(gesture: GestureDef): readonly string[] {
  return gesture.plays === 'posture' ? [gesture.clip, gesture.posture.enter, gesture.posture.exit] : [gesture.clip];
}

function latest(state: GestureState): LiveAct | null {
  const last: ActSample | undefined = state.pending[state.pending.length - 1];
  if (last !== undefined) return last.act;
  return state.phase.kind === 'rising' && state.phase.after !== null ? state.phase.after.act : state.shown;
}

export function plantedBy(state: GestureState): readonly string[] {
  const phase: Phase = state.phase;
  return phase.kind === 'seated' || phase.kind === 'rising' ? phase.posture.plants : [];
}

export function gestureNeeds(state: GestureState): boolean {
  return latest(state) !== null || state.shown !== null;
}

export function placeAct(state: GestureState, act: LiveAct | null): void {
  if (state.pending.length === 0 && state.phase.kind !== 'rising' && sameAct(state.shown, act)) return;
  state.pending.length = 0;
  state.catchUp = null;
  state.last = null;
  state.shown = act;
  const gesture: GestureDef | null = act === null ? null : gestureOf(act.id);
  if (gesture === null || gesture.plays === 'once') {
    state.phase = { kind: 'still' };
    if (state.cue.once !== null || state.cue.hold !== null) cue(state, null, null);
    return;
  }
  state.phase = gesture.plays === 'hold' ? { kind: 'hold' } : { kind: 'seated', posture: gesture.posture };
  cue(state, null, gesture.clip);
}

export function queueAct(state: GestureState, at: number, act: LiveAct | null): void {
  if (!sameAct(latest(state), act)) state.pending.push({ at, act });
}

function rise(state: GestureState, posture: PostureDef, seat: Seat, after: { readonly act: LiveAct | null } | null): void {
  state.phase = { kind: 'rising', left: Number.POSITIVE_INFINITY, posture, seat, after };
  cue(state, posture.exit, null);
}

function start(state: GestureState, act: LiveAct | null, seat: Seat): void {
  const gesture: GestureDef | null = act === null ? null : gestureOf(act.id);
  const phase: Phase = state.phase;
  if (phase.kind === 'seated' && (gesture === null || gesture.plays !== 'posture' || gesture.posture !== phase.posture)) {
    rise(state, phase.posture, seat, { act });
    return;
  }
  state.shown = act;
  if (gesture === null) {
    if (phase.kind === 'hold') cue(state, null, null);
    if (phase.kind !== 'once') state.phase = { kind: 'still' };
    return;
  }
  switch (gesture.plays) {
    case 'once':
      state.phase = { kind: 'once', left: Number.POSITIVE_INFINITY };
      cue(state, gesture.clip, null);
      return;
    case 'hold':
      state.phase = { kind: 'hold' };
      cue(state, null, gesture.clip);
      return;
    case 'posture':
      cue(state, phase.kind === 'seated' ? null : gesture.posture.enter, gesture.clip);
      state.phase = { kind: 'seated', posture: gesture.posture };
      return;
  }
}

function ready(act: LiveAct | null, clips: ClipTimes): boolean {
  const gesture: GestureDef | null = act === null ? null : gestureOf(act.id);
  return gesture === null || clipsOf(gesture).every((clip: string): boolean => clips(clip) !== null);
}

function timeLeft(state: GestureState, clips: ClipTimes): void {
  const phase: Phase = state.phase;
  if ((phase.kind !== 'once' && phase.kind !== 'rising') || phase.left !== Number.POSITIVE_INFINITY) return;
  const clip: string | null = state.cue.once;
  phase.left = Math.max(0, (clip === null ? 0 : (clips(clip) ?? 0)) - GESTURE.blend);
}

function takeDue(state: GestureState, now: number, seat: Seat, clips: ClipTimes): void {
  while (state.phase.kind !== 'rising') {
    const sample: ActSample | undefined = state.pending[0];
    if (sample === undefined || sample.at > now) return;
    const playable: boolean = ready(sample.act, clips);
    if (!playable && now - sample.at <= GESTURE.staleMs) return;
    state.pending.shift();
    if (playable || gestureOf(sample.act?.id)?.plays !== 'once') start(state, sample.act, seat);
    else state.shown = sample.act;
  }
}

export function stepGesture(state: GestureState, now: number, dt: number, pose: TrackPose, moving: boolean, clips: ClipTimes): void {
  const seat: Seat = state.last ?? { x: pose.x, z: pose.z, facing: pose.facing };
  takeDue(state, now, seat, clips);
  timeLeft(state, clips);
  const phase: Phase = state.phase;
  switch (phase.kind) {
    case 'still':
      return;
    case 'once':
      phase.left -= dt;
      if (moving || phase.left <= 0) state.phase = { kind: 'still' };
      return;
    case 'hold':
      if (!moving) return;
      state.phase = { kind: 'still' };
      cue(state, null, null);
      return;
    case 'seated':
      if (!moving) return;
      rise(state, phase.posture, seat, null);
      timeLeft(state, clips);
      return;
    case 'rising': {
      phase.left -= dt;
      if (phase.left > 0) return;
      if (Math.hypot(pose.x - phase.seat.x, pose.z - phase.seat.z) > GESTURE.catchUpFrom) state.catchUp = { from: phase.seat, left: GESTURE.catchUpSeconds };
      state.phase = { kind: 'still' };
      cue(state, null, null);
      if (phase.after !== null) start(state, phase.after.act, seat);
      takeDue(state, now, seat, clips);
      timeLeft(state, clips);
      return;
    }
  }
}

export function shownPose(state: GestureState, pose: TrackPose, dt: number): TrackPose {
  const shown: TrackPose = placed(state, pose, dt);
  state.last = { x: shown.x, z: shown.z, facing: shown.facing };
  return shown;
}

function placed(state: GestureState, pose: TrackPose, dt: number): TrackPose {
  const phase: Phase = state.phase;
  if (phase.kind === 'rising') return { x: phase.seat.x, z: phase.seat.z, facing: phase.seat.facing, speed: 0 };
  const catchUp: CatchUp | null = state.catchUp;
  if (catchUp === null) return pose;
  catchUp.left = Math.max(0, catchUp.left - dt);
  const share: number = easeInOut(1 - catchUp.left / GESTURE.catchUpSeconds);
  if (catchUp.left <= 0) state.catchUp = null;
  const dx: number = pose.x - catchUp.from.x;
  const dz: number = pose.z - catchUp.from.z;
  const speed: number = Math.max(pose.speed, Math.hypot(dx, dz) / GESTURE.catchUpSeconds);
  return { x: catchUp.from.x + dx * share, z: catchUp.from.z + dz * share, facing: pose.facing, speed };
}

import type { Vec2 } from '../../sim/math.ts';
import type { MoveCommand, SkillCommand } from '../../sim/world/types.ts';

export const TOUCH = {
  stickRadius: 52,
  deadzone: 0.2,
  stickReach: 3.2,
  aimRange: 9,
  meleeRange: 2.6,
  aimConeDegrees: 70,
  repeatSeconds: 0.09,
  moveSideShare: 0.45,
  rotateHintMs: 5200,
  phoneShortSide: 500,
  rotateSeenKey: 'the-lost-storm.rotate-hint.v1',
  fullTurn: 360,
  tapSlopPx: 12,
  tapMs: 320,
  pinchJoinMs: 160,
} as const;

export interface StickReading {
  readonly x: number;
  readonly y: number;
  readonly magnitude: number;
}

export interface Candidate {
  readonly id: number;
  readonly pos: Vec2;
  readonly alive: boolean;
}

export type TouchButton =
  | { readonly kind: 'attack'; readonly slot: number }
  | { readonly kind: 'skill'; readonly slot: number }
  | { readonly kind: 'flask'; readonly slot: number; readonly label: string };

export interface SkillBarEntry {
  readonly bindings: readonly string[];
  readonly filled: boolean;
}

export interface FlaskEntry {
  readonly name: string;
}

export function prefersTouch(search: string, coarsePointer: boolean, shortSide: number): boolean {
  const forced: string | null = new URLSearchParams(search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return coarsePointer || shortSide <= TOUCH.phoneShortSide;
}

export function readStick(dx: number, dy: number, radius: number = TOUCH.stickRadius): StickReading {
  const length: number = Math.hypot(dx, dy);
  if (length === 0 || radius <= 0) return { x: 0, y: 0, magnitude: 0 };
  const magnitude: number = Math.min(1, length / radius);
  return { x: (dx / length) * magnitude, y: (dy / length) * magnitude, magnitude };
}

export function clampKnob(dx: number, dy: number, radius: number = TOUCH.stickRadius): Vec2 {
  const length: number = Math.hypot(dx, dy);
  if (length <= radius) return { x: dx, z: dy };
  return { x: (dx / length) * radius, z: (dy / length) * radius };
}

export function stickDirection(reading: StickReading, yaw: number): Vec2 | null {
  if (reading.magnitude < TOUCH.deadzone) return null;
  const sx: number = reading.x / reading.magnitude;
  const sy: number = reading.y / reading.magnitude;
  return { x: Math.cos(yaw) * sx + Math.sin(yaw) * sy, z: -Math.sin(yaw) * sx + Math.cos(yaw) * sy };
}

export function stickMove(from: Vec2, direction: Vec2 | null, wasMoving: boolean): MoveCommand | null {
  if (direction === null) return null;
  return { type: 'move', held: wasMoving, dest: { x: from.x + direction.x * TOUCH.stickReach, z: from.z + direction.z * TOUCH.stickReach } };
}

export function facingVector(facing: number): Vec2 {
  return { x: Math.sin(facing), z: Math.cos(facing) };
}

export function autoAimTarget(candidates: readonly Candidate[], from: Vec2, ahead: Vec2): Candidate | null {
  const coneCos: number = Math.cos((TOUCH.aimConeDegrees * Math.PI) / 180);
  const aheadLength: number = Math.max(Math.hypot(ahead.x, ahead.z), Number.EPSILON);
  let best: Candidate | null = null;
  let bestDistance: number = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.alive) continue;
    const dx: number = candidate.pos.x - from.x;
    const dz: number = candidate.pos.z - from.z;
    const distance: number = Math.hypot(dx, dz);
    if (distance > TOUCH.aimRange) continue;
    const inFront: boolean = distance === 0 || (dx * ahead.x + dz * ahead.z) / (distance * aheadLength) >= coneCos;
    if (!inFront && distance > TOUCH.meleeRange) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function aimedSkill(slot: number, from: Vec2, ahead: Vec2, target: Candidate | null): SkillCommand {
  if (target !== null) return { type: 'skill', slot, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id };
  const length: number = Math.max(Math.hypot(ahead.x, ahead.z), Number.EPSILON);
  return { type: 'skill', slot, aim: { x: from.x + (ahead.x / length) * TOUCH.aimRange, z: from.z + (ahead.z / length) * TOUCH.aimRange }, targetId: null };
}

export function touchButtons(skillBar: readonly SkillBarEntry[], attackBinding: string, flasks: readonly FlaskEntry[]): TouchButton[] {
  const buttons: TouchButton[] = [];
  skillBar.forEach((entry: SkillBarEntry, slot: number): void => {
    if (entry.bindings.includes(attackBinding)) buttons.push({ kind: 'attack', slot });
    else if (entry.filled) buttons.push({ kind: 'skill', slot });
  });
  buttons.sort((a: TouchButton, b: TouchButton): number => (a.kind === 'attack' ? 0 : 1) - (b.kind === 'attack' ? 0 : 1));
  flasks.forEach((flask: FlaskEntry, slot: number): void => {
    buttons.push({ kind: 'flask', slot, label: flask.name });
  });
  return buttons;
}

export function pinchWheelDelta(previous: number, next: number, zoomStep: number): number {
  if (previous <= 0 || next <= 0 || zoomStep <= 0) return 0;
  return (previous / next - 1) / zoomStep;
}

export function sideForPoint(x: number, viewportWidth: number): 'move' | 'world' {
  return x < viewportWidth * TOUCH.moveSideShare ? 'move' : 'world';
}

export function startsStick(x: number, viewportWidth: number, stickDown: boolean, worldFingers: number): boolean {
  return !stickDown && worldFingers === 0 && sideForPoint(x, viewportWidth) === 'move';
}

export function joinsPinch(stickMoved: boolean, msSinceStick: number): boolean {
  return !stickMoved && msSinceStick <= TOUCH.pinchJoinMs;
}

export function rotateHintShows(portrait: boolean, msInPortrait: number, dismissed: boolean, playing: boolean): boolean {
  return playing && portrait && !dismissed && msInPortrait < TOUCH.rotateHintMs;
}

export function cooldownTurn(remaining: number, total: number): number {
  if (total <= 0 || remaining <= 0) return TOUCH.fullTurn;
  return Math.round((1 - Math.min(1, remaining / total)) * TOUCH.fullTurn);
}

export function isTap(dx: number, dy: number, ms: number): boolean {
  return Math.hypot(dx, dy) <= TOUCH.tapSlopPx && ms <= TOUCH.tapMs;
}

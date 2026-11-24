import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { createRng } from '../rng.ts';
import { turnInPlace } from '../world/pivot.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import { commandsFor } from './act.ts';
import { bystanderBody, paceHero } from './bystanders.ts';
import type { Action } from './contract.ts';
import { RL } from './contract.ts';
import type { Course, GatherGoal } from './gather.ts';
import { GATHER, gatherObserve, gatherWorld, goalPoint, readyGatherHero, settledAt, startCourse } from './gather.ts';
import type { Observation } from './observe.ts';
import type { PolicyFile } from './policy-file.ts';
import { policyFits, readPolicyFile } from './policy-file.ts';
import { createPolicyNet } from './policy-net.ts';
import type { Recall } from './recall.ts';
import { createRecall, recallEvents, rememberDecision } from './recall.ts';
import type { RivalPilot } from './rival.ts';
import { netPilot } from './rival.ts';

export const RESIDENT = {
  level: 10,
  pace: 1.6,
  mostTicks: 8,
  moved: 0.01,
} as const;

export type PilotIntent =
  | { readonly kind: 'go'; readonly to: Vec2; readonly pace: number }
  | { readonly kind: 'meet'; readonly who: string; readonly pace: number }
  | { readonly kind: 'stand'; readonly face: Vec2 | null };

export interface PilotOther {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export interface PilotPose {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  readonly speed: number;
  readonly arrived: boolean;
}

export interface ResidentPilot {
  see(others: readonly PilotOther[]): void;
  want(intent: PilotIntent): void;
  step(dt: number): PilotPose;
}

export interface ResidentOptions {
  readonly content: Content;
  readonly zone: string;
  readonly pilot: RivalPilot | null;
  readonly start: { readonly x: number; readonly z: number; readonly facing: number };
  readonly seed: number;
}

interface Resident {
  readonly world: World;
  readonly hero: PlayerState;
  readonly pilot: RivalPilot | null;
  readonly others: Map<string, PlayerState>;
  readonly recall: Recall;
  intent: PilotIntent;
  course: Course | null;
  deadline: number;
  pace: number;
  clock: number;
  ticks: number;
  speed: number;
}

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function sameIntent(a: PilotIntent, b: PilotIntent): boolean {
  switch (a.kind) {
    case 'go':
      return b.kind === 'go' && a.to.x === b.to.x && a.to.z === b.to.z && a.pace === b.pace;
    case 'meet':
      return b.kind === 'meet' && a.who === b.who && a.pace === b.pace;
    case 'stand':
      return b.kind === 'stand' && (a.face === null ? b.face === null : b.face !== null && a.face.x === b.face.x && a.face.z === b.face.z);
  }
  return false;
}

function goalOf(resident: Resident): GatherGoal | null {
  const intent: PilotIntent = resident.intent;
  switch (intent.kind) {
    case 'go':
      return { kind: 'spot', at: { x: intent.to.x, z: intent.to.z } };
    case 'meet': {
      const body: PlayerState | undefined = resident.others.get(intent.who);
      return body === undefined ? null : { kind: 'meet', id: body.id };
    }
    case 'stand':
      return { kind: 'face', spot: { x: resident.hero.pos.x, z: resident.hero.pos.z }, at: intent.face === null ? null : { x: intent.face.x, z: intent.face.z } };
  }
  return null;
}

function timeLimitOf(course: Course, pace: number): number {
  return course.goal.kind === 'face' ? GATHER.faceTime : GATHER.baseTime + (course.length / pace) * GATHER.timePerStride;
}

function openCourse(resident: Resident): void {
  const goal: GatherGoal | null = goalOf(resident);
  resident.course = goal === null ? null : startCourse(resident.world, resident.hero, goal);
  resident.deadline = resident.course === null ? resident.world.time : resident.world.time + timeLimitOf(resident.course, resident.pace);
}

function courseStale(resident: Resident): boolean {
  const course: Course | null = resident.course;
  if (course === null) return resident.intent.kind !== 'stand';
  if (goalPoint(resident.world, course.goal) === null) return true;
  return resident.world.time >= resident.deadline && !settledAt(resident.world, resident.hero, course.goal);
}

function walkOnly(action: Action): Action {
  return { move: action.move, skill: 0, target: action.target, use: 0 };
}

function stop(hero: PlayerState): Command[] {
  return hero.intent.type === 'idle' ? [] : [{ type: 'stop' }];
}

function plainCommands(resident: Resident, course: Course): Command[] {
  const { world, hero } = resident;
  const point: Vec2 | null = goalPoint(world, course.goal);
  if (point === null || course.goal.kind === 'face') return stop(hero);
  const apart: number = gap(hero.pos, point);
  if (course.goal.kind === 'spot') return apart > GATHER.arrive && hero.intent.type === 'idle' ? [{ type: 'move', held: false, dest: { x: point.x, z: point.z } }] : [];
  if (apart <= (GATHER.comfort.min + GATHER.comfort.max) / 2) return stop(hero);
  return [{ type: 'move', held: false, dest: { x: point.x, z: point.z } }];
}

function plainTurn(resident: Resident): void {
  const { world, hero, course } = resident;
  if (course === null || hero.moving) return;
  const aim: Vec2 | null = course.goal.kind === 'face' ? course.goal.at : course.goal.kind === 'meet' ? goalPoint(world, course.goal) : null;
  if (aim !== null) turnInPlace(world, hero, { x: aim.x - hero.pos.x, z: aim.z - hero.pos.z }, RL.tick);
}

function decide(resident: Resident): Command[] {
  if (courseStale(resident)) openCourse(resident);
  const course: Course | null = resident.course;
  if (course === null) return stop(resident.hero);
  if (resident.pilot === null) return plainCommands(resident, course);
  const seen: Observation = gatherObserve(resident.world, resident.hero, course, Math.max(0, resident.deadline - resident.world.time), resident.recall);
  const action: Action = walkOnly(resident.pilot(seen.obs, seen.mask));
  rememberDecision(resident.recall, action);
  return commandsFor(resident.world, action, seen.view);
}

function tick(resident: Resident): void {
  const commands: Command[] = resident.ticks % RL.ticksPerDecision === 0 ? decide(resident) : [];
  paceHero(resident.hero, resident.pace);
  if (resident.pilot === null) plainTurn(resident);
  const events: WorldEvent[] = stepWorld(resident.world, commands, RL.tick);
  recallEvents(resident.recall, resident.world, resident.hero, events);
  resident.ticks += 1;
}

function see(resident: Resident, others: readonly PilotOther[]): void {
  const present: Set<string> = new Set<string>(others.map((other: PilotOther): string => other.id));
  for (const [id, body] of resident.others) {
    if (present.has(id)) continue;
    resident.others.delete(id);
    const at: number = resident.world.heroes.indexOf(body);
    if (at >= 0) resident.world.heroes.splice(at, 1);
  }
  for (const other of others) {
    const at: Vec2 = { x: other.x, z: other.z };
    const known: PlayerState | undefined = resident.others.get(other.id);
    if (known === undefined) {
      resident.others.set(other.id, bystanderBody(resident.world, at, other.facing, RESIDENT.pace));
      continue;
    }
    known.moving = gap(known.pos, at) > RESIDENT.moved;
    known.pos = at;
    known.facing = other.facing;
  }
}

function want(resident: Resident, intent: PilotIntent): void {
  if (sameIntent(resident.intent, intent)) return;
  resident.intent = intent;
  if (intent.kind !== 'stand') resident.pace = Math.max(0, intent.pace);
  openCourse(resident);
}

function arrived(resident: Resident): boolean {
  const course: Course | null = resident.course;
  if (course === null) return resident.intent.kind === 'stand';
  return settledAt(resident.world, resident.hero, course.goal);
}

function step(resident: Resident, dt: number): PilotPose {
  resident.clock += Math.max(0, dt);
  const ticks: number = Math.min(RESIDENT.mostTicks, Math.floor(resident.clock / RL.tick));
  resident.clock = ticks === RESIDENT.mostTicks ? 0 : resident.clock - ticks * RL.tick;
  const hero: PlayerState = resident.hero;
  const from: Vec2 = { x: hero.pos.x, z: hero.pos.z };
  for (let done: number = 0; done < ticks; done += 1) tick(resident);
  if (ticks > 0) resident.speed = gap(from, hero.pos) / (ticks * RL.tick);
  return { x: hero.pos.x, z: hero.pos.z, facing: hero.facing, speed: resident.speed, arrived: arrived(resident) };
}

function zoneOf(content: Content, id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`there is no zone ${id} for the resident to live in`);
  return zone;
}

export function createResidentPilot(options: ResidentOptions): ResidentPilot {
  const world: World = gatherWorld(options.content, zoneOf(options.content, options.zone), options.seed);
  readyGatherHero(world, createRng(options.seed), RESIDENT.level);
  const hero: PlayerState = world.player;
  hero.pos = { x: options.start.x, z: options.start.z };
  hero.facing = options.start.facing;
  paceHero(hero, RESIDENT.pace);
  const resident: Resident = { world, hero, pilot: options.pilot, others: new Map<string, PlayerState>(), recall: createRecall(), intent: { kind: 'stand', face: null }, course: null, deadline: world.time, pace: RESIDENT.pace, clock: 0, ticks: 0, speed: 0 };
  openCourse(resident);
  return {
    see: (others: readonly PilotOther[]): void => see(resident, others),
    want: (intent: PilotIntent): void => want(resident, intent),
    step: (dt: number): PilotPose => step(resident, dt),
  };
}

export function residentPilotFrom(bytes: Uint8Array): RivalPilot {
  const file: PolicyFile = readPolicyFile(bytes);
  if (!policyFits(file)) throw new Error(`the resident's model was trained for contract ${file.contract.fingerprint}, not the one the game speaks`);
  return netPilot(createPolicyNet(file));
}

import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { cellCenter, copyGrid, isWalkable, lineWalkable } from '../nav/grid.ts';
import { zoneGrid } from '../nav/marker-bodies.ts';
import { findPath, nearestReached, reachFrom } from '../nav/path.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import { createWorld } from '../world/create.ts';
import { findHero } from '../world/heroes.ts';
import { stepWorld } from '../world/step.ts';
import type { ZoneCache } from '../zone-cache.ts';
import { zoneCache } from '../zone-cache.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { ArenaOutcome } from './arena.ts';
import { ARENA, benchHero } from './arena.ts';
import type { Bystander, Crowd } from './bystanders.ts';
import { crowdCommands, paceHero, placeCrowd } from './bystanders.ts';
import { MOVE_CHOICES, RL, SKILL_CHOICES, USE_CHOICES } from './contract.ts';
import type { Observation, ObserveContext } from './observe.ts';
import { observe, seenMonsters } from './observe.ts';
import type { Recall } from './recall.ts';
import { createRecall, noteSeen, recallEvents } from './recall.ts';
import { REWARD } from './reward.ts';

export const GATHER = {
  hideout: 'hideout',
  hideoutShare: 0.5,
  zonesHeld: 8,
  pace: { min: 1.3, max: 2.2 },
  crowd: { min: 1, max: 8 },
  goalWeights: { spot: 0.4, meet: 0.4, face: 0.2 },
  leg: { min: 4, max: 16 },
  detour: 1.8,
  layoutTries: 48,
  spotReach: 3,
  layoutGap: 3,
  faceGap: { min: 2, max: 10 },
  faceNone: 0.2,
  facePerson: 0.5,
  arrive: 0.6,
  comfort: { min: 1.3, max: 2.2 },
  facingSlack: 0.5,
  standReach: 0.75,
  hold: 2,
  quietHold: 12,
  baseTime: 5,
  timePerStride: 1.8,
  faceTime: 6,
  repath: 8,
  reached: 1,
  progress: 0.1,
  progressCap: 0.5,
  turn: 0.05,
  space: 1,
  spaceCost: 0.03,
  contactGap: 0.05,
  contactCost: 0.05,
  pairReach: 3.5,
  pairCone: 0.6,
  crossCost: 0.3,
  jitterTurn: 0.3,
  jitterWindow: 2,
  jitterCost: 0.02,
} as const;

export const GATHER_GOALS = ['spot', 'meet', 'face'] as const;
export type GatherGoalKind = (typeof GATHER_GOALS)[number];

export type GatherGoal =
  | { readonly kind: 'spot'; readonly at: Vec2 }
  | { readonly kind: 'meet'; readonly id: number }
  | { readonly kind: 'face'; readonly spot: Vec2; readonly at: Vec2 | null };

export interface Course {
  readonly goal: GatherGoal;
  path: Vec2[];
  pathAge: number;
  readonly length: number;
  left: number;
}

export interface GatherOptions {
  readonly seed: number;
  readonly zone?: string;
  readonly level?: number;
  readonly goal?: GatherGoalKind;
  readonly crowd?: number;
}

export interface GatherTally {
  contacts: number;
  intrusions: number;
  crossings: number;
  jitters: number;
}

export interface Gather {
  readonly options: GatherOptions;
  readonly world: World;
  readonly hero: PlayerState;
  readonly crowd: readonly Bystander[];
  readonly zone: string;
  readonly level: number;
  readonly pace: number;
  readonly course: Course;
  readonly recall: Recall;
  readonly timeLimit: number;
  readonly start: number;
  readonly tally: GatherTally;
  readonly inside: Set<number>;
  readonly touching: Set<number>;
  readonly turns: number[];
  facing: number;
  from: Vec2;
  aimError: number | null;
  held: number;
  outcome: ArenaOutcome;
  total: number;
  decisions: number;
}

export interface GatherStep {
  readonly reward: number;
  readonly done: boolean;
  readonly events: readonly WorldEvent[];
}

interface Ground {
  readonly grid: NavGrid;
  readonly reach: Uint8Array;
  readonly cells: readonly number[];
}

interface Layout {
  readonly start: Vec2;
  readonly goal: Vec2;
  readonly length: number;
}

const GROUNDS: ZoneCache<Ground> = zoneCache<Ground>('gather grounds', { most: GATHER.zonesHeld });
const COMFORT_MID: number = (GATHER.comfort.min + GATHER.comfort.max) / 2;
const SKILL_START: number = MOVE_CHOICES;
const USE_START: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets;

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function facingError(hero: PlayerState, point: Vec2): number {
  return Math.abs(turnBetween(hero.facing, facingOf({ x: point.x - hero.pos.x, z: point.z - hero.pos.z })));
}

export function gatherZones(content: Content): ZoneDef[] {
  return [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.duel === null && zone.void === null);
}

function groundOf(content: Content, zone: ZoneDef): Ground {
  const known: Ground | undefined = GROUNDS.get(zone);
  if (known !== undefined) return known;
  const grid: NavGrid = zoneGrid(content, zone);
  const reach: Uint8Array = reachFrom(grid, zone.playerStart);
  const cells: number[] = [];
  reach.forEach((reached: number, cell: number): void => {
    if (reached === 1) cells.push(cell);
  });
  const ground: Ground = { grid, reach, cells };
  GROUNDS.set(zone, ground);
  return ground;
}

export function gatherWorld(content: Content, zone: ZoneDef, seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: false });
  world.zone = zone;
  world.grid = copyGrid(groundOf(content, zone).grid);
  world.monsters = [];
  world.npcs = [];
  world.moments = [];
  world.encounters = [];
  world.packReturns = [];
  world.spawnedPacks = [];
  world.roused = [];
  world.wards = [];
  world.ground = [];
  world.events = [];
  return world;
}

export function readyGatherHero(world: World, rng: Rng, level: number): void {
  stepWorld(world, [{ type: 'bench', hero: benchHero(world.content, rng, level) }], RL.tick);
  world.events = [];
}

function lengthOf(from: Vec2, path: readonly Vec2[]): number {
  let total: number = 0;
  let at: Vec2 = from;
  for (const point of path) {
    total += gap(at, point);
    at = point;
  }
  return total;
}

function routeTo(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const found: Vec2[] = findPath(grid, from, to);
  return found.length === 0 ? [{ x: to.x, z: to.z }] : found;
}

export function goalPoint(world: World, goal: GatherGoal): Vec2 | null {
  switch (goal.kind) {
    case 'spot':
      return goal.at;
    case 'meet':
      return findHero(world, goal.id)?.pos ?? null;
    case 'face':
      return goal.spot;
  }
  return null;
}

function leftOf(world: World, hero: PlayerState, goal: GatherGoal, path: readonly Vec2[]): number {
  const point: Vec2 | null = goalPoint(world, goal);
  if (point === null) return 0;
  switch (goal.kind) {
    case 'face':
      return gap(hero.pos, point);
    case 'spot':
      return lineWalkable(world.grid, hero.pos, point) ? gap(hero.pos, point) : lengthOf(hero.pos, path);
    case 'meet':
      return Math.max(0, (lineWalkable(world.grid, hero.pos, point) ? gap(hero.pos, point) : lengthOf(hero.pos, path)) - COMFORT_MID);
  }
  return 0;
}

function trim(hero: PlayerState, course: Course): void {
  while (course.path.length > 1) {
    const next: Vec2 | undefined = course.path[0];
    if (next === undefined || gap(hero.pos, next) > GATHER.reached) return;
    course.path.shift();
  }
}

function repath(world: World, hero: PlayerState, course: Course): void {
  const point: Vec2 | null = goalPoint(world, course.goal);
  course.path = point === null || course.goal.kind === 'face' ? [] : routeTo(world.grid, hero.pos, point);
  course.pathAge = 0;
  trim(hero, course);
}

export function startCourse(world: World, hero: PlayerState, goal: GatherGoal): Course {
  const course: Course = { goal, path: [], pathAge: 0, length: 1, left: 0 };
  repath(world, hero, course);
  const left: number = leftOf(world, hero, goal, course.path);
  return { ...course, length: Math.max(1, left), left };
}

export function followCourse(world: World, hero: PlayerState, course: Course): void {
  course.pathAge += 1;
  if (course.pathAge >= GATHER.repath || course.path.length === 0) repath(world, hero, course);
  else trim(hero, course);
}

export function courseLeft(world: World, hero: PlayerState, course: Course): number {
  return leftOf(world, hero, course.goal, course.path);
}

export function courseObjective(world: World, hero: PlayerState, course: Course): Vec2 | null {
  if (course.goal.kind === 'face') return course.goal.at;
  const point: Vec2 | null = goalPoint(world, course.goal);
  if (point === null) return null;
  if (lineWalkable(world.grid, hero.pos, point)) return { x: point.x, z: point.z };
  return course.path[0] ?? { x: point.x, z: point.z };
}

export function courseProgress(world: World, hero: PlayerState, course: Course): number {
  if (course.goal.kind === 'face') return 1;
  return Math.max(0, Math.min(1, 1 - courseLeft(world, hero, course) / course.length));
}

export function walkingMask(mask: Uint8Array): Uint8Array {
  const walking: Uint8Array = mask.slice();
  for (let choice: number = 1; choice < SKILL_CHOICES; choice += 1) walking[SKILL_START + choice] = 0;
  for (let choice: number = 1; choice < USE_CHOICES; choice += 1) walking[USE_START + choice] = 0;
  walking[SKILL_START] = 1;
  walking[USE_START] = 1;
  return walking;
}

export function gatherContext(world: World, hero: PlayerState, course: Course, timeLeft: number, recall: Recall): ObserveContext {
  return { situation: 'roam', objective: courseObjective(world, hero, course), timeLeft, progress: courseProgress(world, hero, course), recall, pickup: { minRarity: world.content.rarities.length } };
}

export function gatherObserve(world: World, hero: PlayerState, course: Course, timeLeft: number, recall: Recall): Observation {
  followCourse(world, hero, course);
  const seen: Observation = observe(world, gatherContext(world, hero, course, timeLeft, recall), hero);
  noteSeen(recall, world, seenMonsters(seen.view));
  return { ...seen, mask: walkingMask(seen.mask) };
}

export function settledAt(world: World, hero: PlayerState, goal: GatherGoal): boolean {
  if (hero.moving) return false;
  const point: Vec2 | null = goalPoint(world, goal);
  if (point === null) return false;
  switch (goal.kind) {
    case 'spot':
      return gap(hero.pos, point) <= GATHER.arrive;
    case 'meet': {
      const apart: number = gap(hero.pos, point);
      return apart >= GATHER.comfort.min && apart <= GATHER.comfort.max && facingError(hero, point) <= GATHER.facingSlack;
    }
    case 'face':
      return gap(hero.pos, point) <= GATHER.standReach && (goal.at === null || facingError(hero, goal.at) <= GATHER.facingSlack);
  }
  return false;
}

export function holdNeeded(goal: GatherGoal): number {
  return goal.kind === 'face' && goal.at === null ? GATHER.quietHold : GATHER.hold;
}

function aimErrorOf(world: World, hero: PlayerState, goal: GatherGoal): number | null {
  const point: Vec2 | null = goalPoint(world, goal);
  if (point === null) return null;
  if (goal.kind === 'meet') return gap(hero.pos, point) <= GATHER.comfort.max ? facingError(hero, point) : null;
  if (goal.kind === 'face' && goal.at !== null) return gap(hero.pos, point) <= GATHER.standReach ? facingError(hero, goal.at) : null;
  return null;
}

function pickGoal(rng: Rng): GatherGoalKind {
  const weights: readonly number[] = GATHER_GOALS.map((kind: GatherGoalKind): number => GATHER.goalWeights[kind]);
  let roll: number = rng.next() * weights.reduce((sum: number, weight: number): number => sum + weight, 0);
  for (const [index, kind] of GATHER_GOALS.entries()) {
    roll -= weights[index] ?? 0;
    if (roll < 0) return kind;
  }
  return 'spot';
}

function randomSpot(ground: Ground, rng: Rng): Vec2 | null {
  const cell: number | undefined = ground.cells[rng.int(0, ground.cells.length - 1)];
  if (cell === undefined) return null;
  const centre: Vec2 = cellCenter(ground.grid, cell);
  return isWalkable(ground.grid, centre.x, centre.z) ? centre : null;
}

function layoutOnce(world: World, ground: Ground, rng: Rng, kind: GatherGoalKind): Layout | null {
  const start: Vec2 | null = randomSpot(ground, rng);
  if (start === null) return null;
  const angle: number = rng.range(-Math.PI, Math.PI);
  if (kind === 'face') return { start, goal: { x: start.x + Math.sin(angle) * GATHER.layoutGap, z: start.z + Math.cos(angle) * GATHER.layoutGap }, length: 0 };
  const out: number = rng.range(GATHER.leg.min, GATHER.leg.max);
  const goal: Vec2 | null = nearestReached(ground.grid, ground.reach, { x: start.x + Math.sin(angle) * out, z: start.z + Math.cos(angle) * out }, GATHER.spotReach);
  if (goal === null) return null;
  const path: Vec2[] = findPath(world.grid, start, goal);
  const length: number = lengthOf(start, path);
  if (path.length === 0 || length < GATHER.leg.min || length > out * GATHER.detour) return null;
  return { start, goal, length };
}

function pickLayout(world: World, ground: Ground, rng: Rng, kind: GatherGoalKind): Layout | null {
  for (let attempt: number = 0; attempt < GATHER.layoutTries; attempt += 1) {
    const layout: Layout | null = layoutOnce(world, ground, rng, kind);
    if (layout !== null) return layout;
  }
  return null;
}

function facePoint(rng: Rng, start: Vec2, crowd: Crowd): Vec2 | null {
  if (rng.chance(GATHER.faceNone)) return null;
  const person: Bystander | undefined = crowd.bystanders[rng.int(0, Math.max(0, crowd.bystanders.length - 1))];
  if (person !== undefined && rng.chance(GATHER.facePerson)) return { x: person.hero.pos.x, z: person.hero.pos.z };
  const angle: number = rng.range(-Math.PI, Math.PI);
  const out: number = rng.range(GATHER.faceGap.min, GATHER.faceGap.max);
  return { x: start.x + Math.sin(angle) * out, z: start.z + Math.cos(angle) * out };
}

function goalOf(kind: GatherGoalKind, layout: Layout, crowd: Crowd, rng: Rng): GatherGoal | null {
  switch (kind) {
    case 'spot':
      return { kind, at: layout.goal };
    case 'meet':
      return crowd.target === null ? null : { kind, id: crowd.target.id };
    case 'face':
      return { kind, spot: layout.start, at: facePoint(rng, layout.start, crowd) };
  }
  return null;
}

function gatherIn(content: Content, zone: ZoneDef, options: GatherOptions, rng: Rng, level: number): Gather | null {
  const world: World = gatherWorld(content, zone, options.seed);
  readyGatherHero(world, rng, level);
  const hero: PlayerState = world.player;
  const kind: GatherGoalKind = options.goal ?? pickGoal(rng);
  const pace: number = rng.range(GATHER.pace.min, GATHER.pace.max);
  paceHero(hero, pace);
  const layout: Layout | null = pickLayout(world, groundOf(content, zone), rng, kind);
  if (layout === null) return null;
  hero.pos = { x: layout.start.x, z: layout.start.z };
  hero.facing = rng.range(-Math.PI, Math.PI);
  const crowd: Crowd = placeCrowd(world, rng, { start: layout.start, goal: layout.goal, heroPace: pace, count: options.crowd ?? rng.int(GATHER.crowd.min, GATHER.crowd.max), meet: kind === 'meet' });
  const goal: GatherGoal | null = goalOf(kind, layout, crowd, rng);
  if (goal === null) return null;
  world.events = [];
  const course: Course = startCourse(world, hero, goal);
  const timeLimit: number = kind === 'face' ? GATHER.faceTime : GATHER.baseTime + (course.length / pace) * GATHER.timePerStride;
  return { options, world, hero, crowd: crowd.bystanders, zone: zone.id, level, pace, course, recall: createRecall(), timeLimit, start: world.time, tally: { contacts: 0, intrusions: 0, crossings: 0, jitters: 0 }, inside: new Set<number>(), touching: new Set<number>(), turns: [], facing: hero.facing, from: { x: hero.pos.x, z: hero.pos.z }, aimError: aimErrorOf(world, hero, goal), held: 0, outcome: 'running', total: 0, decisions: 0 };
}

function firstZone(zones: readonly ZoneDef[], rng: Rng): number {
  const hideout: number = zones.findIndex((zone: ZoneDef): boolean => zone.id === GATHER.hideout);
  if (hideout >= 0 && rng.chance(GATHER.hideoutShare)) return hideout;
  return zones.length === 0 ? 0 : rng.int(0, zones.length - 1);
}

export function createGather(content: Content, options: GatherOptions): Gather {
  const rng: Rng = createRng(options.seed);
  const level: number = options.level ?? rng.int(ARENA.levels.min, ARENA.levels.max);
  const zones: ZoneDef[] = gatherZones(content).filter((zone: ZoneDef): boolean => options.zone === undefined || zone.id === options.zone);
  const first: number = firstZone(zones, rng);
  for (let turn: number = 0; turn < zones.length; turn += 1) {
    const zone: ZoneDef | undefined = zones[(first + turn) % zones.length];
    const gather: Gather | null = zone === undefined ? null : gatherIn(content, zone, options, rng, level);
    if (gather !== null) return gather;
  }
  throw new Error(`no ${options.zone ?? 'zone'} floor to gather on for seed ${options.seed}`);
}

export function gatherRunning(gather: Gather): boolean {
  return gather.outcome === 'running';
}

export function gatherTimeLeft(gather: Gather): number {
  return Math.max(0, gather.timeLimit - (gather.world.time - gather.start));
}

export function gatherObservation(gather: Gather): Observation {
  return gatherObserve(gather.world, gather.hero, gather.course, gatherTimeLeft(gather), gather.recall);
}

export function isTarget(gather: Gather, other: PlayerState): boolean {
  return gather.course.goal.kind === 'meet' && gather.course.goal.id === other.id;
}

export function roomFor(gather: Gather, other: PlayerState): number {
  return isTarget(gather, other) ? GATHER.comfort.min - gather.hero.radius - other.radius : GATHER.space;
}

function bodyCost(gather: Gather): number {
  const hero: PlayerState = gather.hero;
  let cost: number = 0;
  for (const { hero: other } of gather.crowd) {
    const edge: number = gap(hero.pos, other.pos) - hero.radius - other.radius;
    const room: number = roomFor(gather, other);
    if (edge < room) {
      cost += (GATHER.spaceCost * ((room - edge) / room) ** 2) / RL.ticksPerDecision;
      if (!gather.inside.has(other.id)) gather.tally.intrusions += 1;
      gather.inside.add(other.id);
    }
    else gather.inside.delete(other.id);
    if (edge <= GATHER.contactGap) {
      cost += GATHER.contactCost / RL.ticksPerDecision;
      if (!gather.touching.has(other.id)) gather.tally.contacts += 1;
      gather.touching.add(other.id);
    }
    else gather.touching.delete(other.id);
  }
  return cost;
}

function faces(from: PlayerState, to: PlayerState): boolean {
  return facingError(from, to.pos) <= GATHER.pairCone;
}

export function facingPairs(heroes: readonly PlayerState[]): [PlayerState, PlayerState][] {
  const pairs: [PlayerState, PlayerState][] = [];
  heroes.forEach((first: PlayerState, index: number): void => {
    for (const second of heroes.slice(index + 1)) if (gap(first.pos, second.pos) <= GATHER.pairReach && faces(first, second) && faces(second, first)) pairs.push([first, second]);
  });
  return pairs;
}

function side(a: Vec2, b: Vec2, point: Vec2): number {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
}

export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function crossingCost(gather: Gather): number {
  const heroes: PlayerState[] = gather.crowd.map((bystander: Bystander): PlayerState => bystander.hero);
  let cost: number = 0;
  for (const [first, second] of facingPairs(heroes)) {
    if (!segmentsCross(gather.from, gather.hero.pos, first.pos, second.pos)) continue;
    gather.tally.crossings += 1;
    cost += GATHER.crossCost;
  }
  return cost;
}

function jitterCost(gather: Gather): number {
  const turn: number = turnBetween(gather.facing, gather.hero.facing);
  gather.facing = gather.hero.facing;
  const back: boolean = Math.abs(turn) > GATHER.jitterTurn && gather.turns.some((earlier: number): boolean => Math.abs(earlier) > GATHER.jitterTurn && Math.sign(earlier) !== Math.sign(turn));
  gather.turns.push(turn);
  while (gather.turns.length > GATHER.jitterWindow) gather.turns.shift();
  if (!back) return 0;
  gather.tally.jitters += 1;
  return GATHER.jitterCost;
}

function pay(gather: Gather, amount: number): number {
  gather.total += amount;
  return amount;
}

function towardGoal(gather: Gather): number {
  const { world, hero, course } = gather;
  const left: number = courseLeft(world, hero, course);
  const moved: number = Math.max(-GATHER.progressCap, Math.min(GATHER.progressCap, course.left - left)) * GATHER.progress;
  course.left = left;
  const error: number | null = aimErrorOf(world, hero, course.goal);
  const turned: number = error !== null && gather.aimError !== null ? (gather.aimError - error) * GATHER.turn : 0;
  gather.aimError = error;
  return moved + turned;
}

function settle(gather: Gather): number {
  gather.held = settledAt(gather.world, gather.hero, gather.course.goal) ? gather.held + 1 : 0;
  if (gather.held >= holdNeeded(gather.course.goal)) {
    gather.outcome = 'won';
    return REWARD.win;
  }
  if (gatherTimeLeft(gather) <= 0) gather.outcome = 'timeout';
  return 0;
}

function afterDecision(gather: Gather): number {
  const earned: number = towardGoal(gather) - crossingCost(gather) - jitterCost(gather) + settle(gather);
  gather.from = { x: gather.hero.pos.x, z: gather.hero.pos.z };
  return earned;
}

export function stepGather(gather: Gather, commands: readonly Command[]): GatherStep {
  let reward: number = pay(gather, -REWARD.step);
  const events: WorldEvent[] = [];
  const sent: Command[] = [...commands, ...crowdCommands(gather.world, gather.crowd)];
  paceHero(gather.hero, gather.pace);
  for (let tick: number = 0; tick < RL.ticksPerDecision && gatherRunning(gather); tick += 1) {
    const happened: WorldEvent[] = stepWorld(gather.world, tick === 0 ? sent : [], RL.tick);
    events.push(...happened);
    recallEvents(gather.recall, gather.world, gather.hero, happened);
    reward += pay(gather, -bodyCost(gather));
  }
  if (gatherRunning(gather)) reward += pay(gather, afterDecision(gather));
  gather.decisions += 1;
  return { reward, done: !gatherRunning(gather), events };
}

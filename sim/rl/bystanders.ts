import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import { nearestWalkable } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';
import { createWorld } from '../world/create.ts';
import type { Command, PlayerState, World } from '../world/types.ts';

export const BYSTANDERS = {
  templateSeed: 7919,
  pace: { min: 1, max: 1.8 },
  crossPace: { min: 1.2, max: 2 },
  groupSize: { min: 2, max: 4 },
  groupRadius: { min: 0.85, max: 1.25 },
  onRoute: 0.5,
  groupOff: 3,
  wait: { min: 0.5, max: 2.5 },
  stops: 3,
  wanderReach: 8,
  nearRoute: 2,
  along: { min: 0.2, max: 0.9 },
  crossAlong: { min: 0.25, max: 0.75 },
  crossSide: { min: 4, max: 7 },
  crossSlack: 1,
  bodyGap: 1.15,
  startGap: 1.8,
  placeReach: 1.5,
  arrived: 0.45,
  legTime: 6,
  meetGroup: 0.45,
  meetWander: 0.15,
  meetStops: 1.5,
  weights: { still: 0.25, talk: 0.3, wander: 0.25, cross: 0.2 },
} as const;

export const ERRANDS = ['still', 'talk', 'wander', 'cross'] as const;
export type ErrandKind = (typeof ERRANDS)[number];

export interface Stop {
  readonly at: Vec2;
  readonly wait: number;
}

export type Errand =
  | { readonly kind: 'still' }
  | { readonly kind: 'talk'; readonly centre: Vec2 }
  | { readonly kind: 'wander'; readonly stops: readonly Stop[]; next: number; waitUntil: number }
  | { readonly kind: 'cross'; readonly to: Vec2; readonly at: number; sent: boolean };

export interface Bystander {
  readonly hero: PlayerState;
  readonly errand: Errand;
}

export interface CrowdPlan {
  readonly start: Vec2;
  readonly goal: Vec2;
  readonly heroPace: number;
  readonly count: number;
  readonly meet: boolean;
}

export interface Crowd {
  readonly bystanders: readonly Bystander[];
  readonly target: PlayerState | null;
}

const TEMPLATES: WeakMap<Content, PlayerState> = new WeakMap<Content, PlayerState>();

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function templateOf(content: Content): PlayerState {
  const known: PlayerState | undefined = TEMPLATES.get(content);
  if (known !== undefined) return known;
  const made: PlayerState = createWorld(content, { seed: BYSTANDERS.templateSeed, save: null, opening: false }).player;
  TEMPLATES.set(content, made);
  return made;
}

export function paceHero(hero: PlayerState, pace: number): void {
  if (hero.stats.moveSpeed !== pace) hero.stats = { ...hero.stats, moveSpeed: pace };
}

export function bystanderBody(world: World, pos: Vec2, facing: number, pace: number): PlayerState {
  const body: PlayerState = { ...structuredClone(templateOf(world.content)), id: world.nextId, party: world.player.party, pos: { x: pos.x, z: pos.z }, facing };
  paceHero(body, pace);
  world.nextId += 1;
  world.heroes.push(body);
  return body;
}

function along(plan: CrowdPlan, share: number): Vec2 {
  return { x: plan.start.x + (plan.goal.x - plan.start.x) * share, z: plan.start.z + (plan.goal.z - plan.start.z) * share };
}

function across(plan: CrowdPlan): Vec2 {
  const dx: number = plan.goal.x - plan.start.x;
  const dz: number = plan.goal.z - plan.start.z;
  const length: number = Math.hypot(dx, dz);
  return length <= 0 ? { x: 1, z: 0 } : { x: -dz / length, z: dx / length };
}

function offset(point: Vec2, direction: Vec2, by: number): Vec2 {
  return { x: point.x + direction.x * by, z: point.z + direction.z * by };
}

interface Placing {
  readonly world: World;
  readonly rng: Rng;
  readonly plan: CrowdPlan;
  readonly taken: Vec2[];
  readonly clear: readonly Vec2[];
  readonly placed: Bystander[];
}

function freeSpot(placing: Placing, wanted: Vec2): Vec2 | null {
  const open = (at: Vec2): boolean => placing.taken.every((other: Vec2): boolean => gap(other, at) >= BYSTANDERS.bodyGap) && placing.clear.every((kept: Vec2): boolean => gap(kept, at) >= BYSTANDERS.startGap);
  const found: Vec2 | null = nearestWalkable(placing.world.grid, wanted, BYSTANDERS.placeReach, open);
  return found !== null && open(found) ? found : null;
}

function put(placing: Placing, wanted: Vec2, facing: number, pace: number, errand: Errand): Bystander | null {
  const spot: Vec2 | null = freeSpot(placing, wanted);
  if (spot === null) return null;
  placing.taken.push(spot);
  const placed: Bystander = { hero: bystanderBody(placing.world, spot, facing, pace), errand };
  placing.placed.push(placed);
  return placed;
}

function nearRoute(placing: Placing): Vec2 {
  const { rng, plan } = placing;
  return offset(along(plan, rng.range(BYSTANDERS.along.min, BYSTANDERS.along.max)), across(plan), rng.range(-BYSTANDERS.nearRoute, BYSTANDERS.nearRoute));
}

function placeStill(placing: Placing, at: Vec2): Bystander | null {
  return put(placing, at, placing.rng.range(-Math.PI, Math.PI), BYSTANDERS.pace.min, { kind: 'still' });
}

function placeGroup(placing: Placing, centre: Vec2, size: number, first: number): Bystander[] {
  const radius: number = placing.rng.range(BYSTANDERS.groupRadius.min, BYSTANDERS.groupRadius.max);
  const members: Bystander[] = [];
  for (let index: number = 0; index < size; index += 1) {
    const angle: number = first + (index * Math.PI * 2) / size;
    const at: Vec2 = { x: centre.x + Math.sin(angle) * radius, z: centre.z + Math.cos(angle) * radius };
    const member: Bystander | null = put(placing, at, 0, BYSTANDERS.pace.min, { kind: 'talk', centre });
    if (member === null) continue;
    member.hero.facing = facingOf({ x: centre.x - member.hero.pos.x, z: centre.z - member.hero.pos.z });
    members.push(member);
  }
  return members;
}

function groupCentre(placing: Placing): Vec2 {
  const { rng, plan } = placing;
  const on: Vec2 = along(plan, rng.range(0.3, 0.7));
  return rng.chance(BYSTANDERS.onRoute) ? on : offset(on, across(plan), rng.range(-BYSTANDERS.groupOff, BYSTANDERS.groupOff));
}

function stopsAround(placing: Placing, around: () => Vec2): Stop[] {
  const stops: Stop[] = [];
  for (let index: number = 0; index < BYSTANDERS.stops; index += 1) {
    const at: Vec2 | null = nearestWalkable(placing.world.grid, around(), BYSTANDERS.placeReach);
    if (at !== null) stops.push({ at, wait: placing.rng.range(BYSTANDERS.wait.min, BYSTANDERS.wait.max) });
  }
  return stops;
}

function placeWanderer(placing: Placing, home: Vec2, reach: number): Bystander | null {
  const { rng } = placing;
  const stops: Stop[] = stopsAround(placing, (): Vec2 => ({ x: home.x + rng.range(-reach, reach), z: home.z + rng.range(-reach, reach) }));
  if (stops.length < 2) return placeStill(placing, home);
  return put(placing, home, rng.range(-Math.PI, Math.PI), rng.range(BYSTANDERS.pace.min, BYSTANDERS.pace.max), { kind: 'wander', stops, next: 0, waitUntil: placing.world.time + rng.range(0, BYSTANDERS.wait.max) });
}

function placeCrosser(placing: Placing): Bystander | null {
  const { rng, plan, world } = placing;
  const share: number = rng.range(BYSTANDERS.crossAlong.min, BYSTANDERS.crossAlong.max);
  const middle: Vec2 = along(plan, share);
  const side: number = (rng.chance(0.5) ? 1 : -1) * rng.range(BYSTANDERS.crossSide.min, BYSTANDERS.crossSide.max);
  const sideways: Vec2 = across(plan);
  const to: Vec2 | null = nearestWalkable(world.grid, offset(middle, sideways, -side), BYSTANDERS.placeReach);
  if (to === null) return null;
  const pace: number = rng.range(BYSTANDERS.crossPace.min, BYSTANDERS.crossPace.max);
  const heroThere: number = (gap(plan.start, plan.goal) * share) / Math.max(0.1, plan.heroPace);
  const at: number = world.time + Math.max(0, heroThere - Math.abs(side) / pace + rng.range(-BYSTANDERS.crossSlack, BYSTANDERS.crossSlack));
  const from: Vec2 = offset(middle, sideways, side);
  return put(placing, from, facingOf({ x: to.x - from.x, z: to.z - from.z }), pace, { kind: 'cross', to, at, sent: false });
}

function errandOf(rng: Rng): ErrandKind {
  const weights: readonly number[] = ERRANDS.map((kind: ErrandKind): number => BYSTANDERS.weights[kind]);
  let roll: number = rng.next() * weights.reduce((sum: number, weight: number): number => sum + weight, 0);
  for (const [index, kind] of ERRANDS.entries()) {
    roll -= weights[index] ?? 0;
    if (roll < 0) return kind;
  }
  return 'still';
}

function placeTarget(placing: Placing): PlayerState | null {
  const { rng, plan } = placing;
  const roll: number = rng.next();
  if (roll < BYSTANDERS.meetGroup) {
    const away: number = rng.range(-Math.PI, Math.PI);
    const radius: number = (BYSTANDERS.groupRadius.min + BYSTANDERS.groupRadius.max) / 2;
    const centre: Vec2 = { x: plan.goal.x + Math.sin(away) * radius, z: plan.goal.z + Math.cos(away) * radius };
    const members: Bystander[] = placeGroup(placing, centre, Math.max(1, Math.min(plan.count, rng.int(BYSTANDERS.groupSize.min, BYSTANDERS.groupSize.max))), away + Math.PI);
    return members[0]?.hero ?? null;
  }
  if (roll < BYSTANDERS.meetGroup + BYSTANDERS.meetWander) return placeWanderer(placing, plan.goal, BYSTANDERS.meetStops)?.hero ?? null;
  return placeStill(placing, plan.goal)?.hero ?? null;
}

export function placeCrowd(world: World, rng: Rng, plan: CrowdPlan): Crowd {
  const placing: Placing = { world, rng, plan, taken: [], clear: plan.meet ? [plan.start] : [plan.start, plan.goal], placed: [] };
  const target: PlayerState | null = plan.meet ? placeTarget(placing) : null;
  for (let attempt: number = 0; placing.placed.length < plan.count && attempt < plan.count * 2; attempt += 1) {
    const left: number = plan.count - placing.placed.length;
    const kind: ErrandKind = errandOf(rng);
    if (kind === 'still') placeStill(placing, nearRoute(placing));
    else if (kind === 'talk') placeGroup(placing, groupCentre(placing), Math.min(left, rng.int(BYSTANDERS.groupSize.min, BYSTANDERS.groupSize.max)), rng.range(-Math.PI, Math.PI));
    else if (kind === 'wander') placeWanderer(placing, nearRoute(placing), BYSTANDERS.wanderReach);
    else placeCrosser(placing);
  }
  return { bystanders: placing.placed, target };
}

function moveTo(hero: PlayerState, to: Vec2): Command {
  return { type: 'move', held: false, dest: { x: to.x, z: to.z }, by: hero.id };
}

function wanderCommands(world: World, hero: PlayerState, errand: Extract<Errand, { kind: 'wander' }>): Command[] {
  const stop: Stop | undefined = errand.stops[errand.next];
  if (stop === undefined || world.time < errand.waitUntil) return [];
  if (gap(hero.pos, stop.at) <= BYSTANDERS.arrived || world.time >= errand.waitUntil + BYSTANDERS.legTime) {
    errand.next = (errand.next + 1) % errand.stops.length;
    errand.waitUntil = world.time + stop.wait;
    return [];
  }
  return hero.intent.type === 'idle' || hero.path.length === 0 ? [moveTo(hero, stop.at)] : [];
}

function errandCommands(world: World, bystander: Bystander): Command[] {
  const errand: Errand = bystander.errand;
  switch (errand.kind) {
    case 'still':
    case 'talk':
      return [];
    case 'wander':
      return wanderCommands(world, bystander.hero, errand);
    case 'cross':
      if (errand.sent || world.time < errand.at) return [];
      errand.sent = true;
      return [moveTo(bystander.hero, errand.to)];
  }
  return [];
}

export function crowdCommands(world: World, bystanders: readonly Bystander[]): Command[] {
  return bystanders.flatMap((bystander: Bystander): Command[] => errandCommands(world, bystander));
}

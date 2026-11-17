import type { Bot } from '../sim/bot.ts';
import { botFight, botPlay, botStep, botWalkTo, createBot } from '../sim/bot.ts';
import type { PointGrant, ZoneDef, ZonePack } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { distance } from '../sim/math.ts';
import type { NavGrid } from '../sim/nav/grid.ts';
import { cellCenter, cellIndex, nearestWalkable } from '../sim/nav/grid.ts';
import { createWorld } from '../sim/world/create.ts';
import { waiting } from '../sim/world/packs.ts';
import type { PackTimer } from '../sim/world/pack-return.ts';
import type { FlaskState, MonsterState, PlayerState, World, WorldEvent } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';
import { addToInventory, equipFromInventory, grantXp, refreshPlayer } from '../sim/world/character.ts';
import { createRng } from '../sim/rng.ts';
import { WEAPON_KINDS } from '../sim/content/item-types.ts';
import type { ArmPlan, GearModel } from './act-scaling.ts';
import { ACT_SCALING, typicalGear } from './act-scaling.ts';
import { makeItem } from '../sim/world/ledger.ts';
import { xpToNextLevel } from '../sim/progression.ts';
import type { ItemInstance } from '../sim/world/types.ts';
import type { BuildPolicy, Policies, SkillPolicy } from './simulate-policies.ts';
import { planFor } from './simulate-policies.ts';
import { CONTENT, farm, playOpening } from './simulate-run.ts';

export const CAVE = {
  climbMinutes: 150,
  leg: 16,
  legArrive: 2,
  engage: 7,
  farEnd: 14,
  skipFor: 60,
  lootReach: 6,
  deathReach: 16,
  hurtWindow: 6,
  hurtKeep: 64,
  calm: 14,
  shunFor: 180,
  shunReach: 24,
  throughMinutes: 30,
  gearRarity: 'stormtouched',
  lowLife: 0.35,
} as const;

export const REFILL_AT: Readonly<Record<string, number>> = { careful: 0.9, average: 0.6, poor: 0.25 };

export interface CaveJob {
  readonly zone: string;
  readonly through: readonly string[];
  readonly raise: number;
  readonly gear: readonly string[];
  readonly dress?: boolean;
  readonly arm?: readonly string[];
  readonly gearModel?: GearModel;
  readonly untilClear?: boolean;
  readonly fresh?: boolean;
  readonly enterLevel: number;
  readonly minutes: number;
  readonly skill: string;
  readonly build: string;
  readonly seed: number;
}

export interface CaveFight {
  readonly rank: string;
  readonly level: number;
  readonly lost: boolean;
  readonly seconds: number;
}

export interface CaveDeath {
  readonly heroLevel: number;
  readonly foeLevel: number;
  readonly foes: number;
  readonly packs: number;
  readonly killer: string;
  readonly mods: readonly string[];
  readonly at: Vec2;
  readonly minute: number;
  readonly flasks: number;
}

export interface CaveRun {
  readonly job: CaveJob;
  readonly entered: boolean;
  readonly enteredAtLevel: number;
  readonly levelMinutes: Readonly<Record<string, number>>;
  readonly deaths: number;
  readonly kills: number;
  readonly minutes: number;
  readonly farEndMinutes: number | null;
  readonly clearMinutes: number | null;
  readonly lowMinutes: number;
  readonly fights: readonly CaveFight[];
  readonly deathsAt: readonly CaveDeath[];
}

interface OpenFight {
  readonly rank: string;
  readonly level: number;
  readonly members: readonly number[];
  readonly at: number;
}

interface Hurt {
  readonly at: number;
  readonly sourceId: number;
}

interface Tally {
  start: number;
  deaths: number;
  kills: number;
  seen: number;
  low: number;
  readonly levelMinutes: Record<string, number>;
  readonly open: Map<number, OpenFight>;
  readonly fights: CaveFight[];
  readonly deathsAt: CaveDeath[];
  readonly hurt: Hurt[];
}

export function walkDistances(grid: NavGrid, from: Vec2): Int32Array {
  const far: Int32Array = new Int32Array(grid.columns * grid.rows).fill(-1);
  const start: Vec2 | null = nearestWalkable(grid, from, 3);
  const first: number = start === null ? -1 : cellIndex(grid, start.x, start.z);
  if (first < 0) return far;
  far[first] = 0;
  const queue: number[] = [first];
  for (let head: number = 0; head < queue.length; head += 1) {
    const cell: number = queue[head] ?? 0;
    const column: number = cell % grid.columns;
    const row: number = Math.floor(cell / grid.columns);
    const steps: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dc, dr] of steps) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
      const next: number = r * grid.columns + c;
      if (grid.walkable[next] !== 1 || far[next] !== -1) continue;
      far[next] = (far[cell] ?? 0) + 1;
      queue.push(next);
    }
  }
  return far;
}

export function walkFrom(grid: NavGrid, field: Int32Array, point: Vec2): number {
  const index: number = cellIndex(grid, point.x, point.z);
  return index < 0 ? -1 : (field[index] ?? -1);
}

export function routeBack(grid: NavGrid, field: Int32Array, to: Vec2, spacing: number): Vec2[] {
  const near: Vec2 | null = nearestWalkable(grid, to, 3);
  let cell: number = near === null ? -1 : cellIndex(grid, near.x, near.z);
  if (cell < 0 || (field[cell] ?? -1) < 0) return [];
  const legs: Vec2[] = [cellCenter(grid, cell)];
  let since: number = 0;
  while ((field[cell] ?? 0) > 0) {
    const column: number = cell % grid.columns;
    const row: number = Math.floor(cell / grid.columns);
    const candidates: number[] = [cell + 1, cell - 1, cell + grid.columns, cell - grid.columns].filter((next: number): boolean => next >= 0 && next < field.length && Math.abs((next % grid.columns) - column) + Math.abs(Math.floor(next / grid.columns) - row) === 1);
    const next: number | undefined = candidates.find((candidate: number): boolean => (field[candidate] ?? -1) === (field[cell] ?? 0) - 1);
    if (next === undefined) break;
    cell = next;
    since += 1;
    if (since >= spacing) {
      legs.unshift(cellCenter(grid, cell));
      since = 0;
    }
  }
  return legs;
}

export function farthestPoint(grid: NavGrid, field: Int32Array): Vec2 {
  let best: number = 0;
  field.forEach((steps: number, index: number): void => {
    if (steps > (field[best] ?? -1)) best = index;
  });
  return cellCenter(grid, best);
}

function rankOf(monsters: readonly MonsterState[]): string {
  const ranks: readonly string[] = ['rare', 'magic'];
  return ranks.find((rank: string): boolean => monsters.some((monster: MonsterState): boolean => monster.def.rank?.id === rank)) ?? 'normal';
}

export function modsNear(near: readonly MonsterState[]): string[] {
  return [...new Set<string>(near.flatMap((monster: MonsterState): readonly string[] => monster.def.mods))].toSorted();
}

function watch(world: World, tally: Tally, events: readonly WorldEvent[], ignored: Map<number, number>): void {
  const player: PlayerState = world.player;
  if (player.alive && player.life < player.maxLife * CAVE.lowLife) tally.low += Math.max(0, world.time - tally.seen);
  tally.seen = world.time;
  for (const event of events) {
    if (event.type === 'level_up' && tally.levelMinutes[String(event.level)] === undefined) tally.levelMinutes[String(event.level)] = (world.time - tally.start) / 60;
    if (event.type === 'death' && event.team === 'player') {
      tally.deaths += 1;
      const recent: Set<number> = new Set<number>(tally.hurt.filter((hit: Hurt): boolean => hit.at >= world.time - CAVE.hurtWindow).map((hit: Hurt): number => hit.sourceId));
      const near: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => recent.has(monster.id) || (monster.alive && distance(monster.pos, world.player.pos) <= CAVE.deathReach));
      tally.deathsAt.push({ heroLevel: world.player.level, foeLevel: Math.max(0, ...near.map((monster: MonsterState): number => monster.level)), foes: near.length, packs: new Set<number>(near.map((monster: MonsterState): number => monster.packId)).size, killer: `${world.death?.killer ?? 'unknown'} / ${world.death?.skill ?? 'unknown'}`, mods: modsNear(near), at: { x: Math.round(world.player.pos.x), z: Math.round(world.player.pos.z) }, minute: (world.time - tally.start) / 60, flasks: world.player.flasks.filter((flask: FlaskState): boolean => flask.def.resource === 'life').reduce((sum: number, flask: FlaskState): number => sum + Math.floor(flask.charges / Math.max(1, flask.def.chargesPerUse)), 0) });
      tally.hurt.length = 0;
      for (const fight of tally.open.values()) tally.fights.push({ rank: fight.rank, level: fight.level, lost: true, seconds: world.time - fight.at });
      tally.open.clear();
    }
    if (event.type === 'death' && event.team !== 'player') tally.kills += 1;
    if (event.type === 'damage' && event.targetTeam === 'player') {
      tally.hurt.push({ at: world.time, sourceId: event.sourceId });
      if (tally.hurt.length > CAVE.hurtKeep) tally.hurt.splice(0, tally.hurt.length - CAVE.hurtKeep);
      ignored.delete(event.sourceId);
    }
    if (event.type === 'aggro') {
      const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
      if (monster === undefined || tally.open.has(monster.packId)) continue;
      const pack: MonsterState[] = world.monsters.filter((candidate: MonsterState): boolean => candidate.packId === monster.packId);
      tally.open.set(monster.packId, { rank: rankOf(pack), level: monster.level, members: pack.map((member: MonsterState): number => member.id), at: world.time });
    }
  }
  for (const [packId, fight] of tally.open) {
    if (world.monsters.some((monster: MonsterState): boolean => monster.alive && fight.members.includes(monster.id))) continue;
    tally.fights.push({ rank: fight.rank, level: fight.level, lost: false, seconds: world.time - fight.at });
    tally.open.delete(packId);
  }
}

function packOf(world: World, monster: MonsterState): ZonePack | null {
  return world.packReturns.find((timer: PackTimer): boolean => timer.packId === monster.packId)?.pack ?? null;
}

function markCleared(world: World, cleared: Set<ZonePack>): void {
  const standing: Set<ZonePack | null> = new Set<ZonePack | null>(world.monsters.filter((monster: MonsterState): boolean => monster.alive).map((monster: MonsterState): ZonePack | null => packOf(world, monster)));
  for (const pack of world.spawnedPacks) if (!standing.has(pack)) cleared.add(pack);
}

function spots(world: World, cleared: ReadonlySet<ZonePack> | null): Vec2[] {
  const fresh = (pack: ZonePack | null): boolean => cleared === null || pack === null || !cleared.has(pack);
  return [...world.monsters.filter((monster: MonsterState): boolean => monster.alive && fresh(packOf(world, monster))).map((monster: MonsterState): Vec2 => monster.pos), ...world.zone.packs.filter((pack: ZonePack): boolean => waiting(world, pack) && fresh(pack))];
}

function shunned(world: World, deaths: readonly CaveDeath[], start: number, pos: Vec2): boolean {
  return deaths.some((death: CaveDeath): boolean => start + death.minute * 60 >= world.time - CAVE.shunFor && distance(death.at, pos) <= CAVE.shunReach);
}

function pick(world: World, cleared: ReadonlySet<ZonePack> | null, skipped: ReadonlyMap<string, number>, tally: Tally): Vec2 | null {
  const here: Int32Array = walkDistances(world.grid, world.player.pos);
  let best: Vec2 | null = null;
  let bestSteps: number = Infinity;
  for (const pos of spots(world, cleared)) {
    if ((skipped.get(`${Math.round(pos.x)},${Math.round(pos.z)}`) ?? -Infinity) > world.time) continue;
    const walk: number = walkFrom(world.grid, here, pos);
    const steps: number = walk + (shunned(world, tally.deathsAt, tally.start, pos) ? world.grid.columns * world.grid.rows : 0);
    if (walk < 0 || steps >= bestSteps) continue;
    best = pos;
    bestSteps = steps;
  }
  return best;
}

function dry(world: World, below: number, fallen: boolean): boolean {
  const player: PlayerState = world.player;
  if (!fallen && player.life >= player.maxLife * below) return false;
  if (!player.flasks.every((flask: FlaskState): boolean => flask.def.resource !== 'life' || flask.charges < flask.def.chargesPerUse)) return false;
  return !hunted(world);
}

function hunted(world: World): boolean {
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.aggro && distance(monster.pos, world.player.pos) <= CAVE.calm);
}

function refill(bot: Bot, zone: ZoneDef): void {
  const waypoint: Vec2 | null = zone.waypoint;
  if (waypoint === null) return;
  goTo(bot, zone.id, waypoint);
  botWalkTo(bot, zone.id, waypoint, 0.5);
  botStep(bot, []);
}

function goTo(bot: Bot, zone: string, target: Vec2): boolean {
  const world: World = bot.world;
  const field: Int32Array = walkDistances(world.grid, world.player.pos);
  for (const leg of routeBack(world.grid, field, target, CAVE.leg / world.grid.cellSize)) {
    if (distance(world.player.pos, target) <= CAVE.engage || hunted(world)) return true;
    if (!botWalkTo(bot, zone, leg, CAVE.legArrive)) return false;
  }
  return hunted(world) || distance(world.player.pos, target) <= CAVE.engage + CAVE.legArrive;
}

interface Sweep {
  readonly zone: ZoneDef;
  readonly tally: Tally;
  readonly skill: string;
  readonly stopWhenClear: boolean;
}

interface Swept {
  readonly farEndMinutes: number | null;
  readonly clearMinutes: number | null;
}

function sweepZone(bot: Bot, sweep: Sweep, until: number): Swept {
  const world: World = bot.world;
  const { zone, tally } = sweep;
  enterZone(world, zone, { type: 'start' });
  tally.start = world.time;
  tally.seen = world.time;
  const end: Vec2 = farthestPoint(world.grid, walkDistances(world.grid, zone.playerStart));
  const cleared: Set<ZonePack> = new Set<ZonePack>();
  let farEndMinutes: number | null = null;
  let refilledAt: number = 0;
  const skipped: Map<string, number> = new Map<string, number>();
  while (world.time < until) {
    if (world.zone.id !== zone.id) enterZone(world, zone, { type: 'start' });
    if (!world.player.alive) {
      botStep(bot, []);
      continue;
    }
    markCleared(world, cleared);
    const fallen: boolean = tally.deaths > refilledAt;
    if (dry(world, REFILL_AT[sweep.skill] ?? 0, fallen)) {
      refill(bot, zone);
      refilledAt = tally.deaths;
      continue;
    }
    if (fallen) refilledAt = tally.deaths;
    if (farEndMinutes === null && distance(world.player.pos, end) <= CAVE.farEnd) farEndMinutes = (world.time - tally.start) / 60;
    const first: boolean = farEndMinutes === null;
    const target: Vec2 | null = pick(world, first ? cleared : null, skipped, tally) ?? (first ? end : null);
    if (target === null) {
      if (!first && sweep.stopWhenClear) return { farEndMinutes, clearMinutes: (world.time - tally.start) / 60 };
      botStep(bot, []);
      continue;
    }
    if (!goTo(bot, zone.id, target)) {
      skipped.set(`${Math.round(target.x)},${Math.round(target.z)}`, world.time + CAVE.skipFor);
      continue;
    }
    botFight(bot, (): boolean => false, null);
  }
  return { farEndMinutes, clearMinutes: null };
}

function emptyTally(): Tally {
  return { start: 0, deaths: 0, kills: 0, seen: 0, low: 0, levelMinutes: {}, open: new Map<number, OpenFight>(), fights: [], deathsAt: [], hurt: [] };
}

function raiseTo(world: World, level: number): void {
  while (world.player.level < Math.min(level, world.content.player.xp.maxLevel)) grantXp(world, xpToNextLevel(world.content.player.xp, world.player.level) - world.player.xp);
}

function wear(world: World, bases: readonly string[]): void {
  for (const base of bases) {
    const item: ItemInstance | null = makeItem(world, world.player.level, base, CAVE.gearRarity, { kind: 'start', base });
    if (item === null || !addToInventory(world, item)) throw new Error(`cannot give ${base}`);
    equipFromInventory(world, world.player.inventory.indexOf(item));
    if (!Object.values(world.player.equipped).includes(item)) throw new Error(`${base} could not be worn`);
  }
}

export function dressHero(world: World, build: BuildPolicy, seed: number, arm: readonly string[] = [], model: GearModel = ACT_SCALING.gear): void {
  const strange: string | undefined = arm.find((kind: string): boolean => !WEAPON_KINDS.some((known: string): boolean => known === kind));
  if (strange !== undefined) throw new Error(`no weapon kind ${strange}; the kinds are ${WEAPON_KINDS.join(', ')}`);
  const held: string | null = world.player.equipped.weapon === null ? null : (world.content.itemBases.get(world.player.equipped.weapon.base)?.weaponKind ?? null);
  const kinds: string[] = arm.length > 0 ? [...arm] : held === null ? [...WEAPON_KINDS] : [held];
  const plan: ArmPlan = { arm: { name: build.name, build: build.name, kinds }, weights: build.weights, focus: build.focus, route: world.player.allocated };
  world.player.equipped = typicalGear(world.content, plan, world.player.level, createRng(seed), model);
  refreshPlayer(world);
  world.player.life = world.player.maxLife;
}

export function runCave(job: CaveJob, policies: Policies): CaveRun {
  const skill: SkillPolicy | undefined = policies.skills.get(job.skill);
  const build: BuildPolicy | undefined = policies.builds.get(job.build);
  const zone: ZoneDef | undefined = CONTENT.zones.get(job.zone);
  const through: (ZoneDef | undefined)[] = job.through.map((id: string): ZoneDef | undefined => CONTENT.zones.get(id));
  if (skill === undefined || build === undefined || zone === undefined || through.includes(undefined)) throw new Error(`no policy ${job.skill}/${job.build} or zone ${[job.zone, ...job.through].join(', ')}`);
  const world: World = createWorld(CONTENT, build.hero === null ? { seed: job.seed, save: null, opening: true } : { seed: job.seed, save: null, opening: true, hero: build.hero });
  const tally: Tally = emptyTally();
  let inside: boolean = false;
  const ignored: Map<number, number>[] = [];
  const bot: Bot = createBot(world, skill.habits, (events: readonly WorldEvent[]): void => {
    const map: Map<number, number> | undefined = ignored[0];
    if (inside && map !== undefined) watch(world, tally, events, map);
  }, planFor(skill, build));
  ignored.push(bot.ignored);
  const empty = (entered: boolean): CaveRun => ({ job, entered, enteredAtLevel: world.player.level, levelMinutes: {}, deaths: 0, kills: 0, minutes: 0, farEndMinutes: null, clearMinutes: null, lowMinutes: 0, fights: [], deathsAt: [] });
  if (job.fresh === true) {
    world.player.skillPoints += world.content.chart.grants.reduce((sum: number, grant: PointGrant): number => sum + grant.points, 0);
  } else {
    if (!playOpening(bot, skill)) return empty(false);
    botPlay(bot);
    farm(bot, world.time + CAVE.climbMinutes * 60, skill.loot, (): boolean => world.player.level >= job.enterLevel);
    for (const before of through) if (before !== undefined) sweepZone(bot, { zone: before, tally: emptyTally(), skill: job.skill, stopWhenClear: true }, world.time + CAVE.throughMinutes * 60);
  }
  raiseTo(world, job.raise);
  if (job.dress === true) dressHero(world, build, job.seed, job.arm ?? [], job.gearModel ?? ACT_SCALING.gear);
  wear(world, job.gear);
  const enteredAtLevel: number = world.player.level;
  inside = true;
  const swept: Swept = sweepZone(bot, { zone, tally, skill: job.skill, stopWhenClear: job.untilClear === true }, world.time + job.minutes * 60);
  return { job, entered: true, enteredAtLevel, levelMinutes: tally.levelMinutes, deaths: tally.deaths, kills: tally.kills, minutes: (world.time - tally.start) / 60, farEndMinutes: swept.farEndMinutes, clearMinutes: swept.clearMinutes, lowMinutes: tally.low / 60, fights: tally.fights, deathsAt: tally.deathsAt };
}

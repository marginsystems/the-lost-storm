import type { MomentDef, MomentEcho, MomentField, MomentLibrary, StrikeArea, WeightedMoment } from '../content/moment-types.ts';
import type { MonsterDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, distance } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { pickWeighted } from '../rng.ts';
import { dropOnGround } from './ground.ts';
import { monsterLevel, spawnMonster } from './spawn.ts';
import type { ItemInstance, MomentFigure, MomentOutcome, MomentState, MonsterState, World } from './types.ts';

export const MOMENTS = {
  placementTries: 14,
  startLifeMin: 0.35,
  startLifeMax: 1,
} as const;

const NO_LOOT = { goldChance: 0, goldMin: 0, goldMax: 0, itemChance: 0 } as const;

function fieldOf(world: World): MomentField | null {
  return world.zone.moments;
}

function live(world: World): number {
  return world.moments.filter((moment: MomentState): boolean => moment.phase !== 'fading').length;
}

function nextInterval(world: World, field: MomentField): number {
  return world.rng.range(field.interval.min, field.interval.max);
}

function figuresOf(def: MomentDef, centre: Vec2): MomentFigure[] {
  return def.echoes.map((entry: MomentEcho, index: number): MomentFigure => ({ echo: index, pos: { x: centre.x + entry.x, z: centre.z + entry.z }, facing: entry.facingDegrees * DEGREES_TO_RADIANS, turned: false, monsterId: null }));
}

function begin(world: World, def: MomentDef, pos: Vec2, combat: boolean, mark: boolean): MomentState {
  const library: MomentLibrary = world.content.moments;
  const moment: MomentState = {
    id: world.nextId,
    def,
    combat,
    level: monsterLevel(world),
    pos: { x: pos.x, z: pos.z },
    phase: mark ? 'mark' : 'dormant',
    timeLeft: mark ? library.telegraph : def.lifetime * world.rng.range(MOMENTS.startLifeMin, MOMENTS.startLifeMax),
    phaseTime: 0,
    armed: distance(world.player.pos, pos) >= def.radius,
    outcome: null,
    figures: figuresOf(def, pos),
  };
  world.nextId += 1;
  world.moments.push(moment);
  if (mark) world.events.push({ type: 'moment_mark', moment });
  return moment;
}

function pickArea(world: World, areas: readonly StrikeArea[]): StrikeArea | null {
  return pickWeighted(world.rng, areas.map((area: StrikeArea): StrikeArea & { readonly weight: number } => ({ ...area, weight: area.radius * area.radius })));
}

function pointIn(world: World, area: StrikeArea): Vec2 {
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = area.radius * Math.sqrt(world.rng.next());
  return { x: area.x + world.shift.x + Math.cos(angle) * reach, z: area.z + world.shift.z + Math.sin(angle) * reach };
}

function clear(world: World, field: MomentField, def: MomentDef, pos: Vec2): boolean {
  if (!isWalkable(world.grid, pos.x, pos.z)) return false;
  if (distance(world.player.pos, pos) < def.radius + field.clearance.hero) return false;
  if (world.zone.exits.some((exit): boolean => distance(exit, pos) < def.radius + field.clearance.exits)) return false;
  return world.moments.every((other: MomentState): boolean => distance(other.pos, pos) >= def.radius + other.def.radius + field.clearance.between);
}

function pickDef(world: World, field: MomentField): MomentDef | null {
  const entry: WeightedMoment | null = pickWeighted(world.rng, field.table);
  return entry === null ? null : (world.content.moments.defs.get(entry.moment) ?? null);
}

function place(world: World, field: MomentField, mark: boolean): MomentState | null {
  const def: MomentDef | null = pickDef(world, field);
  if (def === null) return null;
  for (let attempt: number = 0; attempt < MOMENTS.placementTries; attempt += 1) {
    const area: StrikeArea | null = pickArea(world, field.areas);
    if (area === null) return null;
    const pos: Vec2 = pointIn(world, area);
    if (clear(world, field, def, pos)) return begin(world, def, pos, field.combat, mark);
  }
  return null;
}

function echoDef(world: World, entry: MomentEcho): MonsterDef | null {
  const base: MonsterDef | undefined = world.content.monsters.get(entry.monster);
  if (base === undefined) return null;
  const echo: MonsterDef = { ...base, faction: world.content.moments.faction, loot: NO_LOOT, summon: null, boss: null };
  return entry.look === null ? echo : { ...echo, rig: entry.look.rig, scale: entry.look.scale, gear: entry.look.gear, wear: entry.look.wear };
}

function turn(world: World, moment: MomentState): number[] {
  if (!moment.combat) return [];
  const packId: number = world.nextPackId;
  world.nextPackId += 1;
  const turned: number[] = [];
  for (const figure of moment.figures) {
    const entry: MomentEcho | undefined = moment.def.echoes[figure.echo];
    if (entry === undefined || !entry.turns || !world.rng.chance(moment.def.turnChance)) continue;
    const def: MonsterDef | null = echoDef(world, entry);
    if (def === null) continue;
    const monster: MonsterState = spawnMonster(world, def, packId, figure.pos, { summonerId: null, scatter: 0, revived: false });
    monster.facing = figure.facing;
    monster.aggro = true;
    monster.foeId = world.player.id;
    world.events.push({ type: 'aggro', monsterId: monster.id });
    figure.turned = true;
    figure.monsterId = monster.id;
    turned.push(monster.id);
  }
  return turned;
}

function wake(world: World, moment: MomentState): void {
  moment.phase = 'awake';
  moment.timeLeft = moment.def.awake;
  moment.phaseTime = 0;
  world.events.push({ type: 'moment_woke', moment, turned: turn(world, moment) });
}

function echoMonsters(world: World, moment: MomentState): MonsterState[] {
  const ids: Set<number> = new Set<number>(moment.figures.flatMap((figure: MomentFigure): number[] => (figure.monsterId === null ? [] : [figure.monsterId])));
  return world.monsters.filter((monster: MonsterState): boolean => ids.has(monster.id));
}

function removeEchoes(world: World, moment: MomentState, onlyLiving: boolean): void {
  const gone: Set<number> = new Set<number>(echoMonsters(world, moment).filter((monster: MonsterState): boolean => !onlyLiving || monster.alive).map((monster: MonsterState): number => monster.id));
  if (gone.size === 0) return;
  for (const id of gone) world.events.push({ type: 'monster_remove', monsterId: id });
  world.monsters = world.monsters.filter((monster: MonsterState): boolean => !gone.has(monster.id));
}

function reward(world: World, moment: MomentState): void {
  const table = moment.def.reward;
  const scale: number = (1 + world.content.world.scaling.xpPerLevel * (moment.level - 1)) * (1 + world.player.stats.goldFind);
  const gold: number = Math.round(world.rng.int(table.goldMin, table.goldMax) * scale);
  if (gold > 0) dropOnGround(world, moment.pos, { kind: 'gold', amount: gold });
  for (let index: number = 0; index < table.items; index += 1) {
    if (!world.rng.chance(table.itemChance)) continue;
    const item: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, moment.level, null, table.rarity);
    if (item === null) continue;
    world.nextItemUid += 1;
    dropOnGround(world, moment.pos, { kind: 'item', item });
  }
}

function end(world: World, moment: MomentState, outcome: MomentOutcome): void {
  if (outcome === 'resolved') reward(world, moment);
  removeEchoes(world, moment, true);
  moment.phase = 'fading';
  moment.outcome = outcome;
  moment.timeLeft = world.content.moments.fade;
  moment.phaseTime = 0;
  world.events.push({ type: 'moment_ended', moment, outcome });
}

function stepAwake(world: World, moment: MomentState): void {
  const turned: boolean = moment.figures.some((figure: MomentFigure): boolean => figure.turned);
  if (turned && echoMonsters(world, moment).every((monster: MonsterState): boolean => !monster.alive)) {
    end(world, moment, 'resolved');
    return;
  }
  if (moment.timeLeft <= 0) end(world, moment, turned ? 'expired' : 'played');
}

function stepMoment(world: World, moment: MomentState, dt: number): boolean {
  moment.timeLeft -= dt;
  moment.phaseTime += dt;
  const inside: boolean = world.player.alive && distance(world.player.pos, moment.pos) < moment.def.radius;
  switch (moment.phase) {
    case 'mark':
      if (moment.timeLeft > 0) return true;
      moment.phase = 'dormant';
      moment.timeLeft = moment.def.lifetime;
      moment.phaseTime = 0;
      moment.armed = !inside;
      world.events.push({ type: 'moment_strike', moment });
      return true;
    case 'dormant':
      if (!inside) moment.armed = true;
      if (inside && moment.armed) wake(world, moment);
      else if (moment.timeLeft <= 0) end(world, moment, 'faded');
      return true;
    case 'awake':
      stepAwake(world, moment);
      return true;
    case 'fading':
      if (moment.timeLeft > 0) return true;
      removeEchoes(world, moment, false);
      world.events.push({ type: 'moment_gone', momentId: moment.id });
      return false;
  }
  return true;
}

export function stepMoments(world: World, dt: number): void {
  world.moments = world.moments.filter((moment: MomentState): boolean => stepMoment(world, moment, dt));
  const field: MomentField | null = fieldOf(world);
  if (field === null || live(world) >= field.max) return;
  world.strikeTimer -= dt;
  if (world.strikeTimer > 0) return;
  world.strikeTimer = nextInterval(world, field);
  place(world, field, true);
}

export function clearMoments(world: World): void {
  for (const moment of world.moments) {
    removeEchoes(world, moment, false);
    world.events.push({ type: 'moment_gone', momentId: moment.id });
  }
  world.moments = [];
}

export function startMoments(world: World): void {
  clearMoments(world);
  const field: MomentField | null = fieldOf(world);
  world.strikeTimer = field === null ? 0 : nextInterval(world, field);
  if (field === null) return;
  for (let index: number = 0; index < field.start; index += 1) place(world, field, false);
}

export function forceStrike(world: World, at: Vec2, momentId: string | null): MomentState | null {
  const field: MomentField | null = fieldOf(world);
  const named: MomentDef | undefined = momentId === null ? undefined : world.content.moments.defs.get(momentId);
  const def: MomentDef | null = named ?? (field === null ? null : pickDef(world, field)) ?? [...world.content.moments.defs.values()][0] ?? null;
  if (def === null) return null;
  return begin(world, def, at, field?.combat ?? true, true);
}

export function momentOfEcho(world: World, monsterId: number): MomentState | null {
  return world.moments.find((moment: MomentState): boolean => moment.figures.some((figure: MomentFigure): boolean => figure.monsterId === monsterId)) ?? null;
}

export function shiftMoments(world: World, by: Vec2): void {
  for (const moment of world.moments) {
    moment.pos = { x: moment.pos.x + by.x, z: moment.pos.z + by.z };
    for (const figure of moment.figures) figure.pos = { x: figure.pos.x + by.x, z: figure.pos.z + by.z };
    for (const monster of echoMonsters(world, moment)) {
      monster.pos = { x: monster.pos.x + by.x, z: monster.pos.z + by.z };
      monster.lastPos = { x: monster.lastPos.x + by.x, z: monster.lastPos.z + by.z };
      monster.path = [];
    }
  }
}

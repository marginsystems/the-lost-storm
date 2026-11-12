import type { MomentDef, MomentEcho, MomentField, MomentLibrary, StrikeArea, StrikeInterval, WeightedMoment } from '../content/moment-types.ts';
import type { Content, MonsterDef, PropDef, ZoneDef } from '../content/types.ts';
import { rollDrop } from './loot.ts';
import type { Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, distance } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { pickWeighted } from '../rng.ts';
import { allHold } from './conditions.ts';
import { grantXp, killXp } from './character.ts';
import { dropOnGround } from './ground.ts';
import { lowerProps, raiseProps, standClear } from './moment-ground.ts';
import { setFlags } from './story.ts';
import { monsterLevel, spawnMonster } from './spawn.ts';
import type { EchoState, ItemInstance, MomentFigure, MomentOutcome, MomentState, MonsterState, NpcState, ProjectileState, World } from './types.ts';

export const MOMENTS = {
  placementTries: 40,
  retry: 2,
  startLifeMin: 0.35,
  startLifeMax: 1,
  settle: 1.2,
  wakeDepth: 0.7,
  presence: 1.4,
  awayLimit: 6,
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
    away: 0,
    entered: false,
    bounty: 0,
    blocks: null,
    outcome: null,
    figures: figuresOf(def, pos),
  };
  world.nextId += 1;
  world.moments.push(moment);
  if (mark) world.events.push({ type: 'moment_mark', moment });
  else raiseProps(world, moment);
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

function serves(world: World, prop: string): boolean {
  const def: PropDef | undefined = world.content.props.get(prop);
  return def !== undefined && def.service !== null;
}

export function safeSpots(world: World): Vec2[] {
  const zone: ZoneDef = world.zone;
  const spots: Vec2[] = world.npcs.map((npc: NpcState): Vec2 => npc.pos);
  if (zone.waypoint !== null) spots.push(zone.waypoint);
  for (const placed of zone.props) if (serves(world, placed.prop)) spots.push(placed);
  return spots.map((spot: Vec2): Vec2 => ({ x: spot.x + world.shift.x, z: spot.z + world.shift.z }));
}

function pointNear(world: World, near: StrikeInterval): Vec2 {
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = world.rng.range(near.min, near.max);
  return { x: world.player.pos.x + Math.cos(angle) * reach, z: world.player.pos.z + Math.sin(angle) * reach };
}

function roomFor(world: World, field: MomentField, def: MomentDef, pos: Vec2): boolean {
  if (!isWalkable(world.grid, pos.x, pos.z)) return false;
  if (safeSpots(world).some((spot: Vec2): boolean => distance(spot, pos) < def.radius + field.clearance.safe)) return false;
  if (world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.def.faction !== world.content.moments.faction && distance(monster.pos, pos) < monster.def.aggroRadius + field.clearance.packs)) return false;
  if (world.zone.exits.some((exit): boolean => distance(exit, pos) < def.radius + field.clearance.exits)) return false;
  return world.moments.every((other: MomentState): boolean => distance(other.pos, pos) >= def.radius + other.def.radius + field.clearance.between);
}

function clear(world: World, field: MomentField, def: MomentDef, pos: Vec2): boolean {
  if (!roomFor(world, field, def, pos)) return false;
  if (distance(world.player.pos, pos) < def.radius + field.clearance.hero) return false;
  return !field.avoid.some((keep: StrikeArea): boolean => distance({ x: keep.x + world.shift.x, z: keep.z + world.shift.z }, pos) < def.radius + keep.radius);
}

function clearNear(world: World, field: MomentField, def: MomentDef, pos: Vec2): boolean {
  return roomFor(world, field, def, pos) && lineWalkable(world.grid, world.player.pos, pos);
}

function sureHolds(world: World, field: MomentField | null): boolean {
  return field !== null && field.combat && field.sure.length > 0 && allHold(world, field.sure);
}

function canTurn(def: MomentDef): boolean {
  return def.turnChance > 0 && def.echoes.some((entry: MomentEcho): boolean => entry.turns);
}

function pickDef(world: World, field: MomentField): MomentDef | null {
  const fights: WeightedMoment[] = field.table.filter((entry: WeightedMoment): boolean => {
    const def: MomentDef | undefined = world.content.moments.defs.get(entry.moment);
    return def !== undefined && canTurn(def);
  });
  const sure: boolean = sureHolds(world, field);
  const entry: WeightedMoment | null = pickWeighted(world.rng, sure && field.first.length > 0 ? field.first : sure && fights.length > 0 ? fights : field.table);
  return entry === null ? null : (world.content.moments.defs.get(entry.moment) ?? null);
}

function place(world: World, field: MomentField, mark: boolean): MomentState | null {
  const def: MomentDef | null = pickDef(world, field);
  if (def === null) return null;
  const near: StrikeInterval | null = sureHolds(world, field) && world.player.alive ? field.near : null;
  for (let attempt: number = 0; attempt < MOMENTS.placementTries; attempt += 1) {
    if (near !== null) {
      const pos: Vec2 = pointNear(world, near);
      if (clearNear(world, field, def, pos)) return begin(world, def, pos, field.combat, mark);
      continue;
    }
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
  const echo: MonsterDef = { ...base, faction: world.content.moments.faction, loot: NO_LOOT, summon: null, boss: null, xp: 0, poise: { ...base.poise, knockback: base.poise.knockback * world.content.moments.echoKnockback } };
  return entry.look === null ? echo : { ...echo, rig: entry.look.rig, scale: entry.look.scale, gear: entry.look.gear, wear: entry.look.wear };
}

function turning(world: World, moment: MomentState): MomentFigure[] {
  const able: MomentFigure[] = moment.figures.filter((figure: MomentFigure): boolean => moment.def.echoes[figure.echo]?.turns === true);
  const rolled: MomentFigure[] = able.filter((): boolean => world.rng.chance(moment.def.turnChance));
  const first: MomentFigure | undefined = able[0];
  return rolled.length === 0 && first !== undefined && sureHolds(world, fieldOf(world)) ? [first] : rolled;
}

function turn(world: World, moment: MomentState): number[] {
  if (!moment.combat) return [];
  const packId: number = world.nextPackId;
  world.nextPackId += 1;
  const turned: number[] = [];
  for (const figure of turning(world, moment)) {
    const entry: MomentEcho | undefined = moment.def.echoes[figure.echo];
    if (entry === undefined) continue;
    const def: MonsterDef | null = echoDef(world, entry);
    if (def === null) continue;
    const monster: MonsterState = spawnMonster(world, def, packId, figure.pos, { summonerId: null, scatter: 0, revived: false });
    standClear(world, monster);
    monster.facing = figure.facing;
    monster.aggro = true;
    monster.foeId = world.player.id;
    monster.restTime = world.content.moments.rouse + turned.length * world.content.moments.stagger;
    moment.bounty += killXp(world, world.content.monsters.get(entry.monster)?.xp ?? 0, monster.level);
    world.events.push({ type: 'aggro', monsterId: monster.id });
    figure.turned = true;
    figure.monsterId = monster.id;
    turned.push(monster.id);
  }
  return turned;
}

function wake(world: World, moment: MomentState): void {
  moment.phase = 'awake';
  moment.entered = true;
  moment.timeLeft = moment.def.awake;
  moment.phaseTime = 0;
  world.events.push({ type: 'moment_woke', moment, turned: turn(world, moment) });
}

export function echoMonsters(world: World, moment: MomentState): MonsterState[] {
  const ids: Set<number> = new Set<number>(moment.figures.flatMap((figure: MomentFigure): number[] => (figure.monsterId === null ? [] : [figure.monsterId])));
  return world.monsters.filter((monster: MonsterState): boolean => ids.has(monster.id));
}

function removeEchoes(world: World, moment: MomentState, onlyLiving: boolean): void {
  const gone: Set<number> = new Set<number>(echoMonsters(world, moment).filter((monster: MonsterState): boolean => !onlyLiving || monster.alive).map((monster: MonsterState): number => monster.id));
  if (gone.size === 0) return;
  for (const id of gone) world.events.push({ type: 'monster_remove', monsterId: id });
  world.monsters = world.monsters.filter((monster: MonsterState): boolean => !gone.has(monster.id));
  for (const projectile of world.projectiles) if (gone.has(projectile.ownerId)) world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: false, skill: projectile.skill });
  world.projectiles = world.projectiles.filter((projectile: ProjectileState): boolean => !gone.has(projectile.ownerId));
  world.echoes = world.echoes.filter((echo: EchoState): boolean => !gone.has(echo.ownerId));
}

function reward(world: World, moment: MomentState, share: number, items: boolean): void {
  const table = moment.def.reward;
  const scale: number = (1 + world.content.world.scaling.xpPerLevel * (moment.level - 1)) * (1 + world.player.stats.goldFind);
  const gold: number = Math.round(world.rng.int(table.goldMin, table.goldMax) * scale * share);
  if (gold > 0) dropOnGround(world, moment.pos, { kind: 'gold', amount: gold });
  if (!items) return;
  for (let index: number = 0; index < table.items; index += 1) {
    if (!world.rng.chance(table.itemChance)) continue;
    const item: ItemInstance | null = rollDrop(world, moment.level, table.rarity, { kind: 'moment', moment: moment.def.id, zone: world.zone.id });
    if (item === null) continue;
    dropOnGround(world, moment.pos, { kind: 'item', item });
  }
}

function end(world: World, moment: MomentState, outcome: MomentOutcome): void {
  if (outcome === 'played' && moment.combat) reward(world, moment, world.content.moments.playedShare, false);
  if (outcome === 'resolved') {
    reward(world, moment, 1, true);
    if (moment.bounty > 0) grantXp(world, moment.bounty);
    setFlags(world, world.content.moments.cleared);
  }
  if (outcome === 'left' && sureHolds(world, fieldOf(world))) world.strikeTimer = world.content.moments.comeback;
  removeEchoes(world, moment, true);
  moment.phase = 'fading';
  moment.outcome = outcome;
  moment.timeLeft = world.content.moments.fade;
  moment.phaseTime = 0;
  world.events.push({ type: 'moment_ended', moment, outcome });
}

function stepAwake(world: World, moment: MomentState, dt: number): void {
  const turned: boolean = moment.figures.some((figure: MomentFigure): boolean => figure.turned);
  const fighting: boolean = turned && echoMonsters(world, moment).some((monster: MonsterState): boolean => monster.alive);
  if (turned && !fighting) {
    end(world, moment, 'resolved');
    return;
  }
  if (world.player.alive) {
    const inside: boolean = distance(world.player.pos, moment.pos) <= moment.def.radius;
    if (moment.entered && !inside) {
      end(world, moment, 'left');
      return;
    }
    moment.entered = inside;
  }
  const present: boolean = world.player.alive && distance(world.player.pos, moment.pos) < moment.def.radius * MOMENTS.presence;
  moment.away = present ? 0 : moment.away + dt;
  const held: boolean = fighting && (sureHolds(world, world.zone.moments) || moment.away < MOMENTS.awayLimit);
  if (moment.timeLeft <= 0 && !held) end(world, moment, turned ? 'expired' : 'played');
}

function stepMoment(world: World, moment: MomentState, dt: number): boolean {
  moment.timeLeft -= dt;
  moment.phaseTime += dt;
  const reach: number = world.player.alive ? distance(world.player.pos, moment.pos) : Infinity;
  const inside: boolean = reach < moment.def.radius;
  const deep: boolean = reach < moment.def.radius * MOMENTS.wakeDepth;
  switch (moment.phase) {
    case 'mark':
      if (moment.timeLeft > 0) return true;
      moment.phase = 'dormant';
      moment.timeLeft = moment.def.lifetime;
      moment.phaseTime = 0;
      moment.armed = !inside;
      raiseProps(world, moment);
      world.events.push({ type: 'moment_strike', moment });
      return true;
    case 'dormant':
      if (!inside) moment.armed = true;
      if (deep && (moment.armed || moment.phaseTime >= MOMENTS.settle)) wake(world, moment);
      else if (moment.timeLeft <= 0) end(world, moment, 'faded');
      return true;
    case 'awake':
      stepAwake(world, moment, dt);
      return true;
    case 'fading':
      if (moment.timeLeft > 0) return true;
      removeEchoes(world, moment, false);
      lowerProps(world, moment);
      world.events.push({ type: 'moment_gone', momentId: moment.id });
      return false;
  }
  return true;
}

export function stepMoments(world: World, dt: number): void {
  world.moments = world.moments.filter((moment: MomentState): boolean => stepMoment(world, moment, dt));
  const field: MomentField | null = fieldOf(world);
  if (field === null || live(world) >= (sureHolds(world, field) ? 1 : field.max)) return;
  world.strikeTimer -= dt;
  if (world.strikeTimer > 0) return;
  world.strikeTimer = nextInterval(world, field);
  const missed: boolean = place(world, field, true) === null;
  world.strikeMisses = missed ? world.strikeMisses + 1 : 0;
  if (missed) world.strikeTimer = Math.min(world.strikeTimer, MOMENTS.retry);
}

export function insideAwakeMoment(world: World): boolean {
  if (!world.player.alive) return false;
  return world.moments.some((moment: MomentState): boolean => moment.phase === 'awake' && distance(world.player.pos, moment.pos) < moment.def.radius);
}

export function clearMoments(world: World): void {
  for (const moment of world.moments) {
    removeEchoes(world, moment, false);
    lowerProps(world, moment);
    world.events.push({ type: 'moment_gone', momentId: moment.id });
  }
  world.moments = [];
}

export function startMoments(world: World): void {
  clearMoments(world);
  const field: MomentField | null = fieldOf(world);
  world.strikeTimer = field === null ? 0 : sureHolds(world, field) ? field.grace : Math.max(field.grace, nextInterval(world, field));
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

export function restEchoes(world: World): void {
  for (const moment of world.moments) {
    moment.entered = false;
    echoMonsters(world, moment).forEach((monster: MonsterState, order: number): void => {
      monster.restTime = world.content.moments.rouse + order * world.content.moments.stagger;
    });
  }
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

export function fightZones(content: Content): string[] {
  return [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.moments?.combat === true).map((zone: ZoneDef): string => zone.id);
}

export function nearestFight(world: World): MomentState | null {
  const open: MomentState[] = world.moments.filter((moment: MomentState): boolean => moment.combat && moment.phase !== 'fading');
  return open.toSorted((a: MomentState, b: MomentState): number => distance(world.player.pos, a.pos) - distance(world.player.pos, b.pos))[0] ?? null;
}

export function strikeGround(world: World): StrikeArea | null {
  const field: MomentField | null = fieldOf(world);
  if (field === null || !field.combat) return null;
  const widest: StrikeArea | undefined = field.areas.toSorted((a: StrikeArea, b: StrikeArea): number => b.radius - a.radius)[0];
  return widest === undefined ? null : { x: widest.x + world.shift.x, z: widest.z + world.shift.z, radius: widest.radius };
}

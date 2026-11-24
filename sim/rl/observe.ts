import type { SkillDef, ZoneExit } from '../content/types.ts';
import { DAMAGE_TYPES, SKILL_CATEGORIES } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { directionOf } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { armourReduction } from '../stats.ts';
import { findActor, versusScale } from '../world/combat.ts';
import { mayStrike } from '../world/factions.ts';
import { hostileFrom, isPrimary, partyOf } from '../world/heroes.ts';
import { blockedFlask } from '../world/flasks.ts';
import { knockTime } from '../world/movement.ts';
import { heldTriggers } from '../powers.ts';
import { blockedReason } from '../world/skills.ts';
import type { NpcState } from '../world/npc-types.ts';
import type { Actor, AreaState, FlaskState, GroundItem, HazardState, MonsterState, PlayerState, ProjectileState, World } from '../world/types.ts';
import type { Action, EntityKind, Situation } from './contract.ts';
import { BEHAVIOUR_ORDER, FLASK_FEATURES, FOE_FEATURES, LOOT_FEATURES, STATUS_FEATURES, categoryIndex, damageIndex, DELIVERY_ORDER, ENTITY_KINDS, LAYOUT, MOVE_CHOICES, PICKUP_CHOICE, RL, SITUATIONS, SKILL_CHOICES, USE_CHOICES } from './contract.ts';
import { dangerAround } from './danger.ts';
import type { Hit, Recall, Sighting } from './recall.ts';
import { recentAmount } from './recall.ts';
import type { PickupRule } from './loot.ts';
import { bagFree, fits, nearestWanted, rarityShare, ruleShare, wanted } from './loot.ts';
import { skillNumbers } from './skill-numbers.ts';
import type { Statuses } from './status.ts';
import { statusesOf, targetedBy, targetingHero } from './status.ts';
import type { SkillNumbers } from './skill-numbers.ts';

export interface ObserveContext {
  readonly situation: Situation;
  readonly objective: Vec2 | null;
  readonly timeLeft: number;
  readonly progress: number;
  readonly recall: Recall;
  readonly pickup: PickupRule;
}

export type Seen =
  | { readonly type: 'monster'; readonly pos: Vec2; readonly monster: MonsterState; readonly hostile: boolean }
  | { readonly type: 'hero'; readonly pos: Vec2; readonly hero: PlayerState; readonly hostile: boolean }
  | { readonly type: 'projectile'; readonly pos: Vec2; readonly projectile: ProjectileState; readonly hostile: boolean }
  | { readonly type: 'hazard'; readonly pos: Vec2; readonly hazard: HazardState; readonly hostile: boolean }
  | { readonly type: 'area'; readonly pos: Vec2; readonly area: AreaState; readonly hostile: boolean }
  | { readonly type: 'loot'; readonly pos: Vec2; readonly ground: GroundItem }
  | { readonly type: 'exit'; readonly pos: Vec2; readonly exit: ZoneExit }
  | { readonly type: 'npc'; readonly pos: Vec2; readonly npc: NpcState }
  | { readonly type: 'objective'; readonly pos: Vec2 }
  | { readonly type: 'remembered'; readonly pos: Vec2; readonly age: number };

export interface View {
  readonly hero: PlayerState;
  readonly seen: readonly Seen[];
  readonly targets: readonly Actor[];
  readonly pickup: GroundItem | null;
}

export interface Observation {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly view: View;
}

interface Writer {
  readonly out: Float32Array;
  at: number;
}

const ONE: number = 1;

function put(writer: Writer, value: number): void {
  const safe: number = Number.isFinite(value) ? Math.max(-RL.clip, Math.min(RL.clip, value)) : 0;
  writer.out[writer.at] = safe;
  writer.at += 1;
}

function flag(writer: Writer, on: boolean): void {
  put(writer, on ? ONE : 0);
}

function oneHot(writer: Writer, size: number, index: number): void {
  for (let at: number = 0; at < size; at += 1) flag(writer, at === index);
}

function blank(writer: Writer, count: number): void {
  for (let at: number = 0; at < count; at += 1) put(writer, 0);
}

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function hostileTo(world: World, hero: PlayerState, actor: Actor): boolean {
  return actor.alive && mayStrike(world, { sourceId: hero.id, faction: null }, actor);
}

export function hostileMonster(world: World, monster: MonsterState): boolean {
  return hostileTo(world, world.player, monster);
}

function hostileArea(world: World, hero: PlayerState, area: AreaState): boolean {
  return area.ownerId !== hero.id && (partyOf(world, area.ownerId) === null || hostileFrom(world, hero, area.offence.team, area.ownerId));
}

function seenActor(actor: Actor, hostile: boolean): Seen {
  return actor.kind === 'player' ? { type: 'hero', pos: actor.pos, hero: actor, hostile } : { type: 'monster', pos: actor.pos, monster: actor, hostile };
}

export function viewOf(world: World, hero: PlayerState, objective: Vec2 | null, rule: PickupRule): View {
  const from: Vec2 = hero.pos;
  const byGap = (a: Seen, b: Seen): number => gap(from, a.pos) - gap(from, b.pos);
  const others: PlayerState[] = world.heroes.filter((other: PlayerState): boolean => other !== hero && other.alive);
  const monsters: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  const bodies: Actor[] = [...monsters, ...others];
  const targets: Actor[] = bodies.filter((actor: Actor): boolean => hostileTo(world, hero, actor)).toSorted((a: Actor, b: Actor): number => gap(from, a.pos) - gap(from, b.pos)).slice(0, RL.targets);
  const first: Seen[] = targets.map((actor: Actor): Seen => seenActor(actor, true));
  const rest: Seen[] = [
    ...bodies.filter((actor: Actor): boolean => !targets.includes(actor)).map((actor: Actor): Seen => seenActor(actor, hostileTo(world, hero, actor))),
    ...world.projectiles.map((projectile: ProjectileState): Seen => ({ type: 'projectile', pos: projectile.pos, projectile, hostile: hostileFrom(world, hero, projectile.team, projectile.ownerId) })),
    ...world.hazards.map((hazard: HazardState): Seen => ({ type: 'hazard', pos: hazard.pos, hazard, hostile: hostileFrom(world, hero, hazard.team, hazard.ownerId) })),
    ...world.areas.map((area: AreaState): Seen => ({ type: 'area', pos: area.pos, area, hostile: hostileArea(world, hero, area) })),
    ...world.ground.map((ground: GroundItem): Seen => ({ type: 'loot', pos: ground.pos, ground })),
    ...world.zone.exits.map((exit: ZoneExit): Seen => ({ type: 'exit', pos: { x: exit.x, z: exit.z }, exit })),
    ...world.npcs.map((npc: NpcState): Seen => ({ type: 'npc', pos: npc.pos, npc })),
    ...(objective === null ? [] : [{ type: 'objective', pos: objective } satisfies Seen]),
  ].toSorted(byGap);
  return { hero, seen: [...first, ...rest].slice(0, RL.entities), targets, pickup: nearestWanted(world, hero, rule) };
}

function writeFlask(writer: Writer, flask: FlaskState | undefined): void {
  if (flask === undefined) {
    blank(writer, FLASK_FEATURES.length);
    return;
  }
  flag(writer, true);
  put(writer, flask.charges / Math.max(1, flask.def.maxCharges));
  flag(writer, flask.charges >= flask.def.chargesPerUse && flask.cooldown <= 0);
  flag(writer, flask.def.resource === 'life');
  flag(writer, flask.def.resource === 'mana');
}

function writeSelf(writer: Writer, world: World, context: ObserveContext, view: View): void {
  const player: PlayerState = view.hero;
  const phase: string | null = player.action?.phase ?? null;
  put(writer, player.life / Math.max(1, player.maxLife));
  put(writer, player.mana / Math.max(1, player.stats.maxMana));
  put(writer, player.maxLife / RL.lifeScale);
  put(writer, player.stats.maxMana / RL.manaScale);
  put(writer, player.level / RL.levelScale);
  put(writer, player.stats.moveSpeed / RL.speedScale);
  put(writer, armourReduction(player.stats.armour, world.content.player.resistance.armourCap));
  put(writer, player.stats.critChance);
  put(writer, (player.stats.damageMin + player.stats.damageMax) / 2 / RL.damageScale);
  put(writer, player.stats.attackSpeed);
  flag(writer, player.action !== null);
  flag(writer, phase === 'windup');
  flag(writer, phase === 'channel');
  flag(writer, phase === 'recovery');
  put(writer, player.action?.timeLeft ?? 0);
  put(writer, player.stagger);
  put(writer, player.root);
  put(writer, player.invulnerable);
  flag(writer, player.moving);
  flag(writer, !player.alive);
  for (let slot: number = 0; slot < RL.flasks; slot += 1) writeFlask(writer, player.flasks[slot]);
  oneHot(writer, SITUATIONS.length, SITUATIONS.indexOf(context.situation));
  const objective: Vec2 | null = context.objective;
  flag(writer, objective !== null);
  put(writer, objective === null ? 0 : (objective.x - player.pos.x) / RL.distanceScale);
  put(writer, objective === null ? 0 : (objective.z - player.pos.z) / RL.distanceScale);
  put(writer, objective === null ? 0 : gap(player.pos, objective) / RL.distanceScale);
  put(writer, context.timeLeft / (RL.timeScale * RL.timeScale));
  const foes: readonly Actor[] = [...world.monsters, ...world.heroes].filter((actor: Actor): boolean => hostileTo(world, player, actor));
  put(writer, foes.length / RL.countScale);
  put(writer, view.targets.filter((actor: Actor): boolean => gap(player.pos, actor.pos) <= RL.nearReach).length / RL.countScale);
  put(writer, context.progress);
  for (const danger of dangerAround(world, player)) put(writer, danger);
  for (const decision of context.recall.decisions) writeDecision(writer, decision);
  writeRecent(writer, world, context.recall, view);
  put(writer, ruleShare(world.content, context.pickup));
  put(writer, bagFree(player));
  writeStatuses(writer, statusesOf(world, player));
  put(writer, targetedBy(world, player) / RL.countScale);
  const facing: Vec2 = directionOf(player.facing);
  put(writer, facing.x);
  put(writer, facing.z);
  flag(writer, player.pivot !== null);
  writeBuilt(writer, world, player);
  put(writer, knockTime(player));
  put(writer, player.knockGrace);
  blank(writer, RL.spareSelf);
}

function writeBuilt(writer: Writer, world: World, player: PlayerState): void {
  put(writer, player.stats.damagePercent);
  put(writer, player.stats.critMultiplier - 1);
  put(writer, (player.stats.lifeRegen * RL.timeScale) / Math.max(1, player.maxLife));
  put(writer, (player.stats.manaRegen * RL.timeScale) / Math.max(1, player.stats.maxMana));
  put(writer, player.stats.stormResist);
  put(writer, player.stats.frostResist);
  put(writer, heldTriggers(world.content, player) / RL.countScale);
}

function writeDecision(writer: Writer, action: Action): void {
  oneHot(writer, MOVE_CHOICES, action.move);
  oneHot(writer, SKILL_CHOICES, action.skill);
  oneHot(writer, RL.targets, action.target);
  oneHot(writer, USE_CHOICES, action.use);
}

function seenNow(view: View, id: number): boolean {
  return view.seen.some((seen: Seen): boolean => (seen.type === 'monster' && seen.monster.id === id) || (seen.type === 'hero' && seen.hero.id === id));
}

function unseenAttacker(world: World, view: View, hit: Hit): boolean {
  const attacker: boolean = world.monsters.some((monster: MonsterState): boolean => monster.id === hit.sourceId && monster.alive) || world.heroes.some((hero: PlayerState): boolean => hero !== view.hero && hero.id === hit.sourceId && hero.alive);
  return attacker && !seenNow(view, hit.sourceId);
}

function writeRecent(writer: Writer, world: World, recall: Recall, view: View): void {
  const player: PlayerState = view.hero;
  const now: number = world.time;
  const hit: Hit | null = recall.lastHit;
  put(writer, recentAmount(recall.taken, now) / Math.max(1, player.maxLife));
  put(writer, recentAmount(recall.dealt, now) / Math.max(1, player.maxLife));
  put(writer, hit === null ? 1 : Math.min(1, (now - hit.time) / RL.timeScale));
  flag(writer, hit !== null && now - hit.time <= RL.memoryWindow && unseenAttacker(world, view, hit));
}

export function seenMonsters(view: View): MonsterState[] {
  return view.seen.flatMap((seen: Seen): MonsterState[] => (seen.type === 'monster' && seen.hostile ? [seen.monster] : []));
}

export function rememberedFoes(world: World, recall: Recall, view: View): Seen[] {
  const out: Seen[] = [];
  for (const [id, sighting] of recall.sightings) {
    const age: number = world.time - sighting.time;
    if (age > RL.memoryWindow || seenNow(view, id)) continue;
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === id);
    if (monster === undefined || !hostileTo(world, view.hero, monster)) continue;
    out.push({ type: 'remembered', pos: sightingPos(sighting), age });
  }
  return out.toSorted((a: Seen, b: Seen): number => ageOf(a) - ageOf(b)).slice(0, RL.remembered);
}

function sightingPos(sighting: Sighting): Vec2 {
  return { x: sighting.pos.x, z: sighting.pos.z };
}

function ageOf(seen: Seen): number {
  return seen.type === 'remembered' ? seen.age : 0;
}

function writeSlot(writer: Writer, player: PlayerState, slot: number): void {
  const skill: SkillDef | null = player.skills[slot] ?? null;
  if (skill === null) {
    blank(writer, LAYOUT.slot);
    return;
  }
  const numbers: SkillNumbers = skillNumbers(skill);
  const left: number = player.cooldowns[skill.id] ?? 0;
  flag(writer, true);
  flag(writer, player.alive && blockedReason(player, skill) === null);
  put(writer, skill.cooldown > 0 ? left / skill.cooldown : 0);
  put(writer, skill.cooldown / RL.timeScale);
  put(writer, skill.manaCost / Math.max(1, player.stats.maxMana));
  flag(writer, player.mana >= skill.manaCost);
  put(writer, skill.windup);
  put(writer, skill.recovery);
  put(writer, numbers.reach / RL.distanceScale);
  put(writer, numbers.area / RL.areaScale);
  put(writer, skill.damage.weaponPercent / RL.damageScale);
  put(writer, (skill.damage.flatMin + skill.damage.flatMax) / 2 / RL.damageScale);
  put(writer, skill.knockback / RL.distanceScale);
  put(writer, skill.stun);
  put(writer, skill.stagger);
  flag(writer, skill.press !== null);
  put(writer, numbers.duration / RL.timeScale);
  put(writer, numbers.count / RL.countScale);
  flag(writer, player.held.includes(slot));
  put(writer, skill.lifeOnHit / RL.countScale);
  put(writer, skill.leech * RL.countScale);
  put(writer, Math.min(1, (skill.delivery.type === 'projectile' ? skill.delivery.pierce : 0) / RL.countScale));
  put(writer, skill.echo);
  put(writer, (skill.momentum?.cap ?? 0) / RL.countScale);
  oneHot(writer, Object.keys(DELIVERY_ORDER).length, DELIVERY_ORDER[skill.delivery.type]);
  oneHot(writer, SKILL_CATEGORIES.length, categoryIndex(skill.category));
  oneHot(writer, DAMAGE_TYPES.length, damageIndex(skill.damage.type));
  blank(writer, RL.spareSlot);
}

interface EntityNumbers {
  readonly hostile: boolean;
  readonly life: number;
  readonly maxLife: number;
  readonly damage: number;
  readonly moveSpeed: number;
  readonly radius: number;
  readonly aggro: boolean;
  readonly acting: boolean;
  readonly windupLeft: number;
  readonly reach: number;
  readonly area: number;
  readonly boss: boolean;
  readonly rank: boolean;
  readonly stunned: boolean;
  readonly dir: Vec2;
  readonly speed: number;
  readonly timeLeft: number;
  readonly behaviour: number;
}

const QUIET: EntityNumbers = { hostile: false, life: 0, maxLife: 0, damage: 0, moveSpeed: 0, radius: 0, aggro: false, acting: false, windupLeft: 0, reach: 0, area: 0, boss: false, rank: false, stunned: false, dir: { x: 0, z: 0 }, speed: 0, timeLeft: 0, behaviour: -1 };

function monsterNumbers(world: World, player: PlayerState, monster: MonsterState, hostile: boolean): EntityNumbers {
  const skill: SkillDef | undefined = monster.nextSkill ?? world.content.skills.get(monster.def.skill);
  const numbers: SkillNumbers = skill === undefined ? { reach: 0, area: 0, duration: 0, count: 0 } : skillNumbers(skill);
  const action = monster.action;
  return {
    hostile,
    life: monster.life / Math.max(1, monster.maxLife),
    maxLife: Math.log1p(monster.maxLife / Math.max(1, player.maxLife)),
    damage: (monster.damageMin + monster.damageMax) / 2 / Math.max(1, player.maxLife),
    moveSpeed: monster.def.moveSpeed / RL.speedScale,
    radius: monster.radius,
    aggro: monster.aggro,
    acting: action !== null,
    windupLeft: action !== null && action.phase === 'windup' ? action.timeLeft : 0,
    reach: numbers.reach / RL.distanceScale,
    area: numbers.area / RL.areaScale,
    boss: monster.def.boss !== null,
    rank: monster.def.rank !== null,
    stunned: monster.recovery.stunned > 0 || monster.stagger > 0,
    dir: directionOf(monster.facing),
    speed: 0,
    timeLeft: 0,
    behaviour: BEHAVIOUR_ORDER[monster.def.behaviour.type],
  };
}

function heroNumbers(world: World, player: PlayerState, other: PlayerState, hostile: boolean): EntityNumbers {
  const action = other.action;
  const numbers: SkillNumbers = action === null ? { reach: 0, area: 0, duration: 0, count: 0 } : skillNumbers(action.skill);
  return {
    hostile,
    life: other.life / Math.max(1, other.maxLife),
    maxLife: Math.log1p(other.maxLife / Math.max(1, player.maxLife)),
    damage: ((other.stats.damageMin + other.stats.damageMax) / 2 / Math.max(1, player.maxLife)) * versusScale(world, other, player),
    moveSpeed: other.stats.moveSpeed / RL.speedScale,
    radius: other.radius,
    aggro: true,
    acting: action !== null,
    windupLeft: action !== null && action.phase === 'windup' ? action.timeLeft : 0,
    reach: numbers.reach / RL.distanceScale,
    area: numbers.area / RL.areaScale,
    boss: false,
    rank: false,
    stunned: other.stagger > 0,
    dir: directionOf(other.facing),
    speed: 0,
    timeLeft: 0,
    behaviour: -1,
  };
}

function entityNumbers(world: World, player: PlayerState, seen: Seen): EntityNumbers {
  switch (seen.type) {
    case 'monster':
      return monsterNumbers(world, player, seen.monster, seen.hostile);
    case 'hero':
      return heroNumbers(world, player, seen.hero, seen.hostile);
    case 'projectile': {
      const numbers: SkillNumbers = skillNumbers(seen.projectile.skill);
      return { ...QUIET, hostile: seen.hostile, damage: ((seen.projectile.damageMin + seen.projectile.damageMax) / 2 / Math.max(1, player.maxLife)) * versusScale(world, findActor(world, seen.projectile.ownerId), player), area: numbers.area / RL.areaScale, dir: seen.projectile.direction, speed: seen.projectile.skill.delivery.type === 'projectile' ? seen.projectile.skill.delivery.speed / RL.distanceScale : 0, timeLeft: seen.projectile.distanceLeft / RL.distanceScale };
    }
    case 'hazard':
      return { ...QUIET, hostile: seen.hostile, damage: ((seen.hazard.damageMin + seen.hazard.damageMax) / 2 / Math.max(1, player.maxLife)) * versusScale(world, findActor(world, seen.hazard.ownerId), player), area: seen.hazard.radius / RL.areaScale, radius: seen.hazard.radius, timeLeft: seen.hazard.timeLeft };
    case 'area': {
      const numbers: SkillNumbers = skillNumbers(seen.area.skill);
      return { ...QUIET, hostile: seen.hostile, damage: ((seen.area.offence.damageMin + seen.area.offence.damageMax) / 2 / Math.max(1, player.maxLife)) * versusScale(world, findActor(world, seen.area.ownerId), player), area: numbers.area / RL.areaScale, radius: numbers.area, timeLeft: seen.area.timeLeft };
    }
    case 'loot':
    case 'exit':
    case 'npc':
    case 'objective':
      return QUIET;
    case 'remembered':
      return { ...QUIET, hostile: true, timeLeft: seen.age };
  }
  return QUIET;
}

function writeLoot(writer: Writer, world: World, player: PlayerState, seen: Seen, rule: PickupRule): void {
  if (seen.type !== 'loot') {
    blank(writer, LOOT_FEATURES.length);
    return;
  }
  const ground: GroundItem = seen.ground;
  put(writer, ground.content.kind === 'item' ? rarityShare(world.content, ground.content.item) : 0);
  put(writer, ground.content.kind === 'gold' ? Math.log1p(ground.content.amount) / RL.goldScale : 0);
  flag(writer, wanted(world, player, rule, ground));
  flag(writer, fits(world, player, ground));
}

function writeStatuses(writer: Writer, statuses: Statuses): void {
  put(writer, statuses.burning);
  put(writer, statuses.branded);
  put(writer, statuses.slowed);
  put(writer, statuses.weakened);
}

function writeRivalHero(writer: Writer, world: World, player: PlayerState, other: PlayerState): void {
  writeStatuses(writer, statusesOf(world, other));
  flag(writer, other.intent.type === 'attack' && other.intent.targetId === player.id);
  put(writer, other.root);
  blank(writer, FOE_FEATURES.length - 2);
}

function writeFoe(writer: Writer, world: World, player: PlayerState, seen: Seen): void {
  if (seen.type === 'hero') {
    writeRivalHero(writer, world, player, seen.hero);
    return;
  }
  if (seen.type !== 'monster') {
    blank(writer, STATUS_FEATURES.length + FOE_FEATURES.length);
    return;
  }
  const monster: MonsterState = seen.monster;
  writeStatuses(writer, statusesOf(world, monster));
  flag(writer, targetingHero(world, monster, player));
  put(writer, monster.root);
  flag(writer, monster.def.rank?.leader === true);
  put(writer, monster.def.mods.length / RL.countScale);
  flag(writer, monster.def.deathSkill !== null);
  flag(writer, monster.def.summon !== null);
  put(writer, monster.def.regen * RL.timeScale);
  flag(writer, monster.def.guard !== null);
  put(writer, monster.recovery.guard);
  put(writer, monster.recovery.strain);
}

function kindOf(seen: Seen): EntityKind {
  if (seen.type === 'hero') return seen.hostile ? 'rival' : 'ally';
  return seen.type === 'remembered' ? 'monster' : seen.type;
}

function writeEntity(writer: Writer, world: World, player: PlayerState, seen: Seen | undefined, rule: PickupRule): void {
  if (seen === undefined) {
    blank(writer, LAYOUT.entity);
    return;
  }
  const numbers: EntityNumbers = entityNumbers(world, player, seen);
  flag(writer, true);
  oneHot(writer, ENTITY_KINDS.length, ENTITY_KINDS.indexOf(kindOf(seen)));
  flag(writer, numbers.hostile);
  put(writer, (seen.pos.x - player.pos.x) / RL.distanceScale);
  put(writer, (seen.pos.z - player.pos.z) / RL.distanceScale);
  put(writer, gap(player.pos, seen.pos) / RL.distanceScale);
  put(writer, numbers.life);
  put(writer, numbers.maxLife);
  put(writer, numbers.damage);
  put(writer, numbers.moveSpeed);
  put(writer, numbers.radius);
  flag(writer, numbers.aggro);
  flag(writer, numbers.acting);
  put(writer, numbers.windupLeft);
  put(writer, numbers.reach);
  put(writer, numbers.area);
  flag(writer, numbers.boss);
  flag(writer, numbers.rank);
  flag(writer, numbers.stunned);
  put(writer, numbers.dir.x);
  put(writer, numbers.dir.z);
  put(writer, numbers.speed);
  put(writer, numbers.timeLeft);
  flag(writer, seen.type === 'remembered');
  writeLoot(writer, world, player, seen, rule);
  writeFoe(writer, world, player, seen);
  oneHot(writer, Object.keys(BEHAVIOUR_ORDER).length, numbers.behaviour);
  blank(writer, RL.spareEntity);
}

function writeRays(writer: Writer, world: World, hero: PlayerState): void {
  const from: Vec2 = hero.pos;
  for (let ray: number = 0; ray < RL.rays; ray += 1) {
    const angle: number = (ray / RL.rays) * Math.PI * 2;
    let reach: number = 0;
    while (reach < RL.rayReach && isWalkable(world.grid, from.x + Math.cos(angle) * (reach + RL.rayStep), from.z + Math.sin(angle) * (reach + RL.rayStep))) reach += RL.rayStep;
    put(writer, reach / RL.rayReach);
  }
}

function flaskReady(hero: PlayerState, flask: FlaskState | undefined): boolean {
  return flask !== undefined && blockedFlask(hero, flask) === null;
}

export function actionMask(world: World, view: View): Uint8Array {
  const mask: Uint8Array = new Uint8Array(LAYOUT.mask);
  const player: PlayerState = view.hero;
  const alive: boolean = player.alive;
  let at: number = 0;
  for (let move: number = 0; move < MOVE_CHOICES; move += 1) mask[at + move] = move === 0 || alive ? 1 : 0;
  at += MOVE_CHOICES;
  for (let choice: number = 0; choice < SKILL_CHOICES; choice += 1) {
    const skill: SkillDef | null = choice === 0 ? null : (player.skills[choice - 1] ?? null);
    mask[at + choice] = choice === 0 || (alive && skill !== null && blockedReason(player, skill) === null) ? 1 : 0;
  }
  at += SKILL_CHOICES;
  for (let target: number = 0; target < RL.targets; target += 1) mask[at + target] = target === 0 || target < view.targets.length ? 1 : 0;
  at += RL.targets;
  for (let choice: number = 0; choice <= RL.flasks; choice += 1) mask[at + choice] = choice === 0 || (alive && flaskReady(player, player.flasks[choice - 1])) ? 1 : 0;
  mask[at + PICKUP_CHOICE] = alive && view.pickup !== null && isPrimary(world, player) ? 1 : 0;
  return mask;
}

export function observe(world: World, context: ObserveContext, hero: PlayerState): Observation {
  const view: View = viewOf(world, hero, context.objective, context.pickup);
  const writer: Writer = { out: new Float32Array(LAYOUT.size), at: 0 };
  writeSelf(writer, world, context, view);
  for (let slot: number = 0; slot < RL.slots; slot += 1) writeSlot(writer, hero, slot);
  for (let index: number = 0; index < RL.entities; index += 1) writeEntity(writer, world, hero, view.seen[index], context.pickup);
  const remembered: Seen[] = rememberedFoes(world, context.recall, view);
  for (let index: number = 0; index < RL.remembered; index += 1) writeEntity(writer, world, hero, remembered[index], context.pickup);
  writeRays(writer, world, hero);
  if (writer.at !== LAYOUT.size) throw new Error(`observation wrote ${writer.at} of ${LAYOUT.size} numbers`);
  return { obs: writer.out, mask: actionMask(world, view), view };
}

import { riseFrom } from './run-rise.ts';
import { EMPTY_BUFFER } from './press-buffer.ts';
import type { TailwindShares } from './tailwind.ts';
import { endTailwind, feedTailwind, tailwindShares } from './tailwind.ts';
import { PLAYER_SIDE } from '../content/combat-types.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { SkillDef } from '../content/types.ts';
import type { RecoveryDef } from '../content/combat-types.ts';
import { rollDrop } from './loot.ts';
import type { RunReward } from '../content/run-table-types.ts';
import { runReward, settleCleared } from './run-state.ts';
import { liftsNext, makeItem } from './ledger.ts';
import type { ItemSource } from './ledger.ts';
import type { MonsterRank } from '../content/rank-types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, dot } from '../math.ts';
import { resolveSkill } from '../stats.ts';
import { elementOf, heroTaken, monsterTaken } from './element.ts';
import { grantXp, killReduction, killXp, refreshHero } from './character.ts';
import { firePowers } from '../powers.ts';
import { isDashing, isInvulnerable, rollsSteady } from './dash.ts';
import { knockTime, readablePush } from './movement.ts';
import { closeDialogue } from './dialogue.ts';
import type { Side } from './factions.ts';
import { mayStrike, provoke, regardOf } from './factions.ts';
import { gainFlaskCharges } from './flask-charges.ts';
import { dropOnGround } from './ground.ts';
import { afterHold, afterInterrupt, holdScale, recovering, steadiness, unbroken } from './poise.ts';
import { settleTurn, steadied } from './momentum.ts';
import { flinchTogether } from './unison.ts';
import { dealtScale } from './weaken.ts';
import { exposedScale } from './aura.ts';
import { leechActor, mendActor } from './mend.ts';
import { leechScale, stunMonster, stunned } from './stun.ts';
import { holdLine, openScale, rouseKeepers, strike } from './count.ts';
import type { ActionState, Actor, BrandState, BurnState, GuardOutcome, ItemInstance, MonsterState, Offence, PlayerState, Team, World } from './types.ts';
import { sameFloor } from './floors.ts';
import { findHero } from './heroes.ts';

export const COMBAT = {
  guardedKnockback: 0.2,
  flingBase: 2.5,
  flingPerOverkill: 6,
  flingMost: 11,
} as const;

export function corpseFling(overkill: number, maxLife: number): number {
  const share: number = maxLife > 0 ? Math.max(0, overkill) / maxLife : 0;
  return Math.min(COMBAT.flingMost, COMBAT.flingBase + COMBAT.flingPerOverkill * share);
}

function flingCorpse(target: MonsterState, direction: ReadonlyVec2, overkill: number): void {
  const speed: number = corpseFling(overkill, target.maxLife) * steadiness(target);
  target.knock.x += direction.x * speed;
  target.knock.z += direction.z * speed;
}

export type { Offence } from './types.ts';

export function teamOf(actor: Actor): Team {
  return actor.kind;
}

export function offenceOf(actor: Actor): Offence {
  if (actor.kind === 'player') {
    return {
      sourceId: actor.id,
      team: 'player',
      faction: null,
      damageMin: actor.stats.damageMin,
      damageMax: actor.stats.damageMax,
      damagePercent: actor.stats.damagePercent,
      critChance: actor.stats.critChance,
      critMultiplier: actor.stats.critMultiplier,
    };
  }
  return { sourceId: actor.id, team: 'monster', faction: actor.def.faction, damageMin: actor.damageMin, damageMax: actor.damageMax, damagePercent: 0, critChance: 0, critMultiplier: 1 };
}

export function collateralScale(offence: Side, target: MonsterState): number {
  const behaviour = target.def.behaviour;
  return behaviour.type === 'fixed' && offence.faction !== null ? behaviour.collateral : 1;
}

function struckBeside(offence: Side, actor: Actor): boolean {
  return actor.kind === 'monster' && actor.alive && !actor.sealed && actor.id !== offence.sourceId && offence.faction !== null && collateralScale(offence, actor) > 0 && actor.def.behaviour.type === 'fixed';
}

function strikable(world: World, offence: Side, actor: Actor): boolean {
  return !isInvulnerable(actor) && (mayStrike(world, offence, actor) || struckBeside(offence, actor));
}

export type TargetFilter = (actor: Actor) => boolean;

export function targetsWhere(world: World, offence: Side, near: TargetFilter): Actor[] {
  const found: Actor[] = [];
  for (const hero of world.heroes) if (near(hero) && strikable(world, offence, hero)) found.push(hero);
  for (const monster of world.monsters) if (near(monster) && strikable(world, offence, monster)) found.push(monster);
  return found;
}

function anyone(): boolean {
  return true;
}

export function targetsOf(world: World, offence: Side): Actor[] {
  return targetsWhere(world, offence, anyone);
}

export function setTempo(actor: Actor, scale: number, time: number): void {
  if (scale < actor.tempo || actor.tempoTime <= 0) {
    actor.tempo = scale;
    actor.tempoTime = time;
    return;
  }
  if (scale === actor.tempo) actor.tempoTime = Math.max(actor.tempoTime, time);
}

export function findActor(world: World, id: number): Actor | null {
  const hero: PlayerState | null = findHero(world, id);
  if (hero !== null) return hero;
  return world.monsters.find((monster: MonsterState): boolean => monster.id === id) ?? null;
}

export function aggroPack(world: World, monster: MonsterState): void {
  for (const other of world.monsters) {
    if (other.packId !== monster.packId || other.aggro || !other.alive) continue;
    other.aggro = true;
    world.events.push({ type: 'aggro', monsterId: other.id });
  }
}

function liftedFloor(world: World, reward: RunReward): string | null {
  if (reward.rarity <= 0 || !liftsNext(world, reward.rarity)) return null;
  return world.content.rarities[1]?.id ?? null;
}

function rollLoot(world: World, monster: MonsterState, reward: RunReward, loot: number): number {
  if (monster.revived) return 0;
  const drops = monster.def.loot;
  let gold: number = 0;
  if (world.rng.chance(drops.goldChance)) {
    const scale: number = (1 + world.content.world.scaling.xpPerLevel * (monster.level - 1)) * (1 + world.player.stats.goldFind) * (1 + reward.gold) * (1 + loot);
    gold = Math.max(1, Math.round(world.rng.int(drops.goldMin, drops.goldMax) * scale));
    dropOnGround(world, monster.pos, { kind: 'gold', amount: gold });
  }
  const level: number = Math.max(monster.level, world.player.level);
  if (world.rng.chance(Math.min(1, drops.itemChance * (1 + reward.items) * (1 + loot)))) {
    const floor: string | null = liftedFloor(world, reward);
    const source: ItemSource = floor === null ? { kind: 'monster', monster: monster.def.id, zone: world.zone.id } : { kind: 'lifted', monster: monster.def.id, zone: world.zone.id, floor };
    const item: ItemInstance | null = rollDrop(world, level, null, source, floor);
    if (item !== null) dropOnGround(world, monster.pos, { kind: 'item', item });
  }
  const rank: MonsterRank | null = monster.def.rank;
  if (rank === null || rank.items === 0) return gold;
  const source: ItemSource = rank.floor === null ? { kind: 'monster', monster: monster.def.id, zone: world.zone.id } : { kind: 'leader', monster: monster.def.id, zone: world.zone.id, rank: rank.id };
  for (let dropped: number = 0; dropped < rank.items; dropped += 1) {
    const item: ItemInstance | null = makeItem(world, level, null, null, source, world.rng, rank.floor);
    if (item !== null) dropOnGround(world, monster.pos, { kind: 'item', item });
  }
  return gold;
}

export function kill(world: World, target: Actor, direction: ReadonlyVec2, sourceId: number | null = null): void {
  target.alive = false;
  target.life = 0;
  if (target.kind === 'monster' && target.def.boss?.yields === true) target.yielded = true;
  if (target.action !== null) settleTurn(target, target.action);
  target.action = null;
  target.moving = false;
  target.deadTime = 0;
  world.events.push({ type: 'death', actorId: target.id, team: teamOf(target), pos: { x: target.pos.x, z: target.pos.z }, direction: { x: direction.x, z: direction.z } });
  if (target.kind === 'player') {
    closeDialogue(world, false);
    target.momentum = { skill: null, value: 0, quiet: 0 };
    endTailwind(world, 'fell');
    target.intent = { type: 'idle' };
    target.path = [];
    target.buffered = EMPTY_BUFFER;
    return;
  }
  flinchTogether(world, target);
  if (regardOf(world.content, PLAYER_SIDE, target.def.faction) !== 'hostile') return;
  const killer: PlayerState = (sourceId === null ? null : findHero(world, sourceId)) ?? world.player;
  killer.kills += 1;
  gainFlaskCharges(killer);
  const reward: RunReward = runReward(world);
  const shares: TailwindShares = tailwindShares(world);
  const gold: number = rollLoot(world, target, reward, shares.loot);
  const xp: number = Math.round(killXp(world, target.def.xp, target.level) * (1 + reward.xp) * (1 + shares.xp));
  feedTailwind(world, target, xp, gold);
  grantXp(world, xp, killReduction(world, target.level));
  riseFrom(world, target);
  settleCleared(world);
}

export function guardOutcome(target: Actor, skill: SkillDef, direction: ReadonlyVec2): GuardOutcome {
  if (target.kind !== 'monster' || target.def.guard === null || target.stagger > 0 || stunned(target) || target.action?.phase === 'recovery') return 'open';
  const front: number = dot(directionOf(target.facing), { x: -direction.x, z: -direction.z });
  if (front < Math.cos((target.def.guard.arcDegrees / 2) * DEGREES_TO_RADIANS)) return 'open';
  return skill.stagger >= target.def.guard.breakStagger ? 'broken' : 'blocked';
}

function staggerOf(target: MonsterState, skill: SkillDef, guard: GuardOutcome): number {
  if (target.def.boss !== null) return 0;
  switch (guard) {
    case 'open':
      return skill.stagger * target.def.poise.stagger;
    case 'blocked':
      return 0;
    case 'broken':
      return Math.max(skill.stagger, target.def.guard?.breakTime ?? 0);
  }
  return 0;
}

export function holdsFirm(target: MonsterState, skill: SkillDef, guard: GuardOutcome): boolean {
  const action: ActionState | null = target.action;
  if (guard === 'broken' || action === null || action.phase !== 'windup' || action.skill.commit === null) return false;
  if (skill.stagger >= action.skill.commit.breakStagger) return false;
  const resolved: boolean = target.def.poise.resolve > 0 && target.interrupts >= target.def.poise.resolve;
  return resolved || action.elapsed >= action.windup * action.skill.commit.at;
}

function knockBack(target: Actor, push: ReadonlyVec2): boolean {
  if (target.action !== null && !isDashing(target)) return false;
  const knock: ReadonlyVec2 = { x: target.knock.x + push.x, z: target.knock.z + push.z };
  if (!readablePush(knock) && knockTime(target) <= 0) return false;
  target.knock.x = knock.x;
  target.knock.z = knock.z;
  return true;
}

function holdMonster(world: World, target: MonsterState, skill: SkillDef, guard: GuardOutcome, push: ReadonlyVec2, steady: boolean): void {
  if (recovering(target) || unbroken(target)) return;
  const recovery: RecoveryDef = world.content.world.recovery;
  const scale: number = holdScale(recovery, target);
  const stagger: number = staggerOf(target, skill, guard) * scale;
  const staggered: boolean = stagger > 0 && !holdsFirm(target, skill, guard);
  if (staggered) {
    target.stagger = Math.max(target.stagger, stagger);
    if (target.action?.phase === 'windup') {
      target.interrupts += 1;
      settleTurn(target, target.action);
      afterInterrupt(recovery, target);
      target.action = null;
      world.events.push({ type: 'skill_interrupt', actorId: target.id });
    }
  }
  const pushed: boolean = !steady && knockBack(target, { x: push.x * scale, z: push.z * scale });
  afterHold(recovery, target, Math.max(staggered ? target.stagger : 0, pushed ? knockTime(target) : 0));
}

function mendSource(world: World, offence: Offence, target: Actor, skill: SkillDef, dealt: number): void {
  if (skill.lifeOnHit <= 0 && skill.leech <= 0) return;
  const source: Actor | null = findActor(world, offence.sourceId);
  if (source === null || source === target || !source.alive) return;
  const leech: number = target.kind === 'monster' ? leechScale(world.content.world.recovery, target) : 1;
  mendActor(world, source, skill.lifeOnHit);
  leechActor(world, source, dealt * skill.leech * leech);
}

export function versusScale(world: World, striker: Actor | null, target: Actor): number {
  return target.kind === 'player' && striker?.kind === 'player' ? (world.zone.duel?.heroDamage ?? 1) : 1;
}

export function knockGraced(striker: Actor | null, target: Actor): boolean {
  return striker?.kind === 'player' && target.kind === 'player' && target.knockGrace > 0;
}

export function applyHit(world: World, offence: Offence, target: Actor, skill: SkillDef, direction: ReadonlyVec2): boolean {
  if (!target.alive || (target.kind === 'player' && (target.invulnerable > 0 || attacksHeld(world)))) return false;
  const guard: GuardOutcome = guardOutcome(target, skill, direction);
  const guarded: number = guard === 'blocked' && target.kind === 'monster' ? (target.def.guard?.damageTaken ?? 1) : 1;
  const weapon: number = world.rng.range(offence.damageMin, offence.damageMax) * (1 + offence.damagePercent) * skill.damage.weaponPercent;
  const flat: number = world.rng.range(skill.damage.flatMin, skill.damage.flatMax);
  const crit: boolean = world.rng.chance(offence.critChance);
  const striker: Actor | null = findActor(world, offence.sourceId);
  const mitigation: number = target.kind === 'player' ? heroTaken(target.stats, skill.damage.type, elementOf(striker), world.content.player.resistance, world.zone.stormTier) : monsterTaken(target.def.element, skill.damage.type);
  const weakened: number = striker === null ? 1 : dealtScale(world, striker);
  const exposed: number = target.kind === 'monster' ? openScale(world, target) * collateralScale(offence, target) : 1;
  const versus: number = versusScale(world, striker, target);
  const charged: number = exposedScale(world, striker, target, skill);
  const rolled: number = Math.max(1, Math.round((weapon + flat) * (crit ? offence.critMultiplier : 1) * mitigation * guarded * weakened * exposed * versus * charged));
  const amount: number = target.kind === 'monster' ? holdLine(world, target, strike(world, target, rolled)) : rolled;
  const dealt: number = Math.max(0, Math.min(amount, target.life));
  target.life -= amount;
  const poise: number = steadiness(target) * (guard === 'blocked' ? COMBAT.guardedKnockback : 1);
  const push: ReadonlyVec2 = { x: direction.x * skill.knockback * poise, z: direction.z * skill.knockback * poise };
  const steady: boolean = steadied(target) || rollsSteady(target);
  if (skill.root > 0 && target.kind === 'player' && target.rootGrace <= 0 && !steady) {
    target.root = Math.max(target.root, skill.root);
    target.rootGrace = target.root + world.content.player.rootGrace;
  }
  if (skill.hold > 0 && !steady) setTempo(target, 0, skill.hold);
  if (target.kind === 'monster') {
    target.calm = 0;
    provoke(world, target, offence.sourceId, offence.faction ?? PLAYER_SIDE);
    holdMonster(world, target, skill, guard, push, steady);
    if (skill.stun > 0 && target.life > 0) stunMonster(world, target, skill.stun);
    if (guard !== 'open') world.events.push({ type: 'guarded', monsterId: target.id, broken: guard === 'broken', pos: { x: target.pos.x, z: target.pos.z }, direction: { x: direction.x, z: direction.z } });
    if (!target.aggro) {
      target.aggro = true;
      world.events.push({ type: 'aggro', monsterId: target.id });
    }
    aggroPack(world, target);
    rouseKeepers(world, target, offence.sourceId, offence.faction);
  }
  const heroShove: boolean = target.kind === 'player' && !steady && readablePush(push);
  const shoveGraced: boolean = heroShove && knockGraced(striker, target);
  if (target.kind === 'player' && !steady && !shoveGraced && knockBack(target, push) && heroShove && striker?.kind === 'player') target.knockGrace = world.content.player.knockGrace;
  mendSource(world, offence, target, skill, dealt);
  const killed: boolean = target.life <= 0;
  world.events.push({
    type: 'damage',
    targetId: target.id,
    sourceId: offence.sourceId,
    targetTeam: teamOf(target),
    amount,
    crit,
    killed,
    pos: { x: target.pos.x, z: target.pos.z },
    direction: { x: direction.x, z: direction.z },
    skill,
    burn: false,
    shoveGraced,
  });
  if (killed) {
    kill(world, target, direction, offence.sourceId);
    if (target.kind === 'monster') flingCorpse(target, direction, amount - dealt);
  } else {
    ignite(world, offence, target, skill, amount);
    drench(world, target, skill);
  }
  if (striker?.kind === 'player' && target.kind === 'monster') powersOnHit(world, striker, target, skill, killed);
  if (target.kind === 'player' && !killed && striker?.kind === 'monster' && firePowers(world, target, { on: 'struck', skill, target: striker, at: { x: target.pos.x, z: target.pos.z } })) refreshHero(world, target);
  brandStrike(world, offence, target, skill);
  return true;
}

export function burnTicks(skill: SkillDef): number {
  return skill.burn === null ? 0 : Math.max(1, Math.floor(skill.burn.duration / skill.burn.tick + 1e-9));
}

export function ignite(world: World, offence: Offence, target: Actor, skill: SkillDef, amount: number): void {
  if (skill.burn === null || !target.alive) return;
  const perTick: number = Math.max(1, Math.round(amount * skill.burn.share));
  const ticks: number = burnTicks(skill);
  const held: BurnState | null = target.burn;
  if (held !== null && held.source === skill.id) {
    held.perTick = Math.max(held.perTick, perTick);
    held.ticksLeft = ticks;
    held.tickLeft = skill.burn.tick;
  } else if (held !== null && held.perTick * held.ticksLeft >= perTick * ticks) {
    return;
  } else {
    target.burn = { source: skill.id, skill, offence, perTick, tickLeft: skill.burn.tick, ticksLeft: ticks };
  }
  world.events.push({ type: 'burn', targetId: target.id, skill, pos: { x: target.pos.x, z: target.pos.z }, duration: ticks * skill.burn.tick });
}

export function drench(world: World, target: Actor, skill: SkillDef): void {
  if (skill.soak === null || !target.alive) return;
  setTempo(target, skill.soak.tempo, skill.soak.duration);
  world.events.push({ type: 'soak', targetId: target.id, skill, pos: { x: target.pos.x, z: target.pos.z }, duration: skill.soak.duration });
}

function powersOnHit(world: World, hero: PlayerState, target: Actor, skill: SkillDef, killed: boolean): void {
  const at: ReadonlyVec2 = { x: target.pos.x, z: target.pos.z };
  const hit: boolean = firePowers(world, hero, { on: 'hit', skill, target, at });
  const slain: boolean = killed && firePowers(world, hero, { on: 'kill', skill, target, at });
  if (hit || slain) refreshHero(world, hero);
}

function heroBurst(world: World, offence: Offence, burst: SkillDef): SkillDef {
  const hero: PlayerState = findHero(world, offence.sourceId) ?? world.player;
  return resolveSkill(world.content, burst, hero.allocated, [], [], hero.wielding, hero.changes);
}

function burstBrand(world: World, target: Actor, brand: BrandState): void {
  const delivery = brand.burst.delivery;
  if (delivery.type !== 'nova') return;
  const at: ReadonlyVec2 = { x: target.pos.x, z: target.pos.z };
  world.events.push({ type: 'brand', targetId: target.id, skill: brand.burst, pos: { x: at.x, z: at.z }, burst: true });
  const near: TargetFilter = (other: Actor): boolean => !(Math.hypot(other.pos.x - at.x, other.pos.z - at.z) > delivery.radius + other.radius) && sameFloor(world, at, other.pos);
  for (const other of targetsWhere(world, brand.offence, near)) {
    const offset: ReadonlyVec2 = { x: other.pos.x - at.x, z: other.pos.z - at.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    if (gap > delivery.radius + other.radius || !sameFloor(world, at, other.pos)) continue;
    applyHit(world, brand.offence, other, brand.burst, gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 });
  }
}

function brandStrike(world: World, offence: Offence, target: Actor, skill: SkillDef): void {
  const held: BrandState | null = target.brand;
  if (held !== null && held.source !== skill.id) {
    target.brand = null;
    burstBrand(world, target, held);
  }
  if (skill.brand === null || !target.alive) return;
  const burst: SkillDef | undefined = world.content.skills.get(skill.brand.burst);
  if (burst === undefined) return;
  target.brand = { source: skill.id, burst: offence.team === 'player' ? heroBurst(world, offence, burst) : burst, offence, timeLeft: skill.brand.duration };
  world.events.push({ type: 'brand', targetId: target.id, skill, pos: { x: target.pos.x, z: target.pos.z }, burst: false });
}

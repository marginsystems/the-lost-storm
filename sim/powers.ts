import type { BuffEffect, CastEffect, Content, FamilyDef, ItemBaseDef, ItemSlot, PowerDef, PowerTrigger, PowerTriggerDef, RarityDef, SkillDef, SkillTarget, StatMod } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { familyPieces } from './content/power-rules.ts';
import { baseOf, rarityOf } from './items.ts';
import type { ReadonlyVec2 } from './math.ts';
import { directionOf } from './math.ts';
import { inGroup, resolveSkill } from './stats.ts';
import type { Actor, BuffState, Equipment, ItemInstance, PlayerState, PowerState, World } from './world/types.ts';

export interface WornPower {
  readonly key: string;
  readonly power: PowerDef;
}

export interface PowerEvent {
  readonly on: PowerTrigger;
  readonly skill: SkillDef;
  readonly target: Actor | null;
  readonly at: ReadonlyVec2;
}

export function emptyPowerState(): PowerState {
  return { buffs: [], cooldowns: {}, counts: {} };
}

export function wornPowerList(content: Content, equipped: Equipment): WornPower[] {
  const worn: WornPower[] = [];
  for (const slot of ITEM_SLOTS) {
    const item: ItemInstance | null = equipped[slot];
    const power: PowerDef | null = item === null ? null : (baseOf(content, item)?.power ?? null);
    if (item !== null && power !== null) worn.push({ key: item.base, power });
  }
  return worn;
}

export function wornPowers(content: Content, equipped: Equipment): PowerDef[] {
  return wornPowerList(content, equipped).map((worn: WornPower): PowerDef => worn.power);
}

export function buffMods(state: PowerState): StatMod[] {
  return state.buffs.map((held: BuffState): StatMod => ({ stat: held.mod.stat, op: held.mod.op, value: held.mod.value * held.stacks }));
}

export function wouldPassLimit(content: Content, equipped: Equipment, item: ItemInstance): boolean {
  const rarity: RarityDef = rarityOf(content, item);
  if (rarity.wornLimit === null) return false;
  const base: ItemBaseDef | null = baseOf(content, item);
  const slot: ItemSlot | null = base?.slot ?? null;
  const others: number = ITEM_SLOTS.filter((other: ItemSlot): boolean => {
    const worn: ItemInstance | null = equipped[other];
    return other !== slot && worn !== null && worn.rarity === rarity.id;
  }).length;
  return others + 1 > rarity.wornLimit;
}

function skillMatches(content: Content, target: SkillTarget | null, skill: string): boolean {
  if (target === null) return true;
  return target.type === 'skill' ? target.skill === skill : inGroup(content, target.group, skill);
}

function targetMatches(content: Content, trigger: PowerTriggerDef, target: Actor | null): boolean {
  switch (trigger.target) {
    case 'any':
      return true;
    case 'echo':
      return target !== null && target.kind === 'monster' && target.def.faction === content.moments.faction;
  }
  return false;
}

function cast(world: World, effect: CastEffect, at: ReadonlyVec2): void {
  const player: PlayerState = world.player;
  const def: SkillDef | undefined = world.content.skills.get(effect.skill);
  if (def === undefined) return;
  const skill: SkillDef = resolveSkill(world.content, def, player.allocated, wornPowers(world.content, player.equipped));
  const origin: ReadonlyVec2 = effect.at === 'caster' ? player.pos : at;
  const facing: ReadonlyVec2 = directionOf(player.facing);
  world.echoes.push({
    ownerId: player.id,
    team: 'player',
    faction: null,
    skill,
    origin: { x: origin.x, z: origin.z },
    direction: { x: facing.x, z: facing.z },
    target: { x: origin.x, z: origin.z },
    damageMin: player.stats.damageMin,
    damageMax: player.stats.damageMax,
    damagePercent: player.stats.damagePercent,
    critChance: player.stats.critChance,
    critMultiplier: player.stats.critMultiplier,
    timeLeft: 0,
  });
}

function buff(state: PowerState, key: string, effect: BuffEffect): void {
  const held: BuffState | undefined = state.buffs.find((entry: BuffState): boolean => entry.key === key);
  if (held !== undefined) {
    held.stacks = Math.min(effect.stacks, held.stacks + 1);
    held.timeLeft = effect.duration;
    return;
  }
  state.buffs.push({ key, mod: { stat: effect.stat, op: effect.op, value: effect.value }, stacks: 1, timeLeft: effect.duration });
}

function ready(state: PowerState, key: string, trigger: PowerTriggerDef): boolean {
  if ((state.cooldowns[key] ?? 0) > 0) return false;
  const count: number = (state.counts[key] ?? 0) + 1;
  state.counts[key] = count % trigger.every;
  if (count < trigger.every) return false;
  if (trigger.cooldown > 0) state.cooldowns[key] = trigger.cooldown;
  return true;
}

export function firePowers(world: World, event: PowerEvent): boolean {
  const player: PlayerState = world.player;
  let buffed: boolean = false;
  for (const worn of wornPowerList(world.content, player.equipped)) {
    worn.power.triggers.forEach((trigger: PowerTriggerDef, index: number): void => {
      if (trigger.on !== event.on || !skillMatches(world.content, trigger.skill, event.skill.id) || !targetMatches(world.content, trigger, event.target)) return;
      const key: string = `${worn.key}:${index}`;
      if (!ready(player.powers, key, trigger)) return;
      const effect = trigger.effect;
      switch (effect.type) {
        case 'cast':
          cast(world, effect, event.at);
          return;
        case 'buff':
          buff(player.powers, key, effect);
          buffed = true;
          return;
      }
    });
  }
  return buffed;
}

export function stepPowerState(state: PowerState, dt: number): boolean {
  for (const key of Object.keys(state.cooldowns)) {
    const left: number = (state.cooldowns[key] ?? 0) - dt;
    if (left > 0) state.cooldowns[key] = left;
    else Reflect.deleteProperty(state.cooldowns, key);
  }
  const before: number = state.buffs.length;
  for (const held of state.buffs) held.timeLeft -= dt;
  state.buffs = state.buffs.filter((held: BuffState): boolean => held.timeLeft > 0);
  return state.buffs.length !== before;
}

export interface FamilyPiece {
  readonly name: string;
  readonly worn: boolean;
}

export interface FamilyReading {
  readonly name: string;
  readonly text: string;
  readonly count: number;
  readonly pieces: readonly FamilyPiece[];
}

export function familyReading(content: Content, item: ItemInstance, equipped: Equipment): FamilyReading | null {
  const power: PowerDef | null = baseOf(content, item)?.power ?? null;
  if (power === null) return null;
  const family: FamilyDef | undefined = content.families.get(power.family);
  if (family === undefined) return null;
  const worn: ReadonlySet<string> = new Set<string>([item.base, ...ITEM_SLOTS.flatMap((slot: ItemSlot): string[] => {
    const held: ItemInstance | null = equipped[slot];
    return held === null ? [] : [held.base];
  })]);
  const pieces: FamilyPiece[] = familyPieces(content, family.id).map((base: ItemBaseDef): FamilyPiece => ({ name: base.name, worn: worn.has(base.id) }));
  return { name: family.name, text: power.text, count: pieces.filter((piece: FamilyPiece): boolean => piece.worn).length, pieces };
}

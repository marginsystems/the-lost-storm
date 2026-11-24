import type { BuffEffect, CastEffect, Content, EmpowerEffect, FamilyDef, ItemBaseDef, ItemSlot, PowerDef, PowerTrigger, PowerTriggerDef, RarityDef, RestoreEffect, SkillDef, SkillMod, SkillTarget, SkillTreeNodeDef, SkillVariant, StatMod } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { familyPieces } from './content/power-rules.ts';
import { baseOf, rarityOf } from './items.ts';
import type { ReadonlyVec2 } from './math.ts';
import { directionOf } from './math.ts';
import { allocatedNodes, inGroup, resolveLeft, resolveSkill } from './stats.ts';
import type { Actor, BuffState, EmpowerState, Equipment, ItemInstance, PlayerState, PowerState, World } from './world/types.ts';
import { addFlaskCharges } from './world/flask-charges.ts';
import { findHero } from './world/heroes.ts';

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
  return { buffs: [], empowers: [], cooldowns: {}, counts: {}, stances: [] };
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

export function heldPowers(content: Content, equipped: Equipment, state: PowerState): PowerDef[] {
  const worn: PowerDef[] = wornPowers(content, equipped);
  if (state.empowers.length === 0) return worn;
  return [...worn, { family: '', text: '', skillMods: state.empowers.flatMap((held: EmpowerState): readonly SkillMod[] => held.skillMods), variants: [], triggers: [] }];
}

export function wornVariants(content: Content, equipped: Equipment): SkillVariant[] {
  return ITEM_SLOTS.flatMap((slot: ItemSlot): readonly SkillVariant[] => {
    const item: ItemInstance | null = equipped[slot];
    return item === null ? [] : (baseOf(content, item)?.variants ?? []);
  });
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

function nameMatches(content: Content, target: SkillTarget, name: string): boolean {
  return target.type === 'skill' ? target.skill === name : inGroup(content, target.group, name);
}

function skillMatches(content: Content, target: SkillTarget | null, skill: SkillDef): boolean {
  if (target === null) return true;
  return nameMatches(content, target, skill.id) || nameMatches(content, target, skill.form);
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

export function leftBehind(world: World, sourceId: number, parent: SkillDef, left: SkillDef): SkillDef {
  const hero: PlayerState | null = findHero(world, sourceId);
  if (hero === null) return left;
  return resolveLeft(world.content, parent, left, hero.allocated, heldPowers(world.content, hero.equipped, hero.powers), hero.wielding);
}

function cast(world: World, player: PlayerState, effect: CastEffect, at: ReadonlyVec2): void {
  const def: SkillDef | undefined = world.content.skills.get(effect.skill);
  if (def === undefined) return;
  const skill: SkillDef = resolveSkill(world.content, def, player.allocated, heldPowers(world.content, player.equipped, player.powers), wornVariants(world.content, player.equipped), player.wielding, player.changes);
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

function restore(player: PlayerState, effect: RestoreEffect): void {
  if (!player.alive) return;
  player.life = Math.min(player.maxLife, player.life + effect.life);
  player.mana = Math.min(player.stats.maxMana, player.mana + effect.mana);
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

function empower(state: PowerState, key: string, effect: EmpowerEffect): void {
  state.empowers = [...state.empowers.filter((held: EmpowerState): boolean => held.key !== key), { key, skillMods: effect.skillMods, look: effect.look, timeLeft: effect.duration }];
}

interface TriggerSource {
  readonly key: string;
  readonly triggers: readonly PowerTriggerDef[];
}

function triggerSources(content: Content, player: PlayerState): TriggerSource[] {
  const worn: TriggerSource[] = wornPowerList(content, player.equipped).map((held: WornPower): TriggerSource => ({ key: held.key, triggers: held.power.triggers }));
  const placed: TriggerSource[] = allocatedNodes(content, player.allocated, player.wielding).map((node: SkillTreeNodeDef): TriggerSource => ({ key: `place:${node.id}`, triggers: node.triggers }));
  return [...worn, ...placed].filter((source: TriggerSource): boolean => source.triggers.length > 0);
}

interface SourceCache {
  readonly content: Content;
  readonly worn: readonly (ItemInstance | null)[];
  readonly allocated: readonly string[];
  readonly wielding: string | null;
  readonly sources: readonly TriggerSource[];
}

const SOURCES: WeakMap<PlayerState, SourceCache> = new WeakMap<PlayerState, SourceCache>();

function sameWorn(worn: readonly (ItemInstance | null)[], equipped: Equipment): boolean {
  return ITEM_SLOTS.every((slot: ItemSlot, index: number): boolean => worn[index] === equipped[slot]);
}

function sameAllocated(held: readonly string[], allocated: readonly string[]): boolean {
  return held.length === allocated.length && held.every((id: string, index: number): boolean => allocated[index] === id);
}

function heldSources(content: Content, player: PlayerState): readonly TriggerSource[] {
  const held: SourceCache | undefined = SOURCES.get(player);
  if (held !== undefined && held.content === content && held.wielding === player.wielding && sameWorn(held.worn, player.equipped) && sameAllocated(held.allocated, player.allocated)) return held.sources;
  const sources: readonly TriggerSource[] = triggerSources(content, player);
  SOURCES.set(player, { content, worn: ITEM_SLOTS.map((slot: ItemSlot): ItemInstance | null => player.equipped[slot]), allocated: [...player.allocated], wielding: player.wielding, sources });
  return sources;
}

export function heldTriggers(content: Content, player: PlayerState): number {
  return heldSources(content, player).reduce((sum: number, source: TriggerSource): number => sum + source.triggers.length, 0);
}

function ready(state: PowerState, key: string, trigger: PowerTriggerDef): boolean {
  if ((state.cooldowns[key] ?? 0) > 0) return false;
  const count: number = (state.counts[key] ?? 0) + 1;
  state.counts[key] = count % trigger.every;
  if (count < trigger.every) return false;
  if (trigger.cooldown > 0) state.cooldowns[key] = trigger.cooldown;
  return true;
}

export function firePowers(world: World, player: PlayerState, event: PowerEvent): boolean {
  let buffed: boolean = false;
  for (const source of heldSources(world.content, player)) {
    source.triggers.forEach((trigger: PowerTriggerDef, index: number): void => {
      if (trigger.on !== event.on || !skillMatches(world.content, trigger.skill, event.skill) || !targetMatches(world.content, trigger, event.target)) return;
      const key: string = `${source.key}:${index}`;
      if (!ready(player.powers, key, trigger)) return;
      const effect = trigger.effect;
      switch (effect.type) {
        case 'cast':
          cast(world, player, effect, event.at);
          return;
        case 'buff':
          buff(player.powers, key, effect);
          buffed = true;
          return;
        case 'empower':
          empower(player.powers, key, effect);
          buffed = true;
          return;
        case 'flask':
          addFlaskCharges(player, effect.charges);
          return;
        case 'restore':
          restore(player, effect);
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
  const before: number = state.buffs.length + state.empowers.length;
  for (const held of state.buffs) held.timeLeft -= dt;
  for (const held of state.empowers) held.timeLeft -= dt;
  state.buffs = state.buffs.filter((held: BuffState): boolean => held.timeLeft > 0);
  state.empowers = state.empowers.filter((held: EmpowerState): boolean => held.timeLeft > 0);
  return state.buffs.length + state.empowers.length !== before;
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

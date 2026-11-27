import type { Content, EmpowerLook, ItemSlot, SkillDef, SkillMod, XpReduction } from '../content/types.ts';
import { isUnidentified } from '../identify.ts';
import { isStoryItem, slotOf } from '../items.ts';
import { applyXp, canAllocate, findNode, gapScale, heldChanges, offersChange, refundCost, refundState, respecCost, respecState, xpReduction } from '../progression.ts';
import type { ChartChange } from '../progression.ts';
import type { XpResult } from '../progression.ts';
import { assignSlot, chartSkills } from '../skill-book.ts';
import { computeStats, modTargets, resolveSkill, resolveSkillBar, variantChain } from '../stats.ts';
import { heldGroup } from '../weapons.ts';
import { buffMods, heldPowers, wornVariants, wouldPassLimit } from '../powers.ts';
import { heroStanceMods } from '../stances.ts';
import { countOf, fits, placeIn, stackSize, stacksWith, withCount } from '../stacks.ts';
import { dropOnGround } from './ground.ts';
import { forget, learn } from './learn.ts';
import { monsterXpScale } from './monster-xp.ts';
import type { EmpowerState, ItemInstance, PlayerState, World } from './types.ts';

export function refreshPlayer(world: World): void {
  refreshHero(world, world.player);
}

export function refreshHero(world: World, player: PlayerState): void {
  player.wielding = heldGroup(world.content, player.equipped);
  player.stats = computeStats(world.content, player.level, player.equipped, player.allocated, [...buffMods(player.powers), ...heroStanceMods(world.content, player)], player.wielding);
  player.skills = resolveSkillBar(world.content, player.bar, player.allocated, heldPowers(world.content, player.equipped, player.powers), wornVariants(world.content, player.equipped), player.wielding, player.changes);
  player.maxLife = player.stats.maxLife;
  player.life = Math.min(player.life, player.maxLife);
  player.mana = Math.min(player.mana, player.stats.maxMana);
  world.events.push({ type: 'character_changed' });
}

export function heldForm(content: Content, player: PlayerState, base: SkillDef): SkillDef {
  return resolveSkill(content, base, player.allocated, heldPowers(content, player.equipped, player.powers), wornVariants(content, player.equipped), player.wielding, player.changes);
}

export function heldLook(world: World, skillId: string): EmpowerLook | null {
  const player: PlayerState = world.player;
  const base: SkillDef | undefined = world.content.skills.get(skillId);
  if (base === undefined) return null;
  const through: readonly string[] = variantChain(world.content, base, player.allocated, heldPowers(world.content, player.equipped, player.powers), wornVariants(world.content, player.equipped), player.wielding, player.changes).through;
  const held: EmpowerState | undefined = player.powers.empowers.find((entry: EmpowerState): boolean => entry.look !== null && entry.skillMods.some((mod: SkillMod): boolean => modTargets(world.content, mod, through)));
  return held?.look ?? null;
}

export function killXp(world: World, xp: number, level: number, share: number = gapScale(world.content.player.xp.gap, world.player.level, level)): number {
  const gained: number = Math.round(xp * monsterXpScale(world.content.world.scaling, level) * share);
  return xp > 0 ? Math.max(1, gained) : gained;
}

export function bountyReduction(bounty: number, full: number, last: XpReduction | null): XpReduction | null {
  if (last === null || full <= 0 || bounty >= full) return null;
  return { side: last.side, share: bounty / full };
}

export function killReduction(world: World, level: number): XpReduction | null {
  return xpReduction(world.content.player.xp.gap, world.player.level, level);
}

export function grantXp(world: World, amount: number, reduced: XpReduction | null = null): void {
  const player: PlayerState = world.player;
  const result: XpResult = applyXp(world.content.player.xp, player.level, player.xp, amount);
  player.xp = result.xp;
  world.events.push({ type: 'xp', amount, reduced });
  if (result.levelsGained === 0) return;
  player.level = result.level;
  const points: number = result.levelsGained * world.content.chart.pointsPerLevel;
  player.skillPoints += points;
  world.events.push({ type: 'chart_point', source: 'level', points });
  refreshPlayer(world);
  player.life = player.maxLife;
  player.mana = player.stats.maxMana;
  world.events.push({ type: 'level_up', level: player.level });
}

export function addToInventory(world: World, item: ItemInstance): boolean {
  if (!fits(world.content, world.player.inventory, item)) return false;
  placeIn(world.content, world.player.inventory, item);
  return true;
}

export function equipFromInventory(world: World, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  if (item === null) return;
  const slot: ItemSlot | null = slotOf(world.content, item);
  if (slot === null) return;
  if (world.setAside !== null) {
    world.events.push({ type: 'notice', reason: 'duel_gear' });
    return;
  }
  if (isUnidentified(item)) {
    world.events.push({ type: 'notice', reason: 'unidentified' });
    return;
  }
  if (wouldPassLimit(world.content, player.equipped, item)) {
    world.events.push({ type: 'notice', reason: 'legendary_limit' });
    return;
  }
  player.inventory[inventoryIndex] = player.equipped[slot];
  player.equipped[slot] = item;
  refreshPlayer(world);
}

export function unequip(world: World, slot: ItemSlot): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.equipped[slot];
  if (item === null) return;
  if (world.setAside !== null) {
    world.events.push({ type: 'notice', reason: 'duel_gear' });
    return;
  }
  if (!addToInventory(world, item)) {
    world.events.push({ type: 'notice', reason: 'inventory_full' });
    return;
  }
  player.equipped[slot] = null;
  refreshPlayer(world);
}

export function dropFromInventory(world: World, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  if (item === null || isStoryItem(world.content, item)) return;
  player.inventory[inventoryIndex] = null;
  dropOnGround(world, player.pos, { kind: 'item', item }).discarded = true;
  world.events.push({ type: 'character_changed' });
}

export function arrangeInventory(world: World, from: number, to: number): void {
  const bag: (ItemInstance | null)[] = world.player.inventory;
  const item: ItemInstance | null = bag[from] ?? null;
  if (item === null || from === to || to < 0 || to >= bag.length) return;
  const there: ItemInstance | null = bag[to] ?? null;
  const taken: number = there === null || !stacksWith(world.content, there, item) ? 0 : Math.min(countOf(item), stackSize(world.content, there) - countOf(there));
  if (there !== null && taken > 0) {
    bag[to] = withCount(there, countOf(there) + taken);
    bag[from] = taken === countOf(item) ? null : withCount(item, countOf(item) - taken);
  } else {
    bag[to] = item;
    bag[from] = there;
  }
  world.events.push({ type: 'character_changed' });
}

export function slotSkill(world: World, slot: number, skill: string | null): void {
  const player: PlayerState = world.player;
  if (skill !== null && !player.learned.includes(skill)) return;
  if (player.action !== null && player.action.slot !== null) return;
  player.bar = assignSlot(player.bar, slot, skill);
  refreshPlayer(world);
}

export function allocateNode(world: World, nodeId: string): void {
  const player: PlayerState = world.player;
  if (!canAllocate(world.content, player.allocated, player.skillPoints, nodeId)) return;
  player.allocated.push(nodeId);
  player.skillPoints -= 1;
  const unlock: string | null = findNode(world.content, nodeId)?.unlock ?? null;
  if (unlock !== null) learn(world, unlock);
  refreshPlayer(world);
}

function pay(world: World, change: ChartChange, price: number): boolean {
  if (change === 'no_gold') world.events.push({ type: 'notice', reason: 'no_gold' });
  if (change !== 'ready') return false;
  world.player.gold -= price;
  return true;
}

export function refundNode(world: World, nodeId: string): void {
  const player: PlayerState = world.player;
  if (!pay(world, refundState(world.content, player, nodeId), refundCost(world.content, player.level, 1))) return;
  player.allocated = player.allocated.filter((id: string): boolean => id !== nodeId);
  player.skillPoints += 1;
  player.changes = heldChanges(world.content, player.allocated, player.changes);
  const unlock: string | null = findNode(world.content, nodeId)?.unlock ?? null;
  if (unlock !== null) forget(world, unlock);
  refreshPlayer(world);
}

export function respecChart(world: World): void {
  const player: PlayerState = world.player;
  const points: number = player.allocated.length;
  if (!pay(world, respecState(world.content, player), respecCost(world.content, player))) return;
  player.freeReset = false;
  for (const skill of chartSkills(world.content, player.allocated)) forget(world, skill);
  player.allocated = [];
  player.changes = {};
  player.skillPoints += points;
  refreshPlayer(world);
}

export function chooseChange(world: World, skill: string, becomes: string): void {
  const player: PlayerState = world.player;
  if (!offersChange(world.content, player.allocated, skill, becomes) || player.changes[skill] === becomes) return;
  player.changes = { ...player.changes, [skill]: becomes };
  refreshPlayer(world);
}

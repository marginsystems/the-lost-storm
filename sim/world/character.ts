import type { ItemSlot, XpReduction } from '../content/types.ts';
import { isStoryItem, slotOf } from '../items.ts';
import { applyXp, canAllocate, findNode, gapScale, refundCost, refundState, respecState, xpReduction } from '../progression.ts';
import type { ChartChange } from '../progression.ts';
import type { XpResult } from '../progression.ts';
import { assignSlot, chartSkills } from '../skill-book.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { buffMods, wornPowers, wornVariants, wouldPassLimit } from '../powers.ts';
import { dropOnGround } from './ground.ts';
import { forget, learn } from './learn.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';

export function refreshPlayer(world: World): void {
  const player: PlayerState = world.player;
  player.stats = computeStats(world.content, player.level, player.equipped, player.allocated, buffMods(player.powers));
  player.skills = resolveSkillBar(world.content, player.bar, player.allocated, wornPowers(world.content, player.equipped), wornVariants(world.content, player.equipped));
  player.maxLife = player.stats.maxLife;
  player.life = Math.min(player.life, player.maxLife);
  player.mana = Math.min(player.mana, player.stats.maxMana);
  world.events.push({ type: 'character_changed' });
}

export function killXp(world: World, xp: number, level: number, share: number = gapScale(world.content.player.xp.gap, world.player.level, level)): number {
  const gained: number = Math.round(xp * (1 + world.content.world.scaling.xpPerLevel * (level - 1)) * share);
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

export function addToInventory(player: PlayerState, item: ItemInstance): boolean {
  const free: number = player.inventory.indexOf(null);
  if (free < 0) return false;
  player.inventory[free] = item;
  return true;
}

export function equipFromInventory(world: World, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  if (item === null) return;
  const slot: ItemSlot | null = slotOf(world.content, item);
  if (slot === null) return;
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
  if (!addToInventory(player, item)) {
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
  dropOnGround(world, player.pos, { kind: 'item', item });
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

function pay(world: World, change: ChartChange, points: number): boolean {
  if (change === 'no_gold') world.events.push({ type: 'notice', reason: 'no_gold' });
  if (change !== 'ready') return false;
  world.player.gold -= refundCost(world.content, world.player.level, points);
  return true;
}

export function refundNode(world: World, nodeId: string): void {
  const player: PlayerState = world.player;
  if (!pay(world, refundState(world.content, player, nodeId), 1)) return;
  player.allocated = player.allocated.filter((id: string): boolean => id !== nodeId);
  player.skillPoints += 1;
  const unlock: string | null = findNode(world.content, nodeId)?.unlock ?? null;
  if (unlock !== null) forget(world, unlock);
  refreshPlayer(world);
}

export function respecChart(world: World): void {
  const player: PlayerState = world.player;
  const points: number = player.allocated.length;
  if (!pay(world, respecState(world.content, player), points)) return;
  for (const skill of chartSkills(world.content, player.allocated)) forget(world, skill);
  player.allocated = [];
  player.skillPoints += points;
  refreshPlayer(world);
}

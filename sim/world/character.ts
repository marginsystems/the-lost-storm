import type { ItemSlot } from '../content/types.ts';
import { slotOf } from '../items.ts';
import { applyXp, canAllocate, canRefund, findNode, refundCost } from '../progression.ts';
import type { XpResult } from '../progression.ts';
import { assignSlot, chartSkills } from '../skill-book.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { buffMods, wornPowers, wouldPassLimit } from '../powers.ts';
import { dropOnGround } from './ground.ts';
import { forget, learn } from './learn.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';

export function refreshPlayer(world: World): void {
  const player: PlayerState = world.player;
  player.stats = computeStats(world.content, player.level, player.equipped, player.allocated, buffMods(player.powers));
  player.skills = resolveSkillBar(world.content, player.bar, player.allocated, wornPowers(world.content, player.equipped));
  player.maxLife = player.stats.maxLife;
  player.life = Math.min(player.life, player.maxLife);
  player.mana = Math.min(player.mana, player.stats.maxMana);
  world.events.push({ type: 'character_changed' });
}

export function killXp(world: World, xp: number, level: number): number {
  return Math.round(xp * (1 + world.content.world.scaling.xpPerLevel * (level - 1)));
}

export function grantXp(world: World, amount: number): void {
  const player: PlayerState = world.player;
  const result: XpResult = applyXp(world.content.player.xp, player.level, player.xp, amount);
  player.xp = result.xp;
  world.events.push({ type: 'xp', amount });
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
  if (item === null) return;
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

function pay(world: World, points: number): boolean {
  const player: PlayerState = world.player;
  const cost: number = refundCost(world.content, player.level, points);
  if (player.gold < cost) {
    world.events.push({ type: 'notice', reason: 'no_gold' });
    return false;
  }
  player.gold -= cost;
  return true;
}

export function refundNode(world: World, nodeId: string): void {
  const player: PlayerState = world.player;
  if (!canRefund(world.content, player.allocated, nodeId) || !pay(world, 1)) return;
  player.allocated = player.allocated.filter((id: string): boolean => id !== nodeId);
  player.skillPoints += 1;
  const unlock: string | null = findNode(world.content, nodeId)?.unlock ?? null;
  if (unlock !== null) forget(world, unlock);
  refreshPlayer(world);
}

export function respecChart(world: World): void {
  const player: PlayerState = world.player;
  const points: number = player.allocated.length;
  if (points === 0 || !pay(world, points)) return;
  for (const skill of chartSkills(world.content, player.allocated)) forget(world, skill);
  player.allocated = [];
  player.skillPoints += points;
  refreshPlayer(world);
}

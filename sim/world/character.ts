import type { ItemSlot } from '../content/types.ts';
import { slotOf } from '../items.ts';
import { applyXp, canAllocate } from '../progression.ts';
import type { XpResult } from '../progression.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { dropOnGround } from './ground.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';

export function refreshPlayer(world: World): void {
  const player: PlayerState = world.player;
  player.stats = computeStats(world.content, player.level, player.equipped, player.allocated);
  player.skills = resolveSkillBar(world.content, player.allocated, player.equipped);
  player.maxLife = player.stats.maxLife;
  player.life = Math.min(player.life, player.maxLife);
  player.mana = Math.min(player.mana, player.stats.maxMana);
  world.events.push({ type: 'character_changed' });
}

export function grantXp(world: World, amount: number): void {
  const player: PlayerState = world.player;
  const result: XpResult = applyXp(world.content.player.xp, player.level, player.xp, amount);
  player.xp = result.xp;
  world.events.push({ type: 'xp', amount });
  if (result.levelsGained === 0) return;
  player.level = result.level;
  player.skillPoints += result.levelsGained;
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

export function allocateNode(world: World, nodeId: string): void {
  const player: PlayerState = world.player;
  if (!canAllocate(world.content, player.allocated, player.skillPoints, nodeId)) return;
  player.allocated.push(nodeId);
  player.skillPoints -= 1;
  refreshPlayer(world);
}

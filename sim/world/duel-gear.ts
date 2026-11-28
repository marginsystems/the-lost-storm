import type { ItemBaseDef, WeaponGroup } from '../content/types.ts';
import { ITEM_SLOTS } from '../content/types.ts';
import type { DuelKit, KitPiece } from '../rl/kit.ts';
import { DUEL_KIT, weaponGroupOf } from '../rl/kit.ts';
import { createRng } from '../rng.ts';
import { equipDuelFamily } from './duel-family.ts';
import { refreshPlayer } from './character.ts';
import type { Equipment, ItemInstance, PlayerState, World } from './types.ts';

function groupOf(world: World, item: ItemInstance | null): WeaponGroup | null {
  const base: ItemBaseDef | undefined = item === null ? undefined : world.content.itemBases.get(item.base);
  return base === undefined ? null : weaponGroupOf(world.content, base);
}

export function standardWeapon(world: World, kit: DuelKit, worn: ItemInstance | null): string | null {
  const group: WeaponGroup | null = groupOf(world, worn);
  if (group === null) return null;
  return kit.weapons.find((id: string): boolean => {
    const base: ItemBaseDef | undefined = world.content.itemBases.get(id);
    return base !== undefined && weaponGroupOf(world.content, base)?.id === group.id;
  }) ?? null;
}

export function standardPieces(world: World, kit: DuelKit, worn: Equipment): readonly KitPiece[] {
  const weapon: string | null = standardWeapon(world, kit, worn.weapon);
  return [...(weapon === null ? [] : [{ slot: 'weapon' as const, base: weapon }]), ...kit.armour];
}

export function wearDuelKit(world: World, kit: DuelKit = DUEL_KIT): void {
  if (world.setAside !== null) return;
  const player: PlayerState = world.player;
  world.setAside = { ...player.equipped };
  if (equipDuelFamily(world, createRng(world.rng.state()), kit)) return;
  const pieces: readonly KitPiece[] = standardPieces(world, kit, player.equipped);
  for (const slot of ITEM_SLOTS) player.equipped[slot] = null;
  for (const piece of pieces) {
    player.equipped[piece.slot] = { uid: world.nextItemUid, base: piece.base, rarity: kit.rarity, level: player.level, affixes: [], ledger: null };
    world.nextItemUid += 1;
  }
  refreshPlayer(world);
  if (!player.alive) return;
  player.life = player.maxLife;
  player.mana = player.stats.maxMana;
}

export function restoreDuelGear(world: World): void {
  const kept: Equipment | null = world.setAside;
  if (kept === null) return;
  const player: PlayerState = world.player;
  const share: number = player.maxLife > 0 ? player.life / player.maxLife : 1;
  const manaShare: number = player.stats.maxMana > 0 ? player.mana / player.stats.maxMana : 1;
  for (const slot of ITEM_SLOTS) player.equipped[slot] = kept[slot];
  world.setAside = null;
  refreshPlayer(world);
  if (!player.alive) return;
  player.life = Math.max(1, Math.round(player.maxLife * share));
  player.mana = player.stats.maxMana * manaShare;
}

import type { ItemBaseDef, ItemSlot, WeaponGroup } from '../content/types.ts';
import { ITEM_SLOTS } from '../content/types.ts';
import { generateItem } from '../items.ts';
import type { DuelKit } from '../rl/kit.ts';
import { DUEL_KIT, weaponGroupOf } from '../rl/kit.ts';
import type { Rng } from '../rng.ts';
import { refillHero } from './bench-hero.ts';
import { refreshPlayer } from './character.ts';
import type { ItemInstance, World } from './types.ts';

function rareBase(bases: readonly ItemBaseDef[], slot: ItemSlot, group: WeaponGroup, rng: Rng): ItemBaseDef {
  const choices: ItemBaseDef[] = bases.filter((base: ItemBaseDef): boolean => base.slot === slot && (slot !== 'weapon' || (base.weaponKind !== null && group.kinds.includes(base.weaponKind))));
  const base: ItemBaseDef | undefined = choices[rng.int(0, choices.length - 1)];
  if (base === undefined) throw new Error(`no rare duel base for ${group.name} in ${slot}`);
  return base;
}

export function equipDuelFamily(world: World, rng: Rng, kit: DuelKit = DUEL_KIT): boolean {
  const worn: ItemInstance | null = world.player.equipped.weapon;
  const weapon: ItemBaseDef | undefined = worn === null ? undefined : world.content.itemBases.get(worn.base);
  const group: WeaponGroup | null = weapon === undefined ? null : weaponGroupOf(world.content, weapon);
  if (group === null) return false;
  const family: string | undefined = kit.families[group.id];
  if (family === undefined) throw new Error(`no duel family for ${group.name}`);
  const bases: ItemBaseDef[] = [...world.content.itemBases.values()];
  const pieces: ItemBaseDef[] = bases.filter((base: ItemBaseDef): boolean => base.power?.family === family);
  const level: number = world.player.level;
  const rares: ItemBaseDef[] = bases.filter((base: ItemBaseDef): boolean => base.power === null && base.dropWeight > 0 && base.minLevel <= level);
  for (const slot of ITEM_SLOTS) {
    const base: ItemBaseDef = pieces.find((piece: ItemBaseDef): boolean => piece.slot === slot) ?? rareBase(rares, slot, group, rng);
    const item: ItemInstance | null = generateItem(world.content, rng, world.nextItemUid, level, base.id, kit.rareRarity);
    if (item === null) throw new Error(`could not roll duel item ${base.id}`);
    world.nextItemUid += 1;
    world.player.equipped[slot] = item;
  }
  refreshPlayer(world);
  refillHero(world);
  return true;
}

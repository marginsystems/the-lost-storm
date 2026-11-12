import type { ServiceKind } from '../../sim/content/trade-types.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';

export type InventoryClick = 'click' | 'ctrl' | 'right';

export const INVENTORY_HINTS = {
  equip: 'Click to equip · Right click to drop',
  stash: 'Click to stash',
} as const;

function serviceOf(world: World): ServiceKind | null {
  return world.service === null ? null : world.service.kind;
}

const INVENTORY_ACTIONS: Readonly<Record<ServiceKind, 'sell' | 'stash'>> = { vendor: 'sell', stash: 'stash' };

const SERVICE_HINTS: Readonly<Record<ServiceKind, (world: World, item: ItemInstance) => string>> = {
  vendor: (world: World, item: ItemInstance): string => `Click to sell for ${sellPrice(world.content, item)} gold`,
  stash: (): string => INVENTORY_HINTS.stash,
};

export function inventoryCommand(world: World, inventoryIndex: number, click: InventoryClick): Command {
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === null) return click === 'right' ? { type: 'drop', inventoryIndex } : { type: 'equip', inventoryIndex };
  return { type: 'trade', action: { type: INVENTORY_ACTIONS[kind], inventoryIndex } };
}

export function inventoryHint(world: World, item: ItemInstance): string {
  const kind: ServiceKind | null = serviceOf(world);
  return kind === null ? INVENTORY_HINTS.equip : SERVICE_HINTS[kind](world, item);
}

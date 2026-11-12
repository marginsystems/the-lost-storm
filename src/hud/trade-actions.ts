import { bookOf } from '../../sim/content/story.ts';
import type { ServiceKind } from '../../sim/content/trade-types.ts';
import { baseOf } from '../../sim/items.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import type { Prompt } from './prompts.ts';
import { alternate, promptText, use } from './prompts.ts';

export type InventoryClick = 'click' | 'ctrl' | 'right';

export const INVENTORY_HINTS: Readonly<Record<'equip' | 'stash' | 'read', readonly Prompt[]>> = {
  equip: [use('equip'), alternate('drop')],
  stash: [use('stash')],
  read: [use('read')],
};

function serviceOf(world: World): ServiceKind | null {
  return world.service === null ? null : world.service.kind;
}

const INVENTORY_ACTIONS: Readonly<Record<ServiceKind, 'sell' | 'stash'>> = { vendor: 'sell', stash: 'stash' };

const SERVICE_HINTS: Readonly<Record<ServiceKind, (world: World, item: ItemInstance) => readonly Prompt[]>> = {
  vendor: (world: World, item: ItemInstance): readonly Prompt[] => [use(`sell for ${sellPrice(world.content, item)} gold`)],
  stash: (): readonly Prompt[] => INVENTORY_HINTS.stash,
};

export function inventoryCommand(world: World, inventoryIndex: number, click: InventoryClick): Command {
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === null) return click === 'right' ? { type: 'drop', inventoryIndex } : { type: 'equip', inventoryIndex };
  return { type: 'trade', action: { type: INVENTORY_ACTIONS[kind], inventoryIndex } };
}

function inventoryPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  if (bookOf(world.content, baseOf(world.content, item)) !== null) return INVENTORY_HINTS.read;
  const kind: ServiceKind | null = serviceOf(world);
  return kind === null ? INVENTORY_HINTS.equip : SERVICE_HINTS[kind](world, item);
}

export function inventoryHint(world: World, item: ItemInstance, touch: boolean): string {
  return promptText(touch, ...inventoryPrompts(world, item));
}

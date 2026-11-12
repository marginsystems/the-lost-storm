import type { ActionId, ResolvedKeys } from '../settings/bindings.ts';
import { slotAction } from '../settings/bindings.ts';

const NAMED: Readonly<Record<string, ActionId>> = {
  inventory: 'inventory',
  tree: 'tree',
  map: 'map',
  flask: 'flask1',
};

export function keyLabel(keys: ResolvedKeys, name: string): string {
  const slot: RegExpMatchArray | null = name.match(/^slot_(\d+)$/);
  if (slot !== null) return keys.labelOf(slotAction(Number(slot[1]) - 1));
  const action: ActionId | undefined = NAMED[name];
  return action === undefined ? '' : keys.labelOf(action);
}

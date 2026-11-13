import type { SkillDef } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
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

export const PANEL_ICONS = {
  inventory: 'armour',
  character: 'bust',
  tree: 'fork',
  map: 'eye',
} as const;

export type TouchLabel = { readonly kind: 'icon'; readonly icon: string; readonly name: string } | { readonly kind: 'words'; readonly text: string };

export function touchLabel(world: World, name: string): TouchLabel {
  const slot: RegExpMatchArray | null = name.match(/^slot_(\d+)$/);
  if (slot !== null) {
    const skill: SkillDef | null = world.player.skills[Number(slot[1]) - 1] ?? null;
    return skill === null ? { kind: 'words', text: '' } : { kind: 'icon', icon: skill.icon, name: skill.name };
  }
  switch (name) {
    case 'inventory':
      return { kind: 'icon', icon: PANEL_ICONS.inventory, name: 'Inventory' };
    case 'tree':
      return { kind: 'icon', icon: PANEL_ICONS.tree, name: 'Skill Tree' };
    case 'map':
      return { kind: 'icon', icon: PANEL_ICONS.map, name: 'Map' };
    case 'flask':
      return { kind: 'words', text: '1' };
    default:
      return { kind: 'words', text: '' };
  }
}

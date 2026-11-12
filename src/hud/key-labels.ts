import type { Content } from '../../sim/content/types.ts';
import { INPUT } from '../input.ts';

const KEYS = {
  flask: '1',
} as const;

function codeLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '');
}

export function keyLabel(content: Content, name: string): string {
  const slot: RegExpMatchArray | null = name.match(/^slot_(\d+)$/);
  if (slot !== null) return content.player.skillBar[Number(slot[1]) - 1]?.label ?? '';
  switch (name) {
    case 'inventory':
      return codeLabel(INPUT.inventoryKey);
    case 'tree':
      return codeLabel(INPUT.treeKey);
    case 'map':
      return codeLabel(INPUT.mapKey);
    case 'flask':
      return KEYS.flask;
    default:
      return '';
  }
}

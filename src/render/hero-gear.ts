import type { Content } from '../../sim/content/types.ts';
import { heldGear } from '../../sim/wear.ts';
import type { Equipment } from '../../sim/world/types.ts';
import type { RigInstance } from './character-loader.ts';

export type GearedRig = Pick<RigInstance, 'setGear'>;

export function holdEquipped(content: Content, rig: GearedRig, equipped: Equipment): void {
  rig.setGear(heldGear(content, equipped));
}

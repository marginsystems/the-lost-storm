import { armedFlag, armedWhere, toldFlag, toldValue } from '../save-arm.ts';
import { writeFlags } from './flags.ts';
import type { World } from './types.ts';

export function announceArming(world: World): void {
  for (const group of world.content.chart.weaponGroups) {
    const armed: string | undefined = world.flags[armedFlag(group.id)];
    const told: string = toldFlag(group.id);
    if (armed === undefined || world.flags[told] !== undefined) continue;
    writeFlags(world, { [told]: toldValue() });
    world.events.push({ type: 'armed', group: group.id, base: group.starter, where: armedWhere(armed) });
  }
}

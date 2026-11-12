import type { ReviveDelivery } from '../content/combat-types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { distance } from '../math.ts';
import { spawnMonster } from './spawn.ts';
import type { MonsterState, World } from './types.ts';

export const REVIVE = {
  corpseWindow: 5.5,
} as const;

export function revivable(world: World, faction: string, delivery: ReviveDelivery, origin: ReadonlyVec2): MonsterState[] {
  return world.monsters
    .filter((monster: MonsterState): boolean => !monster.alive && !monster.revived && monster.def.boss === null && monster.def.faction === faction && monster.deadTime < REVIVE.corpseWindow && distance(monster.pos, origin) <= delivery.range)
    .toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, origin) - distance(b.pos, origin))
    .slice(0, delivery.count);
}

export function raiseFallen(world: World, casterId: number, faction: string, delivery: ReviveDelivery, origin: ReadonlyVec2): number {
  const fallen: MonsterState[] = revivable(world, faction, delivery, origin);
  for (const corpse of fallen) {
    world.monsters = world.monsters.filter((monster: MonsterState): boolean => monster !== corpse);
    world.events.push({ type: 'monster_remove', monsterId: corpse.id });
    const raised: MonsterState = spawnMonster(world, corpse.def, corpse.packId, corpse.pos, { summonerId: null, scatter: 0, revived: true });
    raised.facing = corpse.facing;
    raised.life = Math.max(1, Math.round(raised.maxLife * delivery.lifeShare));
    raised.aggro = true;
    world.events.push({ type: 'revive', monsterId: raised.id, corpseId: corpse.id, by: casterId });
    world.events.push({ type: 'aggro', monsterId: raised.id });
  }
  return fallen.length;
}

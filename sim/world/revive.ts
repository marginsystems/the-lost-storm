import type { ReviveDelivery } from '../content/combat-types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { distance } from '../math.ts';
import { spawnMonster } from './spawn.ts';
import type { MonsterState, World } from './types.ts';

export const REVIVE = {
  corpseWindow: 5.5,
} as const;

function raisable(monster: MonsterState, faction: string, delivery: ReviveDelivery): boolean {
  if (monster.def.behaviour.type === 'fixed') return false;
  return delivery.raises === 'any' || monster.def.faction === faction;
}

export function canPay(caster: MonsterState, delivery: ReviveDelivery): boolean {
  return delivery.cost === 0 || caster.life > Math.ceil(caster.maxLife * delivery.cost);
}

export function revivable(world: World, faction: string, delivery: ReviveDelivery, origin: ReadonlyVec2): MonsterState[] {
  return world.monsters
    .filter((monster: MonsterState): boolean => !monster.alive && !monster.revived && monster.def.boss === null && raisable(monster, faction, delivery) && monster.deadTime < REVIVE.corpseWindow && distance(monster.pos, origin) <= delivery.range)
    .toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, origin) - distance(b.pos, origin))
    .slice(0, delivery.count);
}

function pay(world: World, casterId: number, delivery: ReviveDelivery): boolean {
  if (delivery.cost === 0) return true;
  const caster: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === casterId && monster.alive);
  if (caster === undefined || !canPay(caster, delivery)) return false;
  caster.life -= Math.ceil(caster.maxLife * delivery.cost);
  return true;
}

export function raiseFallen(world: World, casterId: number, faction: string, delivery: ReviveDelivery, origin: ReadonlyVec2): number {
  const fallen: MonsterState[] = revivable(world, faction, delivery, origin);
  let raisedCount: number = 0;
  for (const corpse of fallen) {
    if (!pay(world, casterId, delivery)) break;
    raisedCount += 1;
    world.monsters = world.monsters.filter((monster: MonsterState): boolean => monster !== corpse);
    world.events.push({ type: 'monster_remove', monsterId: corpse.id });
    const raised: MonsterState = spawnMonster(world, corpse.def, corpse.packId, corpse.pos, { summonerId: null, scatter: 0, revived: true, level: corpse.level });
    raised.facing = corpse.facing;
    raised.life = Math.max(1, Math.round(raised.maxLife * delivery.lifeShare));
    raised.aggro = true;
    world.events.push({ type: 'revive', monsterId: raised.id, corpseId: corpse.id, by: casterId });
    world.events.push({ type: 'aggro', monsterId: raised.id });
  }
  return raisedCount;
}

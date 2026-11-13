import type { PackReturn, ZonePack } from '../content/types.ts';
import { distance } from '../math.ts';
import { spawnPacks } from './monsters.ts';
import type { MonsterState, World } from './types.ts';

export interface PackTimer {
  readonly pack: ZonePack;
  readonly packId: number;
  left: number | null;
}

function cleared(world: World, timer: PackTimer): boolean {
  return !world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.packId === timer.packId);
}

export function stepPackReturns(world: World, dt: number): void {
  const rules: PackReturn | null = world.zone.packReturn;
  if (rules === null || !world.player.alive) return;
  const due: PackTimer[] = [];
  for (const timer of world.packReturns) {
    if (timer.left === null) {
      if (cleared(world, timer)) timer.left = rules.after;
      continue;
    }
    timer.left = Math.max(0, timer.left - dt);
    if (timer.left === 0 && distance(world.player.pos, timer.pack) >= rules.away) due.push(timer);
  }
  if (due.length === 0) return;
  world.packReturns = world.packReturns.filter((timer: PackTimer): boolean => !due.includes(timer));
  world.spawnedPacks = world.spawnedPacks.filter((pack): boolean => !due.some((timer: PackTimer): boolean => timer.pack === pack));
  spawnPacks(world);
}

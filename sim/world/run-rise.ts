import type { MonsterDef } from '../content/types.ts';
import type { RunRise } from '../content/run-table-types.ts';
import { runShaping } from './run-state.ts';
import type { RunShaping } from './run-state.ts';
import { shapeDefs } from './run-shape.ts';
import { spawnMonster } from './spawn.ts';
import type { MonsterState, World } from './types.ts';

export const RUN_RISE = {
  scatter: 0.6,
} as const;

export function risesFrom(monster: MonsterState, rise: RunRise): boolean {
  return monster.def.boss === null && monster.def.behaviour.type !== 'fixed' && !monster.revived && monster.summonerId === null && monster.def.id !== rise.monster;
}

function raise(world: World, shaping: RunShaping, rise: RunRise, fallen: MonsterState): void {
  const base: MonsterDef | undefined = world.content.monsters.get(rise.monster);
  if (base === undefined) return;
  const def: MonsterDef = shapeDefs(world.content, shaping, [base])[0] ?? base;
  const risen: MonsterState = spawnMonster(world, def, fallen.packId, fallen.pos, { summonerId: null, scatter: RUN_RISE.scatter, revived: true, level: fallen.level });
  risen.facing = fallen.facing;
  risen.aggro = true;
  world.events.push({ type: 'aggro', monsterId: risen.id });
}

export function riseFrom(world: World, fallen: MonsterState): void {
  const shaping: RunShaping | null = runShaping(world);
  const rise: RunRise | null = shaping?.rise ?? null;
  if (shaping === null || rise === null || !risesFrom(fallen, rise) || !world.rng.chance(rise.chance)) return;
  raise(world, shaping, rise, fallen);
}

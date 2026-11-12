import type { Actor, MonsterState } from './types.ts';

export function steadiness(target: Actor): number {
  if (target.kind === 'player') return 1;
  return target.def.boss === null ? target.def.poise.knockback : target.def.boss.poise.knockback;
}

export function pushShare(a: MonsterState, b: MonsterState): number {
  const aGives: boolean = steadiness(a) > 0;
  if (aGives === steadiness(b) > 0) return 0.5;
  return aGives ? 1 : 0;
}

export function heroShare(monster: MonsterState): number {
  return steadiness(monster) > 0 ? 0 : 1;
}

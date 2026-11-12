import type { Condition } from '../content/condition-types.ts';
import type { PointGrant } from '../content/types.ts';
import { learnable } from '../skill-book.ts';
import { learn } from './learn.ts';
import { refreshPlayer } from './character.ts';
import { allHold } from './conditions.ts';
import type { PlayerState, World } from './types.ts';

export function learnSkills(world: World): void {
  const player: PlayerState = world.player;
  const fresh: string[] = learnable(world.content, player.learned, player.level, (when: readonly Condition[]): boolean => allHold(world, when));
  if (fresh.length === 0) return;
  for (const skill of fresh) learn(world, skill);
  refreshPlayer(world);
}

export function grantPoints(world: World): void {
  const player: PlayerState = world.player;
  for (const grant of world.content.chart.grants) {
    if (player.grantsTaken.includes(grant.id) || !allHold(world, grant.when)) continue;
    player.grantsTaken.push(grant.id);
    player.skillPoints += grant.points;
    world.events.push({ type: 'chart_point', source: grant.id, points: grant.points });
  }
}

export function grantIds(grants: readonly PointGrant[], value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  return grants.filter((grant: PointGrant): boolean => list.includes(grant.id)).map((grant: PointGrant): string => grant.id);
}

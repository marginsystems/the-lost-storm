import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { MomentFigure, MomentState, MonsterState, World } from './types.ts';

export function shellLimit(moment: MomentState, radius: number): number {
  return Math.max(0, moment.def.radius - radius);
}

export function insideShell(world: World, monster: MonsterState, point: Vec2): boolean {
  const moment: MomentState | undefined = world.moments.find((each: MomentState): boolean => each.figures.some((figure: MomentFigure): boolean => figure.monsterId === monster.id));
  return moment === undefined || moment.phase !== 'awake' || distance(point, moment.pos) <= shellLimit(moment, monster.radius);
}

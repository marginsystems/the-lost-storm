import type { ObjectiveTarget } from '../../sim/world/objective.ts';

export function glowsAt(target: ObjectiveTarget | null): boolean {
  return target !== null && target.kind !== 'exit';
}

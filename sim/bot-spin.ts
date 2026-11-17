import type { SkillDef } from './content/types.ts';
import type { ReadonlyVec2, Vec2 } from './math.ts';
import { distance } from './math.ts';
import { isWalkable, lineWalkable } from './nav/grid.ts';
import type { HazardState, MonsterState, World } from './world/types.ts';

export const SPIN_DODGE = {
  reaches: [0.8, 1.4, 2, 2.8, 4, 6, 8, 11],
  angles: 16,
  margin: 0.2,
} as const;

export function wheelReach(skill: SkillDef): number {
  return skill.delivery.type === 'nova' ? skill.delivery.radius : skill.engageRange;
}

export function harmful(hazard: HazardState): boolean {
  return hazard.team === 'monster' && hazard.skill.delivery.type !== 'field';
}

export function hazardDue(world: World, hazard: HazardState, pos: ReadonlyVec2, reach: number, reaction: number): boolean {
  const inside: number = hazard.radius + reach - distance(pos, hazard.pos);
  if (inside < 0) return false;
  const speed: number = Math.max(world.player.stats.moveSpeed * world.player.tempo, 0.1);
  return hazard.timeLeft <= inside / speed + reaction + SPIN_DODGE.margin;
}

function packReach(pack: readonly MonsterState[], spot: ReadonlyVec2, reach: number): number {
  let best: number = Infinity;
  for (const monster of pack) if (monster.alive) best = Math.min(best, distance(spot, monster.pos) - monster.radius - reach);
  return best;
}

export function spinStep(world: World, pack: readonly MonsterState[], reach: number, safe: (spot: ReadonlyVec2) => boolean): Vec2 | null {
  const from: Vec2 = world.player.pos;
  let fallback: Vec2 | null = null;
  for (const step of SPIN_DODGE.reaches) {
    let chosen: Vec2 | null = null;
    let closest: number = Infinity;
    for (let turn: number = 0; turn < SPIN_DODGE.angles; turn += 1) {
      const angle: number = (turn / SPIN_DODGE.angles) * Math.PI * 2;
      const spot: Vec2 = { x: from.x + Math.cos(angle) * step, z: from.z + Math.sin(angle) * step };
      if (!isWalkable(world.grid, spot.x, spot.z) || !lineWalkable(world.grid, from, spot) || !safe(spot)) continue;
      fallback ??= spot;
      const gap: number = packReach(pack, spot, reach);
      if (gap <= 0 && gap < closest) {
        closest = gap;
        chosen = spot;
      }
    }
    if (chosen !== null) return chosen;
  }
  return fallback;
}

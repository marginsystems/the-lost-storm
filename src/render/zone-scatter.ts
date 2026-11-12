import type { AroundScatter, Content, OpenScatter, PropDef, ScatterSize, ZoneDef, ZoneExit, ZoneProp, ZoneScatter } from '../../sim/content/types.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { Blocker } from '../../sim/nav/grid.ts';
import { blockerGap, propBlockers, propOutline } from '../../sim/nav/grid.ts';
import { isFloorCell, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { edgeNoise, edgeRocks, propReach } from './zone-edge.ts';

export const ZONE_SCATTER = {
  tries: 6,
  tuck: 0.12,
  ringPoints: 12,
  turn: Math.PI * 2,
  saltStep: 13,
  ankle: 0.15,
} as const;

export interface ScatterStone {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly size: number;
}

const DEGREES_PER_RADIAN: number = 180 / Math.PI;

function floorAt(zone: ZoneDef, x: number, z: number): boolean {
  return isFloorCell(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize));
}

function nearExit(exits: readonly ZoneExit[], x: number, z: number): boolean {
  return exits.some((exit: ZoneExit): boolean => Math.hypot(exit.x - x, exit.z - z) < exit.radius);
}

function clearOf(blockers: readonly Blocker[], x: number, z: number, clear: number): boolean {
  return blockers.every((blocker: Blocker): boolean => blockerGap(blocker, x, z) >= clear);
}

function zoneBlockers(content: Content, zone: ZoneDef): Blocker[] {
  const blockers: Blocker[] = [];
  for (const placed of zone.props) {
    const def: PropDef | undefined = content.props.get(placed.prop);
    if (def !== undefined) blockers.push(...propBlockers(def, placed.x, placed.z, placed.rotationDegrees));
  }
  for (const rock of edgeRocks(content, zone)) {
    const def: PropDef | undefined = content.props.get(rock.prop);
    if (def !== undefined) blockers.push(...propBlockers(def, rock.x, rock.z, rock.yaw * DEGREES_PER_RADIAN));
  }
  return blockers;
}

function sized(size: ScatterSize, amount: number): number {
  return size.least + (size.most - size.least) * amount;
}

function picked(props: readonly string[], amount: number): string | undefined {
  return props[Math.min(props.length - 1, Math.floor(amount * props.length))];
}

function openStones(zone: ZoneDef, rule: OpenScatter, blockers: readonly Blocker[], salt: number): ScatterStone[] {
  const width: number = zoneColumns(zone) * zone.cellSize;
  const depth: number = zoneRows(zone) * zone.cellSize;
  const stones: ScatterStone[] = [];
  for (let index: number = 0; index < rule.count; index += 1) {
    for (let attempt: number = 0; attempt < ZONE_SCATTER.tries; attempt += 1) {
      const centreX: number = edgeNoise(index, attempt, salt) * width;
      const centreZ: number = edgeNoise(attempt + 31, index, salt + 1) * depth;
      if (!floorAt(zone, centreX, centreZ) || nearExit(zone.exits, centreX, centreZ) || !clearOf(blockers, centreX, centreZ, rule.clear)) continue;
      for (let member: number = 0; member < rule.clump; member += 1) {
        const angle: number = edgeNoise(index + member, attempt + 41, salt + 5) * ZONE_SCATTER.turn;
        const reach: number = member === 0 ? 0 : Math.sqrt(edgeNoise(member, index + 43, salt + 6)) * rule.spread;
        const x: number = centreX + Math.cos(angle) * reach;
        const z: number = centreZ + Math.sin(angle) * reach;
        if (!floorAt(zone, x, z) || nearExit(zone.exits, x, z) || !clearOf(blockers, x, z, rule.clear)) continue;
        const prop: string | undefined = picked(rule.props, edgeNoise(index + member * 3, attempt + 7, salt + 2));
        if (prop !== undefined) stones.push({ prop, x, z, yaw: edgeNoise(index + 5, member, salt + 3) * ZONE_SCATTER.turn, size: sized(rule.size, edgeNoise(member + attempt, index + 9, salt + 4)) });
      }
      break;
    }
  }
  return stones;
}

function ringOf(def: PropDef, placed: ZoneProp): readonly ReadonlyVec2[] {
  const outline: Blocker | null = propOutline(def, placed.x, placed.z, placed.rotationDegrees);
  if (outline !== null && outline.kind === 'outline') return outline.outline;
  const reach: number = propReach(def);
  return Array.from({ length: ZONE_SCATTER.ringPoints }, (_: unknown, index: number): ReadonlyVec2 => {
    const angle: number = (index / ZONE_SCATTER.ringPoints) * ZONE_SCATTER.turn;
    return { x: placed.x + Math.cos(angle) * reach, z: placed.z + Math.sin(angle) * reach };
  });
}

function aroundStones(content: Content, zone: ZoneDef, rule: AroundScatter, blockers: readonly Blocker[], salt: number): ScatterStone[] {
  const stones: ScatterStone[] = [];
  zone.props.forEach((placed: ZoneProp, anchor: number): void => {
    const def: PropDef | undefined = content.props.get(placed.prop);
    if (def === undefined || !rule.anchors.includes(placed.prop)) return;
    const ring: readonly ReadonlyVec2[] = ringOf(def, placed);
    for (let index: number = 0; index < rule.each; index += 1) {
      const along: number = edgeNoise(anchor, index, salt) * ring.length;
      const from: ReadonlyVec2 | undefined = ring[Math.floor(along) % ring.length];
      const to: ReadonlyVec2 | undefined = ring[(Math.floor(along) + 1) % ring.length];
      if (from === undefined || to === undefined) continue;
      const share: number = along - Math.floor(along);
      const edgeX: number = from.x + (to.x - from.x) * share;
      const edgeZ: number = from.z + (to.z - from.z) * share;
      const awayX: number = edgeX - placed.x;
      const awayZ: number = edgeZ - placed.z;
      const length: number = Math.hypot(awayX, awayZ);
      if (length === 0) continue;
      const spill: number = edgeNoise(index + 3, anchor, salt + 1);
      const out: number = spill * spill * rule.spread - ZONE_SCATTER.tuck;
      const x: number = edgeX + (awayX / length) * out;
      const z: number = edgeZ + (awayZ / length) * out;
      if (!floorAt(zone, x, z) || nearExit(zone.exits, x, z) || !clearOf(blockers, x, z, -ZONE_SCATTER.tuck * 2)) continue;
      const prop: string | undefined = picked(rule.props, edgeNoise(anchor + 11, index, salt + 2));
      if (prop !== undefined) stones.push({ prop, x, z, yaw: edgeNoise(index, anchor + 17, salt + 3) * ZONE_SCATTER.turn, size: sized(rule.size, edgeNoise(anchor, index + 23, salt + 4)) });
    }
  });
  return stones;
}

export function scatterStones(content: Content, zone: ZoneDef): ScatterStone[] {
  if (zone.scatter.length === 0) return [];
  const blockers: Blocker[] = zoneBlockers(content, zone);
  return zone.scatter.flatMap((rule: ZoneScatter, index: number): ScatterStone[] => {
    const salt: number = (index + 1) * ZONE_SCATTER.saltStep;
    let stones: ScatterStone[];
    switch (rule.type) {
      case 'open':
        stones = openStones(zone, rule, blockers, salt);
        break;
      case 'around':
        stones = aroundStones(content, zone, rule, blockers, salt);
        break;
    }
    return stones;
  });
}

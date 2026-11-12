import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, cellCenter, cellIndex, isSolid, isWalkable, lineOfSight, lineWalkable, moveWithCollision, nearestWalkable } from './grid.ts';
import type { NavGrid } from './grid.ts';
import { must, zoneOf } from '../../test/support.ts';
import { findPath } from './path.ts';

const content: Content = loadContent();
const grid: NavGrid = buildNavGrid(zoneOf(content, 'drowned_bastion'), content.props, content.player.radius);

void test('open floor is walkable and void tiles, the outside and wall margins are not', (): void => {
  assert.ok(isWalkable(grid, 28, 22));
  assert.ok(!isWalkable(grid, 2, 2));
  assert.ok(!isWalkable(grid, -3, 10));
  assert.ok(!isWalkable(grid, 500, 500));
  assert.ok(!isWalkable(grid, 0.4, 22));
  assert.ok(isWalkable(grid, 2, 22));
});

void test('props with a block radius block, and the player start stays free', (): void => {
  assert.ok(!isWalkable(grid, 20, 14));
  assert.ok(isSolid(grid, 20, 14));
  assert.ok(!isWalkable(grid, 20.9, 14));
  assert.ok(isWalkable(grid, 23, 14));
  assert.ok(isSolid(grid, -3, 10));
  assert.ok(!isSolid(grid, 28, 22));
});

void test('cell lookup maps points to cells and back', (): void => {
  assert.equal(cellIndex(grid, -1, 5), -1);
  assert.equal(cellIndex(grid, 5, grid.rows * grid.cellSize + 1), -1);
  const index: number = cellIndex(grid, 28.1, 22.1);
  const centre: Vec2 = cellCenter(grid, index);
  assert.ok(Math.abs(centre.x - 28.1) <= grid.cellSize / 2);
  assert.ok(Math.abs(centre.z - 22.1) <= grid.cellSize / 2);
  assert.equal(cellIndex(grid, centre.x, centre.z), index);
});

void test('lines are blocked by a pillar but not by open floor', (): void => {
  assert.ok(!lineWalkable(grid, { x: 16, z: 14 }, { x: 24, z: 14 }));
  assert.ok(lineWalkable(grid, { x: 16, z: 22 }, { x: 24, z: 22 }));
  assert.ok(!lineOfSight(grid, { x: 16, z: 14 }, { x: 24, z: 14 }));
  assert.ok(lineOfSight(grid, { x: 28, z: 37 }, { x: 28, z: 20 }));
  assert.ok(!lineWalkable(grid, { x: 28, z: 22 }, { x: 28, z: -10 }));
});

void test('nearestWalkable keeps walkable points and snaps others', (): void => {
  const same: Vec2 = must(nearestWalkable(grid, { x: 28, z: 22 }, 4), 'same point');
  assert.deepEqual(same, { x: 28, z: 22 });
  const snapped: Vec2 = must(nearestWalkable(grid, { x: 20, z: 14 }, 4), 'snapped point');
  assert.ok(isWalkable(grid, snapped.x, snapped.z));
  assert.ok(Math.hypot(snapped.x - 20, snapped.z - 14) <= 4);
  assert.equal(nearestWalkable(grid, { x: -50, z: -50 }, 4), null);
});

void test('moveWithCollision moves freely, slides along a wall and never enters one', (): void => {
  const free: Vec2 = { x: 28, z: 22 };
  moveWithCollision(grid, free, 0.5, 0.25);
  assert.deepEqual(free, { x: 28.5, z: 22.25 });

  const sliding: Vec2 = { x: 1.2, z: 22 };
  assert.ok(isWalkable(grid, sliding.x, sliding.z));
  moveWithCollision(grid, sliding, -0.5, 1);
  assert.equal(sliding.x, 1.2);
  assert.equal(sliding.z, 23);

  const pinned: Vec2 = { x: 1.2, z: 22 };
  moveWithCollision(grid, pinned, -2, 0);
  assert.deepEqual(pinned, { x: 1.2, z: 22 });
});

const AUDIT = {
  spawnSnap: 6,
  approach: 1.5,
  sampleStep: 0.1,
  bodyMargin: 0.25,
  reported: 5,
  crossings: [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]],
} as const;

function reachableFrom(zoneGrid: NavGrid, start: Vec2): Uint8Array {
  const seen: Uint8Array = new Uint8Array(zoneGrid.columns * zoneGrid.rows);
  const first: number = cellIndex(zoneGrid, start.x, start.z);
  if (first < 0) return seen;
  const queue: number[] = [first];
  seen[first] = 1;
  while (queue.length > 0) {
    const current: number = queue.pop() ?? first;
    const column: number = current % zoneGrid.columns;
    const row: number = Math.floor(current / zoneGrid.columns);
    for (let dr: number = -1; dr <= 1; dr += 1) {
      for (let dc: number = -1; dc <= 1; dc += 1) {
        const nextColumn: number = column + dc;
        const nextRow: number = row + dr;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= zoneGrid.columns || nextRow >= zoneGrid.rows) continue;
        const next: number = nextRow * zoneGrid.columns + nextColumn;
        if (seen[next] === 1 || zoneGrid.walkable[next] !== 1) continue;
        if (dc !== 0 && dr !== 0 && (zoneGrid.walkable[row * zoneGrid.columns + nextColumn] !== 1 || zoneGrid.walkable[nextRow * zoneGrid.columns + column] !== 1)) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return seen;
}

for (const zone of content.zones.values()) {
  const zoneGrid: NavGrid = buildNavGrid(zone, content.props, content.player.radius);

  void test(`${zone.id}: paths around every blocking prop keep a walker's body out of its footprint`, (): void => {
    const problems: string[] = [];
    const blocking = zone.props.filter((placed) => placed.when.length === 0 && must(content.props.get(placed.prop), placed.prop).blockRadius > 0);
    let crossings: number = 0;
    for (const placed of blocking) {
      const reach: number = must(content.props.get(placed.prop), placed.prop).blockRadius + content.player.radius + AUDIT.approach;
      for (const [dx, dz] of AUDIT.crossings) {
        const from: Vec2 = { x: placed.x - dx * reach, z: placed.z - dz * reach };
        const to: Vec2 = { x: placed.x + dx * reach, z: placed.z + dz * reach };
        if (!isWalkable(zoneGrid, from.x, from.z) || !isWalkable(zoneGrid, to.x, to.z)) continue;
        const path: Vec2[] = findPath(zoneGrid, from, to);
        if (path.length === 0) {
          problems.push(`no path across ${placed.prop} at ${placed.x},${placed.z} from ${from.x.toFixed(2)},${from.z.toFixed(2)}`);
          continue;
        }
        crossings += 1;
        let previous: Vec2 = from;
        for (const point of path) {
          const steps: number = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / AUDIT.sampleStep));
          for (let step: number = 0; step <= steps; step += 1) {
            const x: number = previous.x + ((point.x - previous.x) * step) / steps;
            const z: number = previous.z + ((point.z - previous.z) * step) / steps;
            for (const other of blocking) {
              const radius: number = must(content.props.get(other.prop), other.prop).blockRadius;
              if (Math.hypot(x - other.x, z - other.z) < radius + AUDIT.bodyMargin) problems.push(`a path near ${placed.prop} at ${placed.x},${placed.z} passes ${x.toFixed(2)},${z.toFixed(2)}, inside ${other.prop} at ${other.x},${other.z}`);
            }
          }
          previous = point;
        }
      }
    }
    assert.deepEqual(problems.slice(0, AUDIT.reported), []);
    if (blocking.length > 0) assert.ok(crossings > 0, `${zone.id} checked no crossing`);
  });

  void test(`${zone.id}: every pack, exit, checkpoint, waypoint and NPC is reachable from the start`, (): void => {
    const start: Vec2 = must(nearestWalkable(zoneGrid, zone.playerStart, AUDIT.spawnSnap), `${zone.id} start`);
    const seen: Uint8Array = reachableFrom(zoneGrid, start);
    const places: { readonly label: string; readonly x: number; readonly z: number }[] = [
      ...zone.packs.map((pack, index: number) => ({ label: `pack ${index}`, x: pack.x, z: pack.z })),
      ...zone.exits.map((exit) => ({ label: `exit ${exit.id}`, x: exit.x, z: exit.z })),
      ...zone.checkpoints.map((checkpoint) => ({ label: `checkpoint ${checkpoint.id}`, x: checkpoint.x, z: checkpoint.z })),
      ...zone.npcs.map((npc) => ({ label: `npc ${npc.npc}`, x: npc.x, z: npc.z })),
      ...(zone.waypoint === null ? [] : [{ label: 'waypoint', x: zone.waypoint.x, z: zone.waypoint.z }]),
    ];
    const problems: string[] = [];
    for (const place of places) {
      const snapped: Vec2 | null = nearestWalkable(zoneGrid, place, AUDIT.spawnSnap);
      if (snapped === null || seen[cellIndex(zoneGrid, snapped.x, snapped.z)] !== 1) problems.push(`${place.label} at ${place.x},${place.z} is cut off`);
    }
    assert.deepEqual(problems, []);
  });
}

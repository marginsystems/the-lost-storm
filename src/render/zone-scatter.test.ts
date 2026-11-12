import assert from 'node:assert/strict';
import { test } from 'node:test';
import footprints from '../../data/footprints.json' with { type: 'json' };
import { loadContent } from '../../sim/content/content.ts';
import type { Content, PropDef, ZoneDef, ZoneScatter } from '../../sim/content/types.ts';
import type { Blocker } from '../../sim/nav/grid.ts';
import { blockerGap, propBlockers } from '../../sim/nav/grid.ts';
import { isFloorCell } from '../../sim/nav/layout.ts';
import { must } from '../../test/support.ts';
import { scatterStones, ZONE_SCATTER } from './zone-scatter.ts';
import type { ScatterStone } from './zone-scatter.ts';

const content: Content = loadContent();
const hall: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
const heights: Map<string, number> = new Map<string, number>(Object.entries(footprints).map(([model, shape]): [string, number] => [model, shape.height]));

void test('the Hall scatters stones on its floor, clear of exits and never inside a solid prop, the same every visit', (): void => {
  const stones: ScatterStone[] = scatterStones(content, hall);
  assert.ok(stones.length > 150, `only ${stones.length} stones`);
  assert.deepEqual(scatterStones(content, hall), stones);
  const blockers: Blocker[] = hall.props.flatMap((placed): Blocker[] => propBlockers(must(content.props.get(placed.prop), placed.prop), placed.x, placed.z, placed.rotationDegrees));
  for (const stone of stones) {
    assert.ok(isFloorCell(hall, Math.floor(stone.x / hall.cellSize), Math.floor(stone.z / hall.cellSize)), `${stone.prop} off the floor`);
    for (const exit of hall.exits) assert.ok(Math.hypot(exit.x - stone.x, exit.z - stone.z) >= exit.radius);
    for (const blocker of blockers) assert.ok(blockerGap(blocker, stone.x, stone.z) >= -ZONE_SCATTER.tuck * 2, `${stone.prop} sinks into a prop`);
  }
});

void test('rubble heaps against the walls and broken blocks the Hall names as anchors', (): void => {
  const anchors: Set<string> = new Set<string>(hall.scatter.flatMap((rule: ZoneScatter): readonly string[] => (rule.type === 'around' ? rule.anchors : [])));
  const placed = hall.props.filter((prop): boolean => anchors.has(prop.prop));
  const near: ScatterStone[] = scatterStones(content, hall).filter((stone: ScatterStone): boolean => placed.some((prop): boolean => Math.hypot(prop.x - stone.x, prop.z - stone.z) < 4));
  assert.ok(near.length >= placed.length * 2, `${near.length} stones near ${placed.length} anchors`);
});

void test('every scattered prop is loose ground cover: no collider, no light, never taller than the ankle', (): void => {
  for (const zone of content.zones.values()) {
    for (const rule of zone.scatter) {
      for (const id of rule.props) {
        const def: PropDef = must(content.props.get(id), id);
        assert.equal(def.footprints.length, 0, `${id} is solid`);
        assert.equal(def.blockRadius, 0);
        const height: number = must(heights.get(def.model), def.model) * def.scale * rule.size.most;
        assert.ok(height <= ZONE_SCATTER.ankle, `${id} stands ${height.toFixed(2)} m in ${zone.id}`);
      }
    }
  }
});

void test('a zone with no scatter rules scatters nothing', (): void => {
  assert.deepEqual(scatterStones(content, must(content.zones.get('hideout'), 'hideout')), []);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, PropDef, ZoneDef } from '../../sim/content/types.ts';
import { buildNavGrid, isWalkable } from '../../sim/nav/grid.ts';
import { isFloorCell } from '../../sim/nav/layout.ts';
import { must } from '../../test/support.ts';
import { edgeNoise, edgeRocks, propReach } from './zone-edge.ts';
import type { EdgeRock } from './zone-edge.ts';

const content: Content = loadContent();

function floorAt(zone: ZoneDef, x: number, z: number): boolean {
  return isFloorCell(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize));
}

void test('rocks line the edge of a zone that asks for them, off the floor, clear of exits, the same every visit', (): void => {
  const stored: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
  const hall: ZoneDef = { ...stored, outside: { surface: 'crag_ground', reach: 6, edge: { props: ['boulder_2', 'rock_4', 'crag_low', 'rock_5'], gap: 0.3, exitClear: 4 }, barrier: null } };
  const rocks: EdgeRock[] = edgeRocks(content, hall);
  assert.ok(rocks.length > 20);
  assert.deepEqual(edgeRocks(content, hall), rocks);
  const grid = buildNavGrid(hall, content.props, content.surfaces, content.player.radius);
  for (const rock of rocks) {
    assert.equal(floorAt(hall, rock.x, rock.z), false, `${rock.prop} at (${rock.x.toFixed(1)}, ${rock.z.toFixed(1)}) stands on the floor`);
    const def: PropDef = must(content.props.get(rock.prop), rock.prop);
    for (let turn: number = 0; turn < 16; turn += 1) {
      const angle: number = (turn / 16) * Math.PI * 2;
      const reach: number = propReach(def) * 0.95;
      assert.equal(isWalkable(grid, rock.x + Math.cos(angle) * reach, rock.z + Math.sin(angle) * reach), false, `${rock.prop} overhangs walkable ground`);
    }
    for (const exit of hall.exits) assert.ok(Math.hypot(exit.x - rock.x, exit.z - rock.z) > exit.radius);
  }
  assert.deepEqual(edgeRocks(content, must(content.zones.get('between'), 'between')), []);
});

void test('the edge noise stays in [0, 1) and differs between neighbours', (): void => {
  const values: number[] = Array.from({ length: 50 }, (_: unknown, index: number): number => edgeNoise(index, index * 2, 1));
  for (const value of values) assert.ok(value >= 0 && value < 1);
  assert.ok(new Set<number>(values).size > 45);
});

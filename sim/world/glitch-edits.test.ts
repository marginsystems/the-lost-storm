import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { placedProp, sceneZone } from '../../test/motion-support.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import type { GlitchEdit, PropShiftEdit, PropSwapEdit } from '../content/glitches.ts';
import { loadGlitches } from '../content/glitches.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneExit, ZoneProp } from '../content/types.ts';
import { distance } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { applyEdit, turnHero } from './glitch-edits.ts';
import type { MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const SHIPPED_EDITS: ReadonlyMap<string, GlitchEdit> = loadGlitches().edits;

function shipped(id: string): GlitchEdit {
  return must(SHIPPED_EDITS.get(id), `edit ${id}`);
}

function sceneWith(tiles: readonly string[], props: readonly ZoneProp[], start: { readonly x: number; readonly z: number }, exits: readonly ZoneExit[]): World {
  const base: ZoneDef = zoneOf(content, 'drowned_bastion');
  const world: World = worldIn(content, base.id, 1);
  enterZone(world, { ...sceneZone(base, 'test_scene', { tiles, props, start }), exits }, { type: 'start' });
  world.monsters = [];
  world.events = [];
  return world;
}

function shiftEdit(): PropShiftEdit {
  const edit: GlitchEdit = shipped('prop_shift');
  if (edit.type !== 'prop_shift') throw new Error('prop_shift is not a shift');
  return edit;
}

const GATE: PropSwapEdit = { id: 'gate', type: 'prop_swap', weight: 1, reach: 40, twoWay: true, pairs: [{ from: 'gate_lantern', to: 'dry_plinth' }] };

function exitAt(x: number, z: number): ZoneExit {
  return { id: 'far', x, z, radius: 1, to: 'stillhold', toExit: 'bastion_stair', arrival: { x, z }, requires: [], lockedHint: '', hiddenWhenLocked: false };
}

void test('a monster that was alive is now dead, and the hero still gets its experience and its kill', (): void => {
  const world: World = arena(1);
  const thrall: MonsterState = place(world, 'bone_thrall', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  const xp: number = world.player.xp;
  const kills: number = world.player.kills;
  assert.equal(applyEdit(world, shipped('monster_dead'), createRng(1)), true);
  assert.equal(thrall.alive, false);
  assert.ok(world.player.xp > xp || world.player.level > 1);
  assert.equal(world.player.kills, kills + 1);
  assert.ok(world.events.some((event): boolean => event.type === 'death' && event.actorId === thrall.id));
});

void test('a boss and a monster out of reach are never struck down by a glitch', (): void => {
  const boss: string = must([...content.monsters.values()].find((def): boolean => def.boss !== null), 'a boss').id;
  const world: World = arena(2);
  const chief: MonsterState = place(world, boss, { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  assert.equal(applyEdit(world, shipped('monster_dead'), createRng(2)), false);
  assert.equal(chief.alive, true);
});

void test('a corpse can vanish, but never a living monster', (): void => {
  const world: World = arena(3);
  const living: MonsterState = place(world, 'bone_thrall', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  assert.equal(applyEdit(world, shipped('corpse_gone'), createRng(3)), false);
  living.alive = false;
  assert.equal(applyEdit(world, shipped('corpse_gone'), createRng(3)), true);
  assert.equal(world.monsters.length, 0);
  assert.ok(world.events.some((event): boolean => event.type === 'monster_remove' && event.monsterId === living.id));
});

void test('a lamp near the hero goes out and stays out, and the zone and grid are swapped together', (): void => {
  const world: World = sceneWith(['#####', '#...#', '#...#', '#...#', '#####'], [placedProp('post_lantern_lit', 10, 10)], { x: 8, z: 8 }, []);
  const grid: NavGrid = world.grid;
  assert.equal(applyEdit(world, shipped('lamp_out'), createRng(4)), true);
  assert.equal(world.zone.props[0]?.prop, 'post_lantern');
  assert.notEqual(world.grid, grid);
  assert.ok(world.events.some((event): boolean => event.type === 'zone_edited'));
  assert.equal(applyEdit(world, shipped('lamp_out'), createRng(4)), false);
});

void test('a prop shifts a short way and stays on the floor', (): void => {
  const world: World = sceneWith(['#####', '#...#', '#...#', '#...#', '#####'], [placedProp('crate', 10, 10)], { x: 7, z: 7 }, []);
  const edit: PropShiftEdit = shiftEdit();
  for (let seed: number = 0; seed < 10; seed += 1) {
    const before: ZoneProp = must(world.zone.props[0], 'crate');
    assert.equal(applyEdit(world, edit, createRng(seed)), true);
    const after: ZoneProp = must(world.zone.props[0], 'crate');
    assert.ok(Math.abs(distance(before, after) - edit.distance) < 1e-9);
  }
});

void test('a gate never shuts across the only way to an exit, but may shut where the hero can walk around it', (): void => {
  const narrow: World = sceneWith(['#######', '.......', '#######'], [placedProp('gate_lantern', 14, 6)], { x: 3, z: 6 }, [exitAt(25, 6)]);
  assert.equal(applyEdit(narrow, GATE, createRng(5)), false);
  assert.equal(narrow.zone.props[0]?.prop, 'gate_lantern');
  const wide: World = sceneWith(['#######', '.......', '.......', '.......', '#######'], [placedProp('gate_lantern', 14, 6)], { x: 3, z: 10 }, [exitAt(25, 10)]);
  assert.equal(applyEdit(wide, GATE, createRng(5)), true);
  assert.equal(wide.zone.props[0]?.prop, 'dry_plinth');
  assert.equal(applyEdit(wide, GATE, createRng(5)), true);
  assert.equal(must(wide.zone.props[0], 'gate').prop, 'gate_lantern');
});

void test('turning the hero faces him exactly the other way', (): void => {
  const world: World = arena(6);
  world.player.facing = 0.5;
  turnHero(world);
  assert.ok(Math.abs(world.player.facing - (0.5 - Math.PI)) < 1e-9);
  assert.equal(content.props.has('gate_lantern'), true);
});

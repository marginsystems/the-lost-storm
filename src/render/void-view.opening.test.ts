import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import { makeItem } from '../../sim/world/ledger.ts';
import { stepEncounters } from '../../sim/world/encounters.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { must } from '../../test/support.ts';
import { MIST } from './mist-field.ts';
import { glimpseUniforms } from './void-glimpse.ts';
import type { VoidGlimpses } from './void-glimpse.ts';
import { buildVoidView, VOID_VIEW } from './void-view.ts';
import type { ViewFocus, ZoneView } from './zone-view.ts';

interface Sighting {
  readonly set: number;
  readonly distance: number;
  readonly walked: number;
}

function walkingGlimpses(arrival: 'new' | 'return' | 'act-two' | 'journal-owned' | 'journal-ahead' | 'other-find'): Sighting[] {
  const world: World = createWorld(loadContent(), { seed: 1, save: null, opening: true });
  const rules = must(world.zone.void, 'opening mist');
  assert.equal(rules.encounters[0]?.id, 'journal');
  const sets = rules.glimpses;
  assert.equal(sets[0]?.pieces[0]?.prop, 'shore_arch_broken');
  const seen: Sighting[] = [];
  const group: Group = new Group();
  const start: number = world.player.pos.x;
  const glimpses: VoidGlimpses = {
    group, uniforms: glimpseUniforms(world.zone.floorHeight), count: sets.length, ready: Promise.resolve(),
    show(set: number): void {
      seen.push({ set, distance: Math.hypot(group.position.x - world.player.pos.x, group.position.z - world.player.pos.z), walked: world.player.pos.x - start });
    },
    dispose(): void {},
  };
  const view: ZoneView = buildVoidView(world.zone, 'mobile', null, glimpses);
  const focus: ViewFocus = { look: null, figure: { height: 2, reach: 0.5, span: null }, flash: 0 };
  if (arrival === 'return') world.wake = null;
  if (arrival === 'act-two') world.flags['next_count'] = 'flashed';
  if (arrival === 'journal-owned') world.flags['first_choice'] = 'took_journal';
  try {
    view.update(0, 0.1, world, focus);
    world.wake = null;
    if (arrival === 'journal-ahead') {
      const journal = must(rules.encounters[0], 'journal');
      stepEncounters(world, rules, journal.after, 0.1);
      must(world.ground[0], 'journal on the ground').pos = { x: start + 60, z: world.player.pos.z };
    }
    if (arrival === 'other-find') {
      const pos = { x: start + 80, z: world.player.pos.z };
      const item = must(makeItem(world, 1, 'worn_crossbow', 'common', { kind: 'find', find: 'crossbow', zone: world.zone.id }), 'marked crossbow');
      world.ground.push({ id: world.nextId++, pos, from: pos, find: 'crossbow', kept: false, age: 0, content: { kind: 'item', item } });
    }
    for (let tick: number = 1; tick < 300 && seen.length < 2; tick += 1) {
      world.player.pos.x += world.player.stats.moveSpeed * 0.1;
      if (arrival === 'other-find' && world.ground.length > 0 && world.player.pos.x >= start + 80) {
        assert.equal(seen.length, 0);
        world.ground = [];
      }
      view.update(tick * 0.1, 0.1, world, focus);
    }
    return seen;
  } finally {
    view.dispose();
  }
}

void test('the first walking gust after waking frames the broken arch before the journal cue, then returns to distant ruins', (): void => {
  const [first, second] = walkingGlimpses('new');
  assert.ok(first !== undefined && second !== undefined);
  assert.equal(first.set, 0);
  assert.ok(first.walked > 0 && first.walked < 85);
  assert.ok(first.distance < 12);
  assert.notEqual(second.set, first.set);
  assert.ok(Math.abs(second.distance - MIST.gustReach * VOID_VIEW.glimpseShare) < 1e-6);
});

void test('returning in Act II, revisiting the mist, and already owning the journal keep the original distant gusts', (): void => {
  for (const arrival of ['return', 'act-two', 'journal-owned'] as const) {
    const [first] = walkingGlimpses(arrival);
    assert.ok(first !== undefined);
    assert.ok(Math.abs(first.distance - MIST.gustReach * VOID_VIEW.glimpseShare) < 1e-6);
  }
});

void test('a journal ahead takes the first gust and the next ruins use the distant staging', (): void => {
  const [first] = walkingGlimpses('journal-ahead');
  assert.ok(first !== undefined && first.walked > 60);
  assert.ok(Math.abs(first.distance - MIST.gustReach * VOID_VIEW.glimpseShare) < 1e-6);
});

void test('when another find takes the first gust before the journal appears, the next unaimed gust still frames the arch', (): void => {
  const [first] = walkingGlimpses('other-find');
  assert.ok(first !== undefined && first.walked > 80);
  assert.equal(first.set, 0);
  assert.ok(first.distance < 12);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, ShaderMaterial } from 'three';
import type { Object3D } from 'three';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { BossDef, Content, MonsterDef } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { COUNT_LOOK, countShadeOf, createCountLook, flashLevel, HELD_COLOR, SEALED_COLOR, threadsOf } from './count-look.ts';

const STEP: number = 1 / 60;
const gate: MonsterDef = must(ARENA_CONTENT.monsters.get('timekeeper_gatekeeper'), 'gatekeeper');
const thrall: MonsterDef = must(ARENA_CONTENT.monsters.get('mended'), 'mended');

const KEEPER: BossDef = {
  ...must(gate.boss, 'gate boss'),
  barks: { aggro: [], death: [] },
  firstKill: null,
  phases: [
    { below: 1, skills: [{ skill: 'test_slam', weight: 1 }], barks: [], measure: [], beat: 0, holds: ['l_clock'], unseal: [], anchor: null, support: null },
    { below: 0.5, skills: [{ skill: 'test_slam', weight: 1 }], barks: [], measure: [], beat: 0, holds: [], unseal: [], anchor: null, support: null },
  ],
  countBreak: null,
  yields: true,
  presence: null,
};

const CONTENT: Content = {
  ...ARENA_CONTENT,
  monsters: new Map<string, MonsterDef>([
    ...ARENA_CONTENT.monsters,
    ['l_keeper', { ...thrall, id: 'l_keeper', life: 1000, scalesLife: false, boss: KEEPER }],
    ['l_clock', { ...thrall, id: 'l_clock', life: 200, scalesLife: false, behaviour: { type: 'fixed', sealed: false, collateral: 1, strikes: null } }],
    ['l_book', { ...thrall, id: 'l_book', life: 200, scalesLife: false, behaviour: { type: 'fixed', sealed: true, collateral: 0, strikes: null } }],
  ]),
};

interface Hall {
  readonly world: World;
  readonly keeper: MonsterState;
  readonly clocks: readonly MonsterState[];
  readonly book: MonsterState;
}

function hall(seed: number): Hall {
  const world: World = arena(seed, CONTENT);
  const keeper: MonsterState = place(world, 'l_keeper', ARENA_CENTRE);
  const clocks: MonsterState[] = [place(world, 'l_clock', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z }), place(world, 'l_clock', { x: ARENA_CENTRE.x - 6, z: ARENA_CENTRE.z })];
  const book: MonsterState = place(world, 'l_book', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 3 });
  book.sealed = true;
  return { world, keeper, clocks, book };
}

function strengths(parent: Object3D): number[] {
  const found: number[] = [];
  parent.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh) || !object.visible) return;
    const material: unknown = object.material;
    if (!(material instanceof ShaderMaterial)) return;
    const strength: unknown = material.uniforms['uStrength']?.value;
    if (typeof strength === 'number') found.push(strength);
  });
  return found;
}

void test('a thread runs from each standing holder to the boss only while his life is held at the line', (): void => {
  const { world, keeper, clocks } = hall(1);
  assert.deepEqual(threadsOf(world), []);
  keeper.life = Math.floor(keeper.maxLife * 0.5) + 1;
  const threads = threadsOf(world);
  assert.deepEqual(threads.map((thread): number => thread.holder), clocks.map((clock: MonsterState): number => clock.id));
  assert.equal(threads[0]?.to, keeper.pos);
  const first: MonsterState = must(clocks[0], 'clock');
  first.alive = false;
  assert.deepEqual(threadsOf(world).map((thread): number => thread.holder), [must(clocks[1], 'clock').id]);
});

void test('the boss takes a gold shade while held, a sealed piece a cold one, and the rest none', (): void => {
  const { world, keeper, clocks, book } = hall(2);
  assert.equal(countShadeOf(world, keeper), null);
  keeper.life = Math.floor(keeper.maxLife * 0.5) + 1;
  assert.deepEqual(countShadeOf(world, keeper), { color: HELD_COLOR, mix: COUNT_LOOK.heldMix });
  assert.deepEqual(countShadeOf(world, book), { color: SEALED_COLOR, mix: COUNT_LOOK.sealedMix });
  assert.equal(countShadeOf(world, must(clocks[0], 'clock')), null);
});

void test('threads ease in and out instead of appearing in one frame', (): void => {
  const { world, keeper } = hall(3);
  const parent: Group = new Group();
  const look = createCountLook(parent);
  keeper.life = Math.floor(keeper.maxLife * 0.5) + 1;
  look.update(STEP, world);
  const first: number = Math.max(...strengths(parent));
  assert.ok(first > 0 && first < COUNT_LOOK.threadGlow * 0.5, `first frame ${first}`);
  for (let frame: number = 0; frame < 60; frame += 1) look.update(STEP, world);
  assert.ok(Math.abs(Math.max(...strengths(parent)) - COUNT_LOOK.threadGlow) < 0.02);
  keeper.life = keeper.maxLife;
  look.update(STEP, world);
  const fading: number = Math.max(...strengths(parent));
  assert.ok(fading > COUNT_LOOK.threadGlow * 0.5, 'still visible the frame after the hold ends');
  for (let frame: number = 0; frame < 90; frame += 1) look.update(STEP, world);
  assert.deepEqual(strengths(parent), []);
});

void test('a broken count flashes softly where the piece stood and is gone after its time', (): void => {
  const { world, keeper, clocks } = hall(4);
  const parent: Group = new Group();
  const look = createCountLook(parent);
  const clock: MonsterState = must(clocks[0], 'clock');
  look.handle([{ type: 'count_broken', monsterId: keeper.id, piece: clock.id, pos: clock.pos }]);
  assert.equal(flashLevel(0), 0);
  assert.ok(flashLevel(COUNT_LOOK.flashTime * 0.2) > flashLevel(COUNT_LOOK.flashTime * 0.8));
  assert.equal(flashLevel(COUNT_LOOK.flashTime), 0);
  look.update(STEP, world);
  assert.equal(parent.children.length, 1);
  for (let frame: number = 0; frame < Math.ceil(COUNT_LOOK.flashTime / STEP) + 1; frame += 1) look.update(STEP, world);
  assert.equal(parent.children.length, 0);
});

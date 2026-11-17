import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, ShaderMaterial } from 'three';
import type { Object3D } from 'three';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { PackRankDef } from '../../sim/content/rank-types.ts';
import type { Content } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { createRankLook, RANK_LOOK, rankLightRadius, rankLookOf } from './rank-look.ts';

const STEP: number = 1 / 60;

function certain(rank: PackRankDef, id: string): PackRankDef {
  if (rank.chance === null) return rank;
  const sure: number = rank.id === id ? 1 : 0;
  return { ...rank, chance: { base: sure, perLevel: 0, max: sure, from: 1 } };
}

function only(id: string): Content {
  const ranks = ARENA_CONTENT.packRanks;
  const forced: PackRankDef[] = [];
  for (const rank of ranks.ranks) forced.push(certain(rank, id));
  return { ...ARENA_CONTENT, packRanks: { ...ranks, ranks: forced } };
}

function strengths(parent: Object3D): number[] {
  const found: number[] = [];
  parent.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const material: unknown = object.material;
    if (!(material instanceof ShaderMaterial)) return;
    const strength: unknown = material.uniforms['uStrength']?.value;
    if (typeof strength === 'number') found.push(strength);
  });
  return found;
}

function ranked(id: string): { readonly world: World; readonly monster: MonsterState } {
  const world: World = arena(5, only(id));
  world.zone = { ...world.zone, ranks: true };
  return { world, monster: place(world, 'unfinished_brute', ARENA_CENTRE) };
}

void test('a ranked monster stands in its rank colour on the ground and on its body, both eased in and out after it falls', (): void => {
  const { world, monster } = ranked('magic');
  const look = must(rankLookOf(monster), 'magic look');
  const parent: Group = new Group();
  const view = createRankLook(parent);
  view.update(STEP, world);
  const first: number = must(strengths(parent)[0], 'a light');
  const firstBody: number = must(view.bodyGlow(monster.id), 'a body glow').amount;
  assert.ok(first < look.ground && firstBody < look.body, 'nothing snaps on in one frame');
  for (let frame: number = 0; frame < 240; frame += 1) view.update(STEP, world);
  assert.ok(Math.abs(must(strengths(parent)[0], 'a light') - look.ground) < 0.02);
  assert.ok(Math.abs(must(view.bodyGlow(monster.id), 'a body glow').amount - look.body) < 0.02);
  assert.equal(must(view.bodyGlow(monster.id), 'glow').color.getHexString(), must(monster.def.rank?.aura, 'aura').slice(1));
  monster.alive = false;
  view.update(STEP, world);
  assert.ok(must(strengths(parent)[0], 'still fading') > 0);
  for (let frame: number = 0; frame < 600; frame += 1) view.update(STEP, world);
  assert.deepEqual(strengths(parent), []);
  assert.equal(view.bodyGlow(monster.id), null);
});

void test('a rare light is wider than a magic one, never smaller than the floor, and a plain monster has none', (): void => {
  const magic = ranked('magic').monster;
  const rare = ranked('rare').monster;
  assert.ok(rankLightRadius(rare, must(rankLookOf(rare), 'rare')) > rankLightRadius(magic, must(rankLookOf(magic), 'magic')));
  assert.ok(rankLightRadius(magic, must(rankLookOf(magic), 'magic')) >= RANK_LOOK.minRadius);
  const world: World = arena(5, ARENA_CONTENT);
  const plain: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
  assert.equal(rankLookOf(plain), null);
  const parent: Group = new Group();
  createRankLook(parent).update(STEP, world);
  assert.deepEqual(strengths(parent), []);
});

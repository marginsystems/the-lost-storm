import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { buildNavGrid, isWalkable } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import type { Content, ItemBaseDef, SkillTreeNodeDef } from './types.ts';
import { ANIMATION_KEYS } from './types.ts';

const content: Content = loadContent();
const grid: NavGrid = buildNavGrid(content.arena, content.props, content.player.radius);

void test('the shipped data loads and has no dangling references', (): void => {
  assert.deepEqual(contentProblems(content), []);
  assert.ok(content.monsters.size >= 2);
  assert.ok(content.skills.size >= 5);
});

void test('every monster has its skill and rig, and every rig has every animation', (): void => {
  for (const monster of content.monsters.values()) {
    assert.ok(content.skills.has(monster.skill), `${monster.id} skill`);
    assert.ok(content.rigs.has(monster.rig), `${monster.id} rig`);
  }
  assert.ok(content.rigs.has(content.player.rig));
  for (const rig of content.rigs.values()) {
    for (const key of ANIMATION_KEYS) assert.ok(rig.clips[key].clip.length > 0, `${rig.id} ${key}`);
  }
});

void test('every weapon base shows a model that exists in the attachments', (): void => {
  const weapons: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon');
  assert.ok(weapons.length >= 3);
  for (const base of weapons) {
    assert.ok(base.visual !== null, `${base.id} has no visual`);
    assert.ok(content.attachments.has(base.visual), `${base.id} visual ${base.visual} is not in attachments`);
  }
});

function reachable(nodes: readonly SkillTreeNodeDef[]): Set<string> {
  const reached: Set<string> = new Set<string>();
  let grew: boolean = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (reached.has(node.id)) continue;
      const has = (required: string): boolean => reached.has(required);
      const open: boolean = node.requires.length === 0 || (node.requireMode === 'all' ? node.requires.every(has) : node.requires.some(has));
      if (!open) continue;
      reached.add(node.id);
      grew = true;
    }
  }
  return reached;
}

void test('the skill tree has six nodes and each one can be reached from a root', (): void => {
  assert.equal(content.skillTree.length, 6);
  assert.ok(content.skillTree.some((node: SkillTreeNodeDef): boolean => node.requires.length === 0));
  assert.equal(reachable(content.skillTree).size, content.skillTree.length);
});

void test('the player start and every pack centre are walkable and connected', (): void => {
  const start = content.arena.playerStart;
  assert.ok(isWalkable(grid, start.x, start.z), 'player start');
  for (const pack of content.arena.packs) {
    assert.ok(isWalkable(grid, pack.x, pack.z), `pack at ${pack.x},${pack.z}`);
    const path = findPath(grid, start, pack);
    const last = must(path.at(-1), 'path end');
    assert.ok(Math.hypot(last.x - pack.x, last.z - pack.z) < 0.01, `path reaches pack at ${pack.x},${pack.z}`);
  }
});

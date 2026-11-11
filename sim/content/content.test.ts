import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, isWalkable } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import type { Content, ItemBaseDef, NpcDef, SkillTreeNodeDef, TalkDef, ZoneDef } from './types.ts';
import { ANIMATION_KEYS } from './types.ts';

const content: Content = loadContent();

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

function reaches(grid: NavGrid, from: Vec2, to: Vec2): boolean {
  if (!isWalkable(grid, to.x, to.z)) return false;
  if (Math.hypot(from.x - to.x, from.z - to.z) < 0.01) return true;
  const last: Vec2 | undefined = findPath(grid, from, to).at(-1);
  return last !== undefined && Math.hypot(last.x - to.x, last.z - to.z) < 0.01;
}

void test('every zone file under data/zones is loaded under its own name', (): void => {
  const files: string[] = readdirSync('data/zones').filter((name: string): boolean => name.endsWith('.json')).map((name: string): string => name.replace('.json', ''));
  assert.deepEqual([...content.zones.keys()].toSorted(), files.toSorted());
  assert.ok(content.zones.has(content.world.start));
});

void test('in every zone the start, packs, exits, arrival points, checkpoints and npcs are walkable and reachable on foot', (): void => {
  for (const zone of content.zones.values()) {
    const grid: NavGrid = buildNavGrid(zone, content.props, content.player.radius);
    const start: Vec2 = zone.playerStart;
    assert.ok(isWalkable(grid, start.x, start.z), `${zone.id} player start`);
    for (const pack of zone.packs) assert.ok(reaches(grid, start, pack), `${zone.id} pack at ${pack.x},${pack.z}`);
    for (const exit of zone.exits) {
      assert.ok(reaches(grid, start, exit), `${zone.id} exit ${exit.id}`);
      assert.ok(reaches(grid, start, exit.arrival), `${zone.id} exit ${exit.id} arrival`);
      assert.ok(Math.hypot(exit.x - exit.arrival.x, exit.z - exit.arrival.z) > exit.radius, `${zone.id} exit ${exit.id} arrival lies inside the exit`);
    }
    for (const checkpoint of zone.checkpoints) assert.ok(reaches(grid, start, checkpoint), `${zone.id} checkpoint ${checkpoint.id}`);
    for (const placed of zone.npcs) assert.ok(reaches(grid, start, placed), `${zone.id} npc ${placed.npc}`);
  }
});

void test('every exit leads to an exit that leads back, and every zone can be reached from the start zone', (): void => {
  const reached: Set<string> = new Set<string>([content.world.start]);
  const queue: string[] = [content.world.start];
  while (queue.length > 0) {
    const zone: ZoneDef = must(content.zones.get(must(queue.pop(), 'queued zone')), 'zone');
    for (const exit of zone.exits) {
      const far: ZoneDef = must(content.zones.get(exit.to), `${zone.id}.${exit.id} target`);
      const back = must(far.exits.find((candidate): boolean => candidate.id === exit.toExit), `${zone.id}.${exit.id} far exit`);
      assert.equal(back.to, zone.id);
      assert.equal(back.toExit, exit.id);
      if (!reached.has(far.id)) {
        reached.add(far.id);
        queue.push(far.id);
      }
    }
  }
  assert.deepEqual([...reached].toSorted(), [...content.zones.keys()].toSorted());
});

void test('towns are safe and wild zones have something to fight', (): void => {
  for (const zone of content.zones.values()) {
    if (zone.kind === 'town') {
      assert.equal(zone.packs.length, 0, `${zone.id} packs`);
      assert.equal(zone.surge, null, `${zone.id} surge`);
    } else {
      assert.ok(zone.packs.length > 0, `${zone.id} has no packs`);
    }
  }
});

void test('every line has a known speaker, belongs to exactly one conversation of that speaker, and says something', (): void => {
  const used: Map<string, string> = new Map<string, string>();
  for (const npc of content.npcs.values()) {
    for (const talk of npc.talks) {
      for (const lineId of talk.lines) {
        const line = must(content.lines.get(lineId), `line ${lineId}`);
        assert.equal(line.speaker, npc.id, `${lineId} speaker`);
        assert.equal(used.get(lineId), undefined, `${lineId} is used twice`);
        used.set(lineId, talk.id);
      }
    }
  }
  for (const line of content.lines.values()) {
    assert.ok(content.npcs.has(line.speaker), `${line.id} speaker ${line.speaker}`);
    assert.ok(used.has(line.id), `${line.id} is never spoken`);
    assert.ok(line.text.trim().length > 0, `${line.id} is empty`);
    assert.ok(line.id.startsWith(`${line.speaker}_`), `${line.id} does not start with its speaker`);
  }
});

void test('every npc is placed somewhere, has a body, and never falls silent', (): void => {
  const placed: Set<string> = new Set<string>([...content.zones.values()].flatMap((zone: ZoneDef): string[] => zone.npcs.map((entry): string => entry.npc)));
  const talkIds: string[] = [...content.npcs.values()].flatMap((npc: NpcDef): string[] => npc.talks.map((talk: TalkDef): string => talk.id));
  assert.equal(new Set<string>(talkIds).size, talkIds.length);
  for (const npc of content.npcs.values()) {
    assert.ok(placed.has(npc.id), `${npc.id} is not placed in any zone`);
    assert.ok(content.rigs.has(npc.rig), `${npc.id} rig`);
    assert.ok(npc.talks.some((talk: TalkDef): boolean => !talk.once), `${npc.id} has no repeatable conversation`);
    assert.ok(npc.name.length > 0 && npc.title.length > 0, `${npc.id} name and title`);
  }
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, isWalkable } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import { allHold } from '../world/conditions.ts';
import { createWorld } from '../world/create.ts';
import { nextTalk } from '../world/dialogue.ts';
import { stepWorld } from '../world/step.ts';
import type { World, WorldEvent } from '../world/types.ts';
import { enterZone } from '../world/zones.ts';
import type { Content, ItemBaseDef, NpcDef, ObjectiveDef, QuestDef, SkillTreeNodeDef, TalkDef, ZoneDef, ZoneExit, ZoneNpc, ZonePack } from './types.ts';
import { fields, items, text } from './read.ts';

const content: Content = loadContent();

const SAFE = { seeds: [1, 2, 3], seconds: 1.2, dt: 1 / 60 } as const;

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
    assert.ok(rig.clips.hit.length > 0 && rig.clips.death.length > 0, `${rig.id} hit and death`);
    assert.ok(Object.keys(rig.clips.actions).length > 0, `${rig.id} actions`);
  }
});

const GLB = { jsonLength: 12, jsonStart: 20 } as const;

function clipNames(path: string): string[] {
  const file: Buffer = readFileSync(path);
  const parsed: unknown = JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8'));
  return items(fields(parsed, path)['animations'], `${path}.animations`).map((entry: unknown): string => text(fields(entry, path), 'name', path));
}

void test('every clip a rig names is in the animation files it loads, and the hero dies in more than one way', (): void => {
  for (const rig of content.rigs.values()) {
    const shipped: Set<string> = new Set<string>(rig.animationUrls.flatMap((url: string): string[] => clipNames(`public/${url}`)));
    const named: string[] = [rig.clips.idle, rig.clips.run, ...rig.clips.hit, ...rig.clips.death, ...Object.values(rig.clips.actions).map((entry: { readonly clip: string }): string => entry.clip)];
    for (const clip of named) assert.ok(shipped.has(clip), `${rig.id} names clip ${clip}, which is not in ${rig.animationUrls.join(', ')}`);
  }
  const hero = must(content.rigs.get(content.player.rig), 'hero rig');
  assert.ok(new Set<string>(hero.clips.death).size >= 2);
  assert.ok(new Set<string>(hero.clips.hit).size >= 2);
});

void test('every skill on the bar and every monster skill has an action clip on the rig that uses it', (): void => {
  const hero = must(content.rigs.get(content.player.rig), 'hero rig');
  for (const binding of content.player.skillBar) {
    const skill = must(content.skills.get(binding.skill), binding.skill);
    for (const animation of [skill.animation, ...(skill.combo?.steps ?? []).map((step: { readonly animation: string }): string => step.animation)]) assert.ok(hero.clips.actions[animation] !== undefined, `${skill.id} ${animation}`);
  }
  for (const monster of content.monsters.values()) {
    const rig = must(content.rigs.get(monster.rig), monster.rig);
    const used: string[] = [monster.skill, ...(monster.boss?.phases ?? []).flatMap((phase: { readonly skills: readonly { readonly skill: string }[] }): string[] => phase.skills.map((entry: { readonly skill: string }): string => entry.skill))];
    for (const id of used) assert.ok(rig.clips.actions[must(content.skills.get(id), id).animation] !== undefined, `${monster.id} ${id}`);
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
    if (zone.waypoint !== null) assert.ok(reaches(grid, start, zone.waypoint), `${zone.id} waypoint`);
    for (const quest of content.quests.values()) {
      for (const objective of quest.objectives) {
        if (objective.type === 'reach' && objective.zone === zone.id) assert.ok(reaches(grid, start, objective), `${quest.id}.${objective.id} place`);
      }
    }
  }
});

void test('every exit out of a place leads to an exit that leads back, and every zone can be reached from the start zone or a void', (): void => {
  const roots: string[] = [content.world.start, ...[...content.zones.values()].filter((zone: ZoneDef): boolean => zone.kind === 'void').map((zone: ZoneDef): string => zone.id)];
  const reached: Set<string> = new Set<string>(roots);
  const queue: string[] = [...reached];
  while (queue.length > 0) {
    const zone: ZoneDef = must(content.zones.get(must(queue.pop(), 'queued zone')), 'zone');
    for (const exit of zone.exits) {
      const far: ZoneDef = must(content.zones.get(exit.to), `${zone.id}.${exit.id} target`);
      const back = must(far.exits.find((candidate): boolean => candidate.id === exit.toExit), `${zone.id}.${exit.id} far exit`);
      if (zone.kind !== 'void') {
        assert.equal(back.to, zone.id);
        assert.equal(back.toExit, exit.id);
      }
      if (!reached.has(far.id)) {
        reached.add(far.id);
        queue.push(far.id);
      }
    }
  }
  assert.deepEqual([...reached].toSorted(), [...content.zones.keys()].toSorted());
});

void test('towns and voids are safe and wild zones have something to fight', (): void => {
  for (const zone of content.zones.values()) {
    if (zone.kind === 'town' || zone.kind === 'void') {
      assert.equal(zone.packs.length, 0, `${zone.id} packs`);
      assert.equal(zone.surge, null, `${zone.id} surge`);
    } else {
      assert.ok(zone.packs.length > 0, `${zone.id} has no packs`);
    }
  }
});

void test('every line has a known speaker, is spoken in exactly one conversation, boss bark or place, and says something', (): void => {
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
  for (const monster of content.monsters.values()) {
    if (monster.boss === null) continue;
    for (const lineId of [...monster.boss.barks.aggro, ...monster.boss.barks.death, ...monster.boss.phases.flatMap((phase): readonly string[] => phase.barks)]) {
      const line = must(content.lines.get(lineId), `line ${lineId}`);
      assert.equal(line.speaker, monster.id, `${lineId} speaker`);
      assert.equal(used.get(lineId), undefined, `${lineId} is used twice`);
      used.set(lineId, monster.id);
    }
  }
  for (const zone of content.zones.values()) {
    for (const voice of zone.voices) {
      for (const lineId of voice.lines) {
        must(content.lines.get(lineId), `line ${lineId}`);
        assert.equal(used.get(lineId), undefined, `${lineId} is used twice`);
        used.set(lineId, voice.id);
      }
    }
  }
  for (const line of content.lines.values()) {
    assert.ok(content.npcs.has(line.speaker) || content.monsters.has(line.speaker), `${line.id} speaker ${line.speaker}`);
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

void test('quests form no cycle, and every one can start from a fresh save once the ones before it are done', (): void => {
  const done: Set<string> = new Set<string>();
  let grew: boolean = true;
  while (grew) {
    grew = false;
    for (const quest of content.quests.values()) {
      if (done.has(quest.id) || !quest.requires.every((required: string): boolean => done.has(required))) continue;
      done.add(quest.id);
      grew = true;
    }
  }
  assert.deepEqual([...done].toSorted(), [...content.quests.keys()].toSorted());
  assert.ok([...content.quests.values()].some((quest: QuestDef): boolean => quest.requires.length === 0));
});

void test('every talk objective has someone to talk to and a conversation of its own while it is current', (): void => {
  for (const quest of content.quests.values()) {
    quest.objectives.forEach((objective, index: number): void => {
      if (objective.type !== 'talk') return;
      const world: World = createWorld(content, { seed: 1, save: null });
      for (const earlier of content.quests.values()) world.quests[earlier.id] = earlier.objectives.length;
      world.quests[quest.id] = index;
      const npc: NpcDef = must(content.npcs.get(objective.npc), `${quest.id}.${objective.id} npc`);
      const placed: boolean = [...content.zones.values()].some((zone: ZoneDef): boolean => zone.npcs.some((entry): boolean => entry.npc === npc.id));
      assert.ok(placed, `${quest.id}.${objective.id}: ${npc.id} stands nowhere`);
      const talk: TalkDef = must(nextTalk(world, npc), `${quest.id}.${objective.id} conversation`);
      assert.ok(talk.when.some((condition): boolean => condition.type === 'objective' && condition.quest === quest.id && condition.objective === objective.id && condition.is === 'current'), `${quest.id}.${objective.id}: ${npc.id} says ${talk.id}, which is not written for this objective`);
    });
  }
});

void test('every zone but a void has one place in one act of the world map and no two share one', (): void => {
  const placed: string[] = content.world.acts.flatMap((act): string[] => act.atlas.places.map((place): string => place.zone));
  const mapped: string[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.kind !== 'void').map((zone: ZoneDef): string => zone.id);
  assert.deepEqual(placed.toSorted(), mapped.toSorted());
  for (const act of content.world.acts) {
    const spots: string[] = act.atlas.places.map((place): string => `${place.x},${place.y}`);
    assert.equal(new Set<string>(spots).size, spots.length, act.id);
  }
});

function progressAt(quest: QuestDef, index: number): Record<string, number> {
  const before: Set<string> = new Set<string>();
  const queue: string[] = [...quest.requires];
  while (queue.length > 0) {
    const id: string = must(queue.pop(), 'queued quest');
    if (before.has(id)) continue;
    before.add(id);
    queue.push(...must(content.quests.get(id), `quest ${id}`).requires);
  }
  const progress: Record<string, number> = {};
  for (const other of content.quests.values()) {
    if (before.has(other.id)) progress[other.id] = other.objectives.length;
    else if (other.id === quest.id) progress[other.id] = index;
    else if (other.requires.every((required: string): boolean => before.has(required))) progress[other.id] = 0;
  }
  return progress;
}

function worldAt(zone: ZoneDef, seed: number, progress: Record<string, number> | null): World {
  const world: World = createWorld(content, { seed, save: null });
  if (progress !== null) world.quests = { ...progress };
  enterZone(world, zone, { type: 'start' });
  world.events = [];
  return world;
}

function openZones(world: World): Set<string> {
  const reached: Set<string> = new Set<string>([content.world.start]);
  const queue: string[] = [content.world.start];
  while (queue.length > 0) {
    const zone: ZoneDef = zoneOf(content, must(queue.pop(), 'queued zone'));
    for (const exit of zone.exits) {
      if (reached.has(exit.to) || !allHold(world, exit.requires)) continue;
      reached.add(exit.to);
      queue.push(exit.to);
    }
  }
  return reached;
}

function placesOf(world: World, objective: ObjectiveDef): string[] {
  if (objective.type === 'reach') return [objective.zone];
  const zones: ZoneDef[] = [...content.zones.values()];
  if (objective.type === 'talk') {
    const npc: string = objective.npc;
    return zones.filter((zone: ZoneDef): boolean => zone.npcs.some((placed: ZoneNpc): boolean => placed.npc === npc && allHold(world, placed.when))).map((zone: ZoneDef): string => zone.id);
  }
  const monster: string = objective.monster;
  return zones.filter((zone: ZoneDef): boolean => zone.packs.some((pack: ZonePack): boolean => allHold(world, pack.when) && pack.members.some((member): boolean => member.monster === monster))).map((zone: ZoneDef): string => zone.id);
}

void test('every objective, taken in quest order, lies in a zone the exits already let the hero into', (): void => {
  for (const quest of content.quests.values()) {
    quest.objectives.forEach((objective: ObjectiveDef, index: number): void => {
      const world: World = createWorld(content, { seed: 1, save: null });
      world.quests = progressAt(quest, index);
      const open: Set<string> = openZones(world);
      const places: string[] = placesOf(world, objective);
      assert.ok(places.some((zone: string): boolean => open.has(zone)), `${quest.id}.${objective.id} is in [${places.join(', ')}] but only [${[...open].join(', ')}] can be entered`);
    });
  }
});

function noticed(world: World, at: Vec2): boolean {
  world.player.pos = { x: at.x, z: at.z };
  let woke: boolean = false;
  for (let elapsed: number = 0; elapsed < SAFE.seconds; elapsed += SAFE.dt) {
    if (stepWorld(world, [], SAFE.dt).some((event: WorldEvent): boolean => event.type === 'aggro')) woke = true;
  }
  return woke;
}

void test('no pack, and no boss while its fight is on, notices the hero at a zone start, an arrival point, a checkpoint or a waypoint', (): void => {
  for (const zone of content.zones.values()) {
    const states: (Record<string, number> | null)[] = [null];
    for (const quest of content.quests.values()) {
      quest.objectives.forEach((_objective: ObjectiveDef, index: number): void => {
        const probe: World = createWorld(content, { seed: 1, save: null });
        probe.quests = progressAt(quest, index);
        if (zone.packs.some((pack: ZonePack): boolean => pack.when.length > 0 && allHold(probe, pack.when))) states.push(probe.quests);
      });
    }
    for (const progress of states) {
      const probe: World = worldAt(zone, 1, progress);
      const safe: [string, Vec2][] = [
        ['start', zone.playerStart],
        ...zone.exits.filter((exit: ZoneExit): boolean => allHold(probe, exit.requires)).map((exit: ZoneExit): [string, Vec2] => [`arrival ${exit.id}`, exit.arrival]),
        ...zone.checkpoints.map((checkpoint): [string, Vec2] => [`checkpoint ${checkpoint.id}`, checkpoint]),
      ];
      if (zone.waypoint !== null) safe.push(['waypoint', zone.waypoint]);
      for (const [label, point] of safe) {
        for (const seed of SAFE.seeds) assert.equal(noticed(worldAt(zone, seed, progress), point), false, `${zone.id} ${label}, seed ${seed}, quests ${JSON.stringify(progress)}`);
      }
    }
  }
});

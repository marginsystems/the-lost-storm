import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, isWalkable, setDriftOpen } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { clipUrl, rigClipNames } from './clips.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import { objectivePaths } from './road.ts';
import { allHold } from '../world/conditions.ts';
import { createWorld } from '../world/create.ts';
import { nextTalk } from '../world/dialogue.ts';
import { startQuests } from '../world/quests.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, GroundItem, World, WorldEvent } from '../world/types.ts';
import { enterZone } from '../world/zones.ts';
import type { Content, ItemBaseDef, NpcDef, ObjectiveDef, PathObjective, QuestDef, RigDef, SkillTreeNodeDef, TalkDef, WearableDef, ZoneDef, ZoneExit, ZoneNpc, ZonePack } from './types.ts';
import { fields, items, text } from './read.ts';
import type { Fields } from './read.ts';
import type { MomentDef, MomentEcho, MomentField, WeightedMoment } from './moment-types.ts';

const ARRIVAL_PUSH = {
  clickAhead: 10,
  clickEvery: 15,
} as const;

const content: Content = loadContent();

const SAFE = { seeds: [1, 2, 3], seconds: 1.2, dt: 1 / 60 } as const;

void test('the shipped data loads and has no dangling references', (): void => {
  assert.deepEqual(contentProblems(content), []);
  assert.ok(content.monsters.size >= 2);
  assert.ok(content.skills.size >= 5);
});

void test('the hero is a dressed human: a human body, and starting clothes that are items for the chest, legs and feet, and a bare head', (): void => {
  const rig: RigDef = must(content.rigs.get(content.player.rig), 'hero rig');
  assert.match(rig.url, /^models\/characters\/human_/);
  const worn: WearableDef[] = content.player.startingItems.flatMap((id: string): readonly string[] => must(content.itemBases.get(id), id).wear).map((id: string): WearableDef => must(content.wearables.get(id), id));
  assert.deepEqual(worn.map((piece: WearableDef): string => piece.region).toSorted(), ['chest', 'feet', 'legs']);
  assert.ok(!content.player.startingItems.some((id: string): boolean => content.itemBases.get(id)?.slot === 'head'));
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

const FOOTPRINT = { solid: 1, cover: 0.4 } as const;

function footprint(path: string, scale: number): number {
  const file: Buffer = readFileSync(path);
  const parsed: Fields = fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
  const accessors: readonly unknown[] = items(parsed['accessors'], `${path}.accessors`);
  let wide: number = 0;
  for (const mesh of items(parsed['meshes'], `${path}.meshes`)) {
    for (const primitive of items(fields(mesh, path)['primitives'], `${path}.primitives`)) {
      const index: unknown = fields(fields(primitive, path)['attributes'], path)['POSITION'];
      const accessor: Fields = fields(typeof index === 'number' ? accessors[index] : null, `${path}.POSITION`);
      const low: readonly unknown[] = items(accessor['min'], `${path}.min`);
      const high: readonly unknown[] = items(accessor['max'], `${path}.max`);
      for (const axis of [0, 2]) {
        const from: unknown = low[axis];
        const to: unknown = high[axis];
        if (typeof from === 'number' && typeof to === 'number') wide = Math.max(wide, (to - from) * scale);
      }
    }
  }
  return wide;
}

void test('every moment prop a metre or more across has a collider that covers it, so nobody stands on a rock pile', (): void => {
  const used: Set<string> = new Set<string>([...content.moments.defs.values()].flatMap((def) => def.props.map((placed) => placed.prop)));
  for (const id of used) {
    const prop = must(content.props.get(id), id);
    const wide: number = footprint(`public/${prop.model}`, prop.scale);
    if (wide < FOOTPRINT.solid) continue;
    assert.ok(prop.blockRadius > 0, `${id} is ${wide.toFixed(1)} m across but has no collider`);
    assert.ok(prop.blockRadius * 2 + prop.blockLength >= wide * FOOTPRINT.cover, `${id} is ${wide.toFixed(1)} m across but its collider spans ${(prop.blockRadius * 2 + prop.blockLength).toFixed(1)} m`);
  }
});

void test('every zone prop a metre or more across blocks over its ground outline unless the data says it can be walked over', (): void => {
  for (const zone of content.zones.values()) {
    for (const placed of zone.props) {
      if (placed.when.length > 0) continue;
      const prop = must(content.props.get(placed.prop), placed.prop);
      const wide: number = footprint(`public/${prop.model}`, prop.scale);
      if (wide < FOOTPRINT.solid || prop.solid === false) continue;
      assert.ok(prop.footprint.length >= 3, `${zone.id} places ${placed.prop}, ${wide.toFixed(1)} m across, with no ground outline`);
    }
  }
});

void test('every rock a zone scatters along its edge is a known prop with a measured footprint', (): void => {
  for (const zone of content.zones.values()) {
    for (const id of zone.outside?.edge?.props ?? []) assert.ok((content.props.get(id)?.footprint.length ?? 0) >= 3, `${zone.id} edges with ${id}, which is not a solid prop`);
  }
});

void test('every clip a rig names has its own file in the rig clip folder, and the hero dies in more than one way', (): void => {
  for (const rig of content.rigs.values()) {
    for (const clip of rigClipNames(rig)) {
      const path: string = `public/${clipUrl(rig, clip)}`;
      assert.ok(existsSync(path), `${rig.id} names clip ${clip}, but ${path} is missing`);
      assert.deepEqual(clipNames(path), [clip], path);
    }
  }
  const hero = must(content.rigs.get(content.player.rig), 'hero rig');
  assert.ok(new Set<string>(hero.clips.death).size >= 2);
  assert.ok(new Set<string>(hero.clips.hit).size >= 2);
});

void test('every skill on the bar and every monster skill has an action clip on the rig that uses it', (): void => {
  const hero = must(content.rigs.get(content.player.rig), 'hero rig');
  for (const entry of content.player.skillBook) {
    const skill = must(content.skills.get(entry.skill), entry.skill);
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

void test('the Storm Chart has five paths of a hundred places or more, every place reachable, with crossings between paths', (): void => {
  assert.equal(content.chart.title, 'The Storm Chart');
  assert.ok(content.skillTree.length >= 100);
  assert.equal(reachable(content.skillTree).size, content.skillTree.length);
  const pathOf: ReadonlyMap<string, string> = new Map<string, string>(content.skillTree.map((node: SkillTreeNodeDef): [string, string] => [node.id, node.path]));
  for (const path of content.chart.paths) {
    const own: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === path.id);
    assert.ok(own.some((node: SkillTreeNodeDef): boolean => node.requires.length === 0), `${path.id} has an entrance`);
    assert.ok(own.filter((node: SkillTreeNodeDef): boolean => node.kind === 'notable').length >= 3, `${path.id} has named places`);
    assert.equal(own.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').length, 1, `${path.id} ends in one keystone`);
    assert.ok(own.filter((node: SkillTreeNodeDef): boolean => node.variant !== null).length >= 2, `${path.id} changes at least two skills`);
  }
  const crossings: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => new Set<string | undefined>(node.requires.map((id: string): string | undefined => pathOf.get(id))).size > 1);
  assert.ok(crossings.length >= content.chart.paths.length);
});

function reaches(grid: NavGrid, from: Vec2, to: Vec2): boolean {
  if (!isWalkable(grid, to.x, to.z)) return false;
  if (Math.hypot(from.x - to.x, from.z - to.z) < 0.01) return true;
  const last: Vec2 | undefined = findPath(grid, from, to).at(-1);
  return last !== undefined && Math.hypot(last.x - to.x, last.z - to.z) < 0.01;
}

function reachesWithin(grid: NavGrid, from: Vec2, centre: Vec2, radius: number): boolean {
  for (let dx: number = -radius; dx <= radius; dx += 1) {
    for (let dz: number = -radius; dz <= radius; dz += 1) {
      if (Math.hypot(dx, dz) <= radius && reaches(grid, from, { x: centre.x + dx, z: centre.z + dz })) return true;
    }
  }
  return false;
}

void test('every zone file under data/zones is loaded under its own name', (): void => {
  const files: string[] = readdirSync('data/zones').filter((name: string): boolean => name.endsWith('.json')).map((name: string): string => name.replace('.json', ''));
  assert.deepEqual([...content.zones.keys()].toSorted(), files.toSorted());
  assert.ok(content.zones.has(content.world.start));
});

void test('in every zone the start, packs, exits, arrival points, checkpoints and npcs are walkable and reachable on foot', (): void => {
  for (const zone of content.zones.values()) {
    const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
    for (const patch of grid.drifts) setDriftOpen(grid, patch, true);
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
        if (objective.type === 'reach' && objective.zone === zone.id) assert.ok(reachesWithin(grid, start, objective, objective.radius), `${quest.id}.${objective.id} place`);
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
  for (const monster of content.monsters.values()) {
    for (const lineId of monster.barks) {
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

function placesOf(world: World, goal: ObjectiveDef): string[] {
  return objectivePaths(goal).flatMap((path: PathObjective): string[] => pathPlaces(world, path));
}

function pathPlaces(world: World, objective: PathObjective): string[] {
  if (objective.type === 'reach') return [objective.zone];
  const zones: ZoneDef[] = [...content.zones.values()];
  if (objective.type === 'talk') {
    const npc: string = objective.npc;
    return zones.filter((zone: ZoneDef): boolean => zone.npcs.some((placed: ZoneNpc): boolean => placed.npc === npc && allHold(world, placed.when))).map((zone: ZoneDef): string => zone.id);
  }
  if (objective.type === 'moment') return zones.filter((zone: ZoneDef): boolean => zone.moments?.combat === true).map((zone: ZoneDef): string => zone.id);
  const monster: string = objective.monster;
  return zones.filter((zone: ZoneDef): boolean => zone.packs.some((pack: ZonePack): boolean => allHold(world, pack.when) && pack.members.some((member): boolean => member.monster === monster)) || strikesTurn(zone, monster)).map((zone: ZoneDef): string => zone.id);
}

function strikesTurn(zone: ZoneDef, monster: string): boolean {
  const field: MomentField | null = zone.moments;
  if (field === null || !field.combat) return false;
  return field.table.some((entry: WeightedMoment): boolean => {
    const moment: MomentDef | undefined = content.moments.defs.get(entry.moment);
    return moment !== undefined && moment.turnChance > 0 && moment.echoes.some((echo: MomentEcho): boolean => echo.turns && echo.monster === monster);
  });
}

void test('every objective, taken in quest order, lies in a zone the exits already let the hero into', (): void => {
  for (const quest of content.quests.values()) {
    quest.objectives.forEach((objective: ObjectiveDef, index: number): void => {
      const world: World = createWorld(content, { seed: 1, save: null });
      world.quests = progressAt(quest, index);
      if (!allHold(world, quest.when)) return;
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

void test('from the Hall arrival, clicking a few metres ahead toward each reach objective walks the hero straight there', (): void => {
  for (const quest of content.quests.values()) {
    for (const objective of quest.objectives) {
      for (const path of objectivePaths(objective)) {
        if (path.type !== 'reach' || path.zone !== content.world.start) continue;
        const world: World = createWorld(content, { seed: 3, save: null });
        enterZone(world, zoneOf(content, path.zone), { type: 'start' });
        world.monsters = [];
        const goal: Vec2 = { x: path.x, z: path.z };
        for (let step: number = 0; step < 1800 && Math.hypot(world.player.pos.x - goal.x, world.player.pos.z - goal.z) > path.radius; step += 1) {
          const left: number = Math.hypot(goal.x - world.player.pos.x, goal.z - world.player.pos.z);
          const reach: number = Math.min(left, ARRIVAL_PUSH.clickAhead);
          const dest: Vec2 = { x: world.player.pos.x + ((goal.x - world.player.pos.x) / left) * reach, z: world.player.pos.z + ((goal.z - world.player.pos.z) / left) * reach };
          stepWorld(world, step % ARRIVAL_PUSH.clickEvery === 0 ? [{ type: 'move', held: false, dest }] : [], 1 / 30);
        }
        assert.ok(Math.hypot(world.player.pos.x - goal.x, world.player.pos.z - goal.z) <= path.radius, `${quest.id}.${path.id} is not reached by a straight push from the arrival point; the hero stopped at ${world.player.pos.x.toFixed(1)},${world.player.pos.z.toFixed(1)}`);
      }
    }
  }
});

void test('no arrival point lies inside an exit, so walking in never sends the hero straight back', (): void => {
  for (const zone of content.zones.values()) {
    for (const exit of zone.exits) {
      for (const other of zone.exits) {
        assert.ok(Math.hypot(exit.arrival.x - other.x, exit.arrival.z - other.z) > other.radius, `${zone.id} ${exit.id} arrival inside ${other.id}`);
      }
    }
  }
});

void test('the hero walks out of the In-Between, through the Hall and on to the fire in the hideout without clicking an exit, and once a moment is cleared the Warden ends the slice', (): void => {
  const world: World = createWorld(content, { seed: 5, save: null });
  enterZone(world, zoneOf(content, 'between'), { type: 'start' });
  world.flags['opening'] = 'read';
  const fire = must(zoneOf(content, 'hideout').npcs.find((placed): boolean => placed.npc === 'warden_guide'), 'guide');
  const onward: ZoneExit = must(zoneOf(content, 'hall_of_time').exits.find((entry: ZoneExit): boolean => entry.to === 'hideout'), 'east exit');
  const walkTo = (zoneId: string, goal: Vec2, done: () => boolean): void => {
    world.monsters = [];
    for (let step: number = 0; step < 1800 && world.zone.id === zoneId && !done(); step += 1) stepWorld(world, step % 30 === 0 ? [{ type: 'move', held: false, dest: goal }] : [], 1 / 30);
  };
  const exit: ZoneExit = must(zoneOf(content, 'between').exits.find((entry: ZoneExit): boolean => entry.id === 'into_the_hall'), 'into_the_hall');
  for (let step: number = 0; step < 1800 && world.flags['first_blade'] === undefined; step += 1) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    const click: Command = blade === undefined ? { type: 'move', held: false, dest: { x: world.player.pos.x + world.heading.x * 30, z: world.player.pos.z + world.heading.z * 30 } } : { type: 'pickup', groundId: blade.id };
    stepWorld(world, step % 30 === 0 ? [click] : [], 1 / 30);
  }
  walkTo('between', exit, (): boolean => world.zone.id !== 'between');
  assert.equal(world.zone.id, 'hall_of_time');
  walkTo('hall_of_time', onward, (): boolean => world.zone.id !== 'hall_of_time');
  assert.equal(world.zone.id, 'hideout');
  walkTo('hideout', fire, (): boolean => world.flags['camp'] === 'reached');
  assert.equal(world.zone.id, 'hideout');
  assert.equal(world.flags['alpha_slice_complete'], undefined);
  world.quests['the_first_taker'] = must(content.quests.get('the_first_taker'), 'the_first_taker').objectives.length;
  startQuests(world);
  const guide = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_guide'), 'guide npc');
  for (let step: number = 0; step < 900 && world.dialogue === null; step += 1) stepWorld(world, step === 0 ? [{ type: 'talk', npcId: guide.id }] : [], 1 / 30);
  for (let guard: number = 0; guard < 40 && world.dialogue !== null; guard += 1) stepWorld(world, [{ type: 'advance' }], 1 / 30);
  assert.equal(world.flags['alpha_slice_complete'], 'reached');
});

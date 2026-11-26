import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, isWalkable, setDriftOpen } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { inRegion, walkRegion } from '../nav/region.ts';
import { placeLinks, startingPlaces } from '../progression.ts';
import { armPlaces } from '../specialty.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import { objectivePaths } from './road.ts';
import { sharedBarIcons } from './skill-icons.ts';
import { allHold } from '../world/conditions.ts';
import { createWorld } from '../world/create.ts';
import { nextTalk } from '../world/dialogue.ts';
import { startQuests } from '../world/quests.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, GroundItem, World, WorldEvent } from '../world/types.ts';
import { enterZone } from '../world/zones.ts';
import type { Condition, Content, NpcDef, ObjectiveDef, PathObjective, QuestDef, RigDef, SkillMod, SkillTreeNodeDef, TalkDef, WearableDef, ZoneDef, ZoneExit, ZoneNpc, ZonePack } from './types.ts';
import type { MomentDef, MomentEcho, MomentField, WeightedMoment } from './moment-types.ts';

const ARRIVAL_PUSH = {
  clickAhead: 10,
  clickEvery: 15,
} as const;

const content: Content = loadContent();

const SKILL_TREE_CROSSING = { maxCentreSteps: 8 } as const;

const SAFE = { seeds: [1, 2, 3], seconds: 1.2, dt: 1 / 60 } as const;

void test('the shipped data loads and has no dangling references', (): void => {
  assert.deepEqual(contentProblems(content), []);
  assert.ok(content.monsters.size >= 2);
  assert.ok(content.skills.size >= 5);
});

void test('every skill a player can put on the bar has its own icon, shared only with a change of the same skill', (): void => {
  assert.deepEqual(sharedBarIcons(content), []);
});

void test('the hero is a dressed human: a human body, and starting clothes that are items for the chest, legs and feet, and a bare head', (): void => {
  const rig: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  assert.notEqual(rig.frame, '');
  assert.equal(rig.url, `models/characters/${rig.frame}.glb`);
  const worn: WearableDef[] = content.player.startingItems.flatMap((id: string): readonly string[] => must(content.itemBases.get(id), id).wear).map((id: string): WearableDef => must(content.wearables.get(id), id));
  assert.deepEqual(worn.map((piece: WearableDef): string => piece.region).toSorted(), ['chest', 'feet', 'legs']);
  assert.ok(!content.player.startingItems.some((id: string): boolean => content.itemBases.get(id)?.slot === 'head'));
});

void test('every monster has its skill and rig, every rig has its actions, and every hero rig has hit and death clips', (): void => {
  for (const monster of content.monsters.values()) {
    assert.ok(content.skills.has(monster.skill), `${monster.id} skill`);
    assert.ok(content.rigs.has(monster.rig), `${monster.id} rig`);
  }
  for (const hero of content.player.heroes) {
    const rig: RigDef = must(content.rigs.get(hero.rig), `${hero.id} rig`);
    assert.ok(rig.clips.hit.length > 0 && rig.clips.death.length > 0, `${rig.id} hit and death`);
  }
  for (const rig of content.rigs.values()) assert.ok(Object.keys(rig.clips.actions).length > 0, `${rig.id} actions`);
});

function walked(links: ReadonlyMap<string, readonly string[]>, start: string): Map<string, number> {
  const steps: Map<string, number> = new Map<string, number>([[start, 0]]);
  const queue: string[] = [start];
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string | undefined = queue[index];
    const here: number = at === undefined ? 0 : (steps.get(at) ?? 0);
    for (const next of at === undefined ? [] : (links.get(at) ?? [])) {
      if (steps.has(next)) continue;
      steps.set(next, here + 1);
      queue.push(next);
    }
  }
  return steps;
}

void test('every place on the Skill Tree is reachable from every starting place by links walked either way, and no centre is far from another', (): void => {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const starts: readonly string[] = startingPlaces(content);
  assert.equal(starts.length, content.chart.paths.length);
  for (const start of starts) {
    const steps: ReadonlyMap<string, number> = walked(links, start);
    assert.equal(steps.size, content.skillTree.length, `${start} reaches every place`);
    for (const other of starts) assert.ok((steps.get(other) ?? Infinity) <= SKILL_TREE_CROSSING.maxCentreSteps, `${start} to ${other}`);
  }
});

void test('the Skill Tree has five paths of a hundred places or more, every place reachable, with crossings between paths', (): void => {
  assert.equal(content.chart.title, 'The Skill Tree');
  assert.ok(content.skillTree.length >= 100);
  const pathOf: ReadonlyMap<string, string> = new Map<string, string>(content.skillTree.map((node: SkillTreeNodeDef): [string, string] => [node.id, node.path]));
  for (const path of content.chart.paths) {
    const own: readonly SkillTreeNodeDef[] = armPlaces(content, path.id);
    assert.ok(own.some((node: SkillTreeNodeDef): boolean => node.requires.length === 0), `${path.id} has an entrance`);
    assert.ok(own.filter((node: SkillTreeNodeDef): boolean => node.kind === 'notable').length >= 3, `${path.id} has named places`);
    assert.equal(own.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').length, 1, `${path.id} ends in one keystone`);
    assert.ok(own.filter((node: SkillTreeNodeDef): boolean => node.variants.length > 0 || node.triggers.length > 0 || node.skillMods.some((mod: SkillMod): boolean => mod.field === 'echo')).length >= 2, `${path.id} changes at least two skills`);
  }
  const crossings: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => new Set<string | undefined>(node.requires.map((id: string): string | undefined => pathOf.get(id))).size > 1);
  assert.ok(crossings.length >= content.chart.paths.length);
});

function reaches(grid: NavGrid, from: Vec2, to: Vec2): boolean {
  return isWalkable(grid, to.x, to.z) && inRegion(walkRegion(grid, from), to);
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

void test('every exit out of a place leads to an exit that leads back, and every zone can be reached from the start zone, a void or the zone a flash opens from', (): void => {
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
    for (const flash of content.zones.values()) {
      if (flash.flash?.from !== zone.id || reached.has(flash.id)) continue;
      reached.add(flash.id);
      queue.push(flash.id);
    }
  }
  assert.deepEqual([...reached].toSorted(), [...content.zones.keys()].toSorted());
});

void test('towns, voids, duel grounds and flashes are safe and wild zones have something to fight', (): void => {
  for (const zone of content.zones.values()) {
    if (zone.kind === 'town' || zone.kind === 'void' || zone.duel !== null || zone.flash !== null) {
      assert.equal(zone.packs.length, 0, `${zone.id} packs`);
      assert.equal(zone.surge, null, `${zone.id} surge`);
    } else {
      assert.ok(zone.packs.length > 0, `${zone.id} has no packs`);
    }
  }
});

void test('every line has a known speaker, is spoken in exactly one conversation, boss bark or place (a speaker’s everyday talk may repeat a line of their own), and says something', (): void => {
  const used: Map<string, string> = new Map<string, string>();
  for (const npc of content.npcs.values()) {
    for (const talk of npc.talks) {
      for (const lineId of talk.lines) {
        const line = must(content.lines.get(lineId), `line ${lineId}`);
        assert.equal(line.speaker, npc.id, `${lineId} speaker`);
        const before: string | undefined = used.get(lineId);
        assert.ok(before === undefined || (!talk.once && npc.talks.some((own: TalkDef): boolean => own.id === before)), `${lineId} is used twice`);
        used.set(lineId, talk.id);
      }
    }
    for (const lineId of Object.values(npc.remarks)) {
      assert.equal(must(content.lines.get(lineId), `line ${lineId}`).speaker, npc.id, `${lineId} speaker`);
      assert.equal(used.get(lineId), undefined, `${lineId} is used twice`);
      used.set(lineId, npc.id);
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
  for (const book of content.books.values()) {
    for (const page of book.pages) {
      if (page.voice === null) continue;
      assert.equal(must(content.lines.get(page.voice), `line ${page.voice}`).speaker, book.id, `${page.voice} speaker`);
      assert.equal(used.get(page.voice), undefined, `${page.voice} is used twice`);
      used.set(page.voice, page.id);
    }
  }
  for (const line of content.lines.values()) {
    assert.ok(content.npcs.has(line.speaker) || content.monsters.has(line.speaker) || content.books.has(line.speaker), `${line.id} speaker ${line.speaker}`);
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

void test('every zone but a duel ground or a flash, the void included, has one place in one act of the world map and no two share one', (): void => {
  const placed: string[] = content.world.acts.flatMap((act): string[] => act.atlas.places.map((place): string => place.zone));
  const mapped: string[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.duel === null && zone.flash === null).map((zone: ZoneDef): string => zone.id);
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
      world.player.level = Math.max(world.player.level, ...objectivePaths(objective).flatMap((path: PathObjective): number[] => [...objective.when, ...path.when].flatMap((entry: Condition): number[] => (entry.type === 'level' && !entry.not ? [entry.atLeast] : []))));
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
      const safe: [string, Vec2, readonly string[]][] = [
        ['start', zone.playerStart, []],
        ...zone.exits.filter((exit: ZoneExit): boolean => allHold(probe, exit.requires)).map((exit: ZoneExit): [string, Vec2, readonly string[]] => [`arrival ${exit.id}`, exit.arrival, [exit.to]]),
        ...zone.checkpoints.map((checkpoint): [string, Vec2, readonly string[]] => [`checkpoint ${checkpoint.id}`, checkpoint, []]),
      ];
      if (zone.waypoint !== null) safe.push(['waypoint', zone.waypoint, []]);
      for (const [label, point, from] of safe) {
        for (const seed of SAFE.seeds) {
          const world: World = worldAt(zone, seed, progress);
          world.visited.push(...from);
          assert.equal(noticed(world, point), false, `${zone.id} ${label}, seed ${seed}, quests ${JSON.stringify(progress)}`);
        }
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

void test('the hero walks out of the In-Between, has the first moment marked cleared in the Hall (the real fight is covered in sim/world/quests.test.ts), clicks each exit on the way to the fire in the hideout, and the Warden gives the lesson that leads on to the gate', (): void => {
  const world: World = createWorld(content, { seed: 5, save: null });
  enterZone(world, zoneOf(content, 'between'), { type: 'start' });
  world.flags['opening'] = 'read';
  const fire = must(zoneOf(content, 'hideout').npcs.find((placed): boolean => placed.npc === 'warden_guide'), 'guide');
  const onward: ZoneExit = must(zoneOf(content, 'hall_of_time').exits.find((entry: ZoneExit): boolean => entry.to === 'hideout'), 'east exit');
  const walkTo = (zoneId: string, goal: Vec2, done: () => boolean): void => {
    world.monsters = [];
    for (let step: number = 0; step < 1800 && world.zone.id === zoneId && !done(); step += 1) stepWorld(world, step % 30 === 0 ? [{ type: 'move', held: false, dest: goal }] : [], 1 / 30);
  };
  const clickExit = (zoneId: string, exitId: string): void => {
    world.monsters = [];
    for (let step: number = 0; step < 1800 && world.zone.id === zoneId; step += 1) stepWorld(world, step % 30 === 0 ? [{ type: 'travel', exit: exitId }] : [], 1 / 30);
  };
  const exit: ZoneExit = must(zoneOf(content, 'between').exits.find((entry: ZoneExit): boolean => entry.id === 'into_the_hall'), 'into_the_hall');
  for (let step: number = 0; step < 1800 && world.flags['first_blade'] === undefined; step += 1) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    const click: Command = blade === undefined ? { type: 'move', held: false, dest: { x: world.player.pos.x + world.heading.x * 30, z: world.player.pos.z + world.heading.z * 30 } } : { type: 'pickup', groundId: blade.id };
    stepWorld(world, step % 30 === 0 ? [click] : [], 1 / 30);
  }
  clickExit('between', exit.id);
  assert.equal(world.zone.id, 'hall_of_time');
  world.quests['the_first_taker'] = must(content.quests.get('the_first_taker'), 'the_first_taker').objectives.length;
  startQuests(world);
  clickExit('hall_of_time', onward.id);
  assert.equal(world.zone.id, 'hideout');
  walkTo('hideout', fire, (): boolean => world.flags['camp'] === 'reached');
  assert.equal(world.zone.id, 'hideout');
  assert.equal(world.flags['camp'], 'reached');
  assert.equal(world.flags['alpha_slice_complete'], undefined);
  const guide = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_guide'), 'guide npc');
  const heardAtFire: string[] = [];
  for (let talk: number = 0; talk < 4 && world.flags['fire_lesson'] === undefined; talk += 1) {
    for (let step: number = 0; step < 900 && world.dialogue === null; step += 1) stepWorld(world, step === 0 ? [{ type: 'talk', npcId: guide.id }] : [], 1 / 30);
    heardAtFire.push(world.dialogue?.talk.id ?? '');
    for (let guard: number = 0; guard < 40 && world.dialogue !== null; guard += 1) stepWorld(world, [{ type: 'advance' }], 1 / 30);
  }
  assert.deepEqual(heardAtFire, ['warden_guide_first', 'warden_guide_lesson']);
  assert.equal(world.flags['fire_lesson'], 'given');
  assert.equal(world.flags['alpha_slice_complete'], undefined);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Condition, Content, QuestDef, ZoneDef, ZoneVoice, ZoneWaypoint } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { parseSaveText, toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';

const shipped: Content = loadContent();
const DT: number = 1 / 60;
const town: ZoneDef = zoneOf(shipped, shipped.world.start);
const well: ZoneWaypoint = must(town.waypoint, 'town waypoint');
const SPOT: Vec2 = { x: well.x, z: well.z };
const AWAY: Vec2 = town.playerStart;
const WORDS: readonly string[] = [...shipped.lines.keys()].slice(0, 2);
const opening: QuestDef = must([...shipped.quests.values()].find((quest: QuestDef): boolean => quest.requires.length === 0), 'opening quest');

function staged(when: readonly Condition[]): Content {
  const voice: ZoneVoice = { id: 'whisper', x: SPOT.x, z: SPOT.z, radius: 2, lines: WORDS, when };
  const zone: ZoneDef = { ...town, voices: [voice] };
  return { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [zone.id, zone]]) };
}

function standing(world: World, at: Vec2): WorldEvent[] {
  world.player.pos = { x: at.x, z: at.z };
  return stepWorld(world, [], DT);
}

function spoken(events: readonly WorldEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.type !== 'bark') continue;
    assert.equal(event.speaker, event.line.speaker);
    ids.push(event.line.id);
  }
  return ids;
}

void test('a voice speaks its lines in order the first time the hero steps into its circle, and never again', (): void => {
  assert.ok(Math.hypot(SPOT.x - AWAY.x, SPOT.z - AWAY.z) > 2);
  const world: World = createWorld(staged([]), { seed: 3, save: null });
  assert.deepEqual(spoken(standing(world, AWAY)), []);
  assert.deepEqual(world.heard.includes('whisper'), false);
  assert.deepEqual(spoken(standing(world, SPOT)), WORDS);
  assert.deepEqual(spoken(standing(world, SPOT)), []);
  assert.deepEqual(spoken(standing(world, AWAY)), []);
  assert.deepEqual(spoken(standing(world, SPOT)), []);
  assert.deepEqual(world.heard.filter((id: string): boolean => id === 'whisper'), ['whisper']);
});

void test('a voice waits for its condition and is not used up while it waits', (): void => {
  const after: Condition = { type: 'quest', quest: opening.id, is: 'done', not: false };
  const world: World = createWorld(staged([after]), { seed: 3, save: null });
  assert.deepEqual(spoken(standing(world, SPOT)), []);
  assert.equal(world.heard.includes('whisper'), false);
  world.quests[opening.id] = opening.objectives.length;
  assert.deepEqual(spoken(standing(world, SPOT)), WORDS);

  const before: Condition = { ...after, not: true };
  const late: World = createWorld(staged([before]), { seed: 3, save: null });
  late.quests[opening.id] = opening.objectives.length;
  assert.deepEqual(spoken(standing(late, SPOT)), []);
  const early: World = createWorld(staged([before]), { seed: 3, save: null });
  assert.deepEqual(spoken(standing(early, SPOT)), WORDS);
});

void test('a voice that was heard stays silent after a save and a reload', (): void => {
  const content: Content = staged([]);
  const world: World = createWorld(content, { seed: 3, save: null });
  assert.deepEqual(spoken(standing(world, SPOT)), WORDS);
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.ok(save.heard.includes('whisper'));
  const again: World = createWorld(content, { seed: 4, save });
  assert.deepEqual(spoken(standing(again, SPOT)), []);
  const unheard: World = createWorld(content, { seed: 4, save: { ...save, heard: [] } });
  assert.deepEqual(spoken(standing(unheard, SPOT)), WORDS);
});

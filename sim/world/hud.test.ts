import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn, zoneOf } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef, ZoneDef } from '../content/types.ts';
import { requestGlitch } from './glitch.ts';
import { loadContent } from '../content/content.ts';
import type { HudPart } from '../content/types.ts';
import { toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { heldParts, hudHidden } from './hud.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';

const errand: QuestDef = { id: 'errand', name: 'An Errand', requires: [], when: [], objectives: [{ id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} }] };
const shipped: Content = { ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[errand.id, errand]]) };

function withHud(hud: ZoneDef['hud']): World {
  const town: ZoneDef = { ...zoneOf(shipped, 'hub'), hud };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [town.id, town]]) };
  return worldIn(content, town.id, 1);
}

void test('a zone without a HUD rule shows the HUD', (): void => {
  assert.equal(hudHidden(withHud(null)), false);
});

void test('a HUD rule hides the HUD for as long as its conditions do not all hold', (): void => {
  const world: World = withHud({ until: [{ type: 'quest', quest: 'errand', is: 'done', not: false }] });
  assert.equal(hudHidden(world), true);
  world.quests['errand'] = 1;
  assert.equal(hudHidden(world), false);
});

void test('a HUD rule with no conditions hides the HUD for the whole stay', (): void => {
  const world: World = withHud({ until: [] });
  world.quests['errand'] = 1;
  assert.equal(hudHidden(world), true);
});

void test('the void hides the whole HUD while the hero wakes', (): void => {
  const voidZone: ZoneDef | undefined = [...shipped.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void');
  assert.ok(voidZone !== undefined);
  assert.equal(hudHidden(worldIn(shipped, voidZone.id, 1)), true);
});

void test('while a glitch holds the hero in the mist the HUD is hidden, and it returns after', (): void => {
  const world: World = withHud(null);
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), true);
  for (let step: number = 0; step < 120; step += 1) stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), false);
});

const real: Content = loadContent();
const DT: number = 1 / 60;

function newHero(): World {
  return createWorld(real, { seed: 2, save: null, opening: true });
}

function held(world: World): readonly HudPart[] {
  stepWorld(world, [], DT);
  return heldParts(world);
}

void test('a new hero holds back every staged HUD part until it is useful', (): void => {
  assert.deepEqual(held(newHero()), ['life', 'attack', 'skills', 'xp', 'mana', 'flasks', 'inventory', 'character', 'chart', 'map', 'minimap']);
});

void test('taking the blade brings the life globe, the basic attack slot and the XP line, and nothing else', (): void => {
  const world: World = newHero();
  world.flags['first_blade'] = 'found';
  assert.deepEqual(held(world), ['skills', 'mana', 'flasks', 'inventory', 'character', 'chart', 'map', 'minimap']);
});

void test('each later part arrives when it first becomes useful, and stays', (): void => {
  const world: World = newHero();
  world.flags['first_blade'] = 'found';
  world.player.life -= 1;
  assert.equal(held(world).includes('flasks'), false);
  world.player.life = world.player.maxLife;
  world.player.skillPoints = 1;
  const afterPoint: readonly HudPart[] = held(world);
  assert.equal(afterPoint.includes('chart') || afterPoint.includes('skills') || afterPoint.includes('flasks'), false);
  world.player.skillPoints = 0;
  world.visited.push('hall_of_time');
  assert.deepEqual(held(world), ['mana', 'inventory', 'character']);
  world.flags['first_blade'] = 'gone';
  assert.equal(held(world).includes('life'), false);
});

void test('a returning hero loaded from a save sees the whole HUD at once', (): void => {
  const saved: World = createWorld(real, { seed: 3, save: toSave(newHero()), opening: true });
  assert.deepEqual(held(saved), []);
});

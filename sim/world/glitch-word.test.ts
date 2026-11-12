import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, LineDef } from '../content/types.ts';
import { createWorld } from './create.ts';
import { spokenLine } from './glitch-word.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const line: LineDef = must(content.lines.get('warden_trader_goods'), 'warden_trader_goods');

void test('an armed wrong word puts a wrong name before the next line, then the line goes on as written', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.glitch.wrongWord = world.time + world.glitch.def.wrongWord.window;
  const spoken: LineDef = spokenLine(world, line);
  assert.ok(spoken.text.endsWith(line.text));
  assert.notEqual(spoken.text, line.text);
  assert.ok(world.glitch.def.wrongWord.names.some((name: string): boolean => spoken.text.startsWith(name)));
  assert.equal(spoken.id, line.id);
  assert.equal(world.glitch.wrongWord, null);
  assert.ok(world.events.some((event): boolean => event.type === 'glitch_word'));
  assert.deepEqual(spokenLine(world, line), line);
});

void test('a line from no named character is left alone and keeps the word armed', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.glitch.wrongWord = world.time + world.glitch.def.wrongWord.window;
  const stranger: LineDef = { ...line, speaker: 'nobody_at_all' };
  assert.deepEqual(spokenLine(world, stranger), stranger);
  assert.notEqual(world.glitch.wrongWord, null);
});

void test('an armed wrong word that no one speaks within its window is dropped', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.glitch.wrongWord = world.time + world.glitch.def.wrongWord.window;
  world.time += world.glitch.def.wrongWord.window + 1;
  assert.deepEqual(spokenLine(world, line), line);
  assert.equal(world.glitch.wrongWord, null);
  assert.equal(world.events.some((event): boolean => event.type === 'glitch_word'), false);
});

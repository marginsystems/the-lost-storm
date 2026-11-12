import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, LineDef } from '../content/types.ts';
import { createWorld } from './create.ts';
import { spokenLine } from './glitch-word.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const line: LineDef = must(content.lines.get('maren_wake_1'), 'maren_wake_1');

void test('an armed wrong word puts a wrong name before the next line, then the line goes on as written', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.glitch.wrongWord = true;
  const spoken: LineDef = spokenLine(world, line);
  assert.ok(spoken.text.endsWith(line.text));
  assert.notEqual(spoken.text, line.text);
  assert.ok(world.glitch.def.wrongWord.names.some((name: string): boolean => spoken.text.startsWith(name)));
  assert.equal(spoken.id, line.id);
  assert.equal(world.glitch.wrongWord, false);
  assert.ok(world.events.some((event): boolean => event.type === 'glitch_word'));
  assert.deepEqual(spokenLine(world, line), line);
});

void test('a line from no named character is left alone and keeps the word armed', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.glitch.wrongWord = true;
  const stranger: LineDef = { ...line, speaker: 'nobody_at_all' };
  assert.deepEqual(spokenLine(world, stranger), stranger);
  assert.equal(world.glitch.wrongWord, true);
});

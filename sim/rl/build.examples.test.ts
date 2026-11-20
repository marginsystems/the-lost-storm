import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Build } from './build.ts';
import { legalBuild } from './build.ts';
import { DUEL_KIT } from './kit.ts';

const CONTENT: Content = loadContent();
const FOLDER = 'rl/builds';
const EXAMPLES = { atLeast: 4 } as const;

function examples(): Build[] {
  return readdirSync(FOLDER).filter((name: string): boolean => name.endsWith('.json')).toSorted().map((name: string): Build => {
    const raw: unknown = JSON.parse(readFileSync(`${FOLDER}/${name}`, 'utf8'));
    return legalBuild(CONTENT, DUEL_KIT, raw, name);
  });
}

void test('every example build in rl/builds is legal at the duel level', (): void => {
  const builds: readonly Build[] = examples();
  assert.ok(builds.length >= EXAMPLES.atLeast);
  assert.equal(new Set<string>(builds.map((build: Build): string => build.name)).size, builds.length);
});

void test('the example builds between them carry every standard weapon', (): void => {
  const carried: ReadonlySet<string> = new Set<string>(examples().map((build: Build): string => build.weapon));
  assert.deepEqual([...DUEL_KIT.weapons].filter((weapon: string): boolean => !carried.has(weapon)), []);
});

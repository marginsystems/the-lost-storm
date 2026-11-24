import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { clipUrl } from './clips.ts';
import { loadContent } from './content.ts';
import { gestureClips } from './gestures.ts';
import { fields, items, text } from './read.ts';
import type { Fields } from './read.ts';
import type { Content, HeroDef, RigDef } from './types.ts';

const content: Content = loadContent();

const GLB = { jsonLength: 12, jsonStart: 20 } as const;

function glbJson(path: string): Fields {
  const file: Buffer = readFileSync(path);
  return fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
}

function heroRigs(): RigDef[] {
  return content.player.heroes.map((hero: HeroDef): RigDef => must(content.rigs.get(hero.rig), hero.rig));
}

void test('every hero body can play every gesture: each clip is a file in its clip folder holding that one clip', (): void => {
  const paths: Set<string> = new Set<string>(heroRigs().flatMap((rig: RigDef): string[] => gestureClips().map((clip: string): string => `public/${clipUrl(rig, clip)}`)));
  assert.ok(paths.size > 0);
  for (const path of paths) {
    assert.ok(existsSync(path), path);
    const animations: readonly unknown[] = items(glbJson(path)['animations'], path);
    assert.equal(animations.length, 1, path);
    assert.ok(path.endsWith(`/${text(fields(animations[0], path), 'name', path)}.glb`), path);
  }
});

void test('every gesture clip keys each of its tracks at least once', (): void => {
  for (const rig of heroRigs()) {
    for (const clip of gestureClips()) {
      const path: string = `public/${clipUrl(rig, clip)}`;
      const json: Fields = glbJson(path);
      const accessors: readonly unknown[] = items(json['accessors'], `${path}.accessors`);
      for (const entry of items(json['animations'], `${path}.animations`)) {
        for (const sampler of items(fields(entry, path)['samplers'], `${path}.samplers`)) {
          const input: unknown = fields(sampler, path)['input'];
          const count: unknown = typeof input === 'number' ? fields(accessors[input], path)['count'] : undefined;
          assert.ok(typeof count === 'number' && count >= 1, path);
        }
      }
    }
  }
});

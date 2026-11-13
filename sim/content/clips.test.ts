import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { clipUrl, rigClipNames } from './clips.ts';
import { loadContent } from './content.ts';
import type { Content, RigDef } from './types.ts';

const content: Content = loadContent();

void test('a rig names each of its clips once, idle and run among them', (): void => {
  const hero: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const names: string[] = rigClipNames(hero);
  assert.equal(new Set<string>(names).size, names.length);
  assert.ok(names.includes(hero.clips.idle));
  assert.ok(names.includes(hero.clips.run));
  for (const clip of hero.clips.death) assert.ok(names.includes(clip));
});

void test('a rig that rises loads its rise clip even when no other list names it', (): void => {
  const hero: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const rising: RigDef = { ...hero, clips: { ...hero.clips, death: [], rise: 'Jump_Land' } };
  assert.ok(rigClipNames(rising).includes('Jump_Land'));
});

void test('a clip lives in its own file in the rig clip folder', (): void => {
  const hero: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  assert.equal(clipUrl(hero, 'Sword_Idle'), `${hero.clipFolder}/Sword_Idle.glb`);
});

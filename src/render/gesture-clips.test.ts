import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import { must } from '../../test/support.ts';
import { settle } from '../../test/backend-support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import type { LoadedRig } from './character-library.ts';
import type { GestureClips } from './gesture-clips.ts';
import { createGestureClips } from './gesture-clips.ts';

const content: Content = loadContent();

function rigOf(id: string): LoadedRig {
  const def: RigDef = must(content.rigs.get(id), id);
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  return { def, template: new Group(), clips: { idle, run: idle, gaits: [], hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() }, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
}

void test('a body fetches each gesture clip once, and a clip is there only once it has arrived', async (): Promise<void> => {
  const asked: string[] = [];
  const clips: GestureClips = createGestureClips(async (rig: LoadedRig, name: string): Promise<AnimationClip> => {
    asked.push(`${rig.def.id}/${name}`);
    await settle();
    return new AnimationClip(name, 2, []);
  }, ['Yes', 'Sitting_Enter']);
  const man: LoadedRig = rigOf('hero_man');
  const woman: LoadedRig = rigOf('hero_woman');
  clips.want(man);
  clips.want(man);
  assert.equal(clips.clip(man, 'Yes'), null);
  await settle();
  await settle();
  assert.equal(clips.clip(man, 'Yes')?.duration, 2);
  assert.equal(clips.clip(woman, 'Yes'), null);
  clips.want(woman);
  await settle();
  await settle();
  assert.deepEqual(asked, ['hero_man/Yes', 'hero_man/Sitting_Enter', 'hero_woman/Yes', 'hero_woman/Sitting_Enter']);
  assert.equal(clips.clip(woman, 'Sitting_Enter')?.name, 'Sitting_Enter');
  assert.equal(clips.clip(woman, 'Nope'), null);
});

void test('a clip that fails to load stays missing and is not fetched again', async (): Promise<void> => {
  let tries: number = 0;
  const clips: GestureClips = createGestureClips((): Promise<AnimationClip> => {
    tries += 1;
    return Promise.reject(new Error('offline'));
  }, ['Yes']);
  const man: LoadedRig = rigOf('hero_man');
  clips.want(man);
  await settle();
  clips.want(man);
  await settle();
  assert.equal(clips.clip(man, 'Yes'), null);
  assert.equal(tries, 1);
});

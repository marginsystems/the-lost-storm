import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import type { ActorPose, ActorView, SyncOptions } from './actor-view.ts';
import { ACTOR, createActorView } from './actor-view.ts';
import type { CharacterLibrary, GaitClip, LoadedRig, RigClipSet } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';

const content: Content = loadContent();

const SYNC: SyncOptions = { rise: 1, floor: 0, turnRate: 10, seen: true };

const DT: number = 1 / 60;

interface Body {
  readonly view: ActorView;
  readonly idle: AnimationClip;
  readonly walk: AnimationClip;
}

function body(): Body {
  const def: RigDef = must(content.rigs.get('hero_man'), 'hero_man');
  const gaits: GaitClip[] = def.gaits.map((gait): GaitClip => ({ clip: new AnimationClip(gait.clip, 1, []), groundSpeed: gait.groundSpeed }));
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const clips: RigClipSet = { idle, run: idle, gaits, hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), 1, 0);
  return { view, idle, walk: must(gaits[0], 'walk').clip };
}

function pose(gait: number): ActorPose {
  return { pos: { x: 0, z: 0 }, facing: 0, motion: gait > 0 ? 'stride' : 'still', gait, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 };
}

function weight(view: ActorView, clip: AnimationClip): number {
  const action = view.rig.mixer.existingAction(clip);
  return action === null || !action.isRunning() ? 0 : action.getEffectiveWeight();
}

function frames(view: ActorView, seconds: number, gait: number = 0): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) view.sync(DT, pose(gait), SYNC);
}

void test('a one-shot gesture crossfades in from idle, plays once and crossfades back to idle', (): void => {
  const { view, idle } = body();
  const nod: AnimationClip = new AnimationClip('Yes', 2, []);
  frames(view, 0.5);
  view.gesture(nod, null);
  frames(view, ACTOR.recoverFade / 2);
  assert.ok(weight(view, nod) > 0 && weight(view, nod) < 1, 'the nod fades in rather than cutting');
  assert.ok(weight(view, idle) > 0, 'idle is still fading out');
  frames(view, 1);
  assert.equal(weight(view, nod), 1);
  frames(view, 2 - ACTOR.recoverFade / 2 - (ACTOR.recoverFade / 2 + 1));
  assert.ok(weight(view, idle) > 0 && weight(view, idle) < 1, 'idle fades back in as the nod ends');
  frames(view, 1);
  assert.equal(weight(view, idle), 1);
  assert.equal(weight(view, nod), 0);
});

void test('a held loop stays while the body stands, a new loop crossfades over it, and walking replaces it', (): void => {
  const { view, idle, walk } = body();
  const talk: AnimationClip = new AnimationClip('Idle_Talking_Loop', 3, []);
  const folded: AnimationClip = new AnimationClip('Idle_FoldArms_Loop', 3, []);
  view.gesture(null, talk);
  frames(view, 5);
  assert.equal(weight(view, talk), 1);
  view.gesture(null, folded);
  frames(view, ACTOR.recoverFade / 2);
  assert.ok(weight(view, folded) > 0 && weight(view, folded) < 1);
  assert.ok(weight(view, talk) > 0);
  frames(view, 1);
  assert.equal(weight(view, folded), 1);
  view.gesture(null, null);
  frames(view, 1, 1.2);
  assert.equal(weight(view, walk), 1);
  frames(view, 1);
  assert.equal(weight(view, idle), 1);
});

void test('a posture plays its way in once and then holds its loop', (): void => {
  const { view } = body();
  const enter: AnimationClip = new AnimationClip('Sitting_Enter', 1.3, []);
  const seated: AnimationClip = new AnimationClip('Sitting_Idle_Loop', 1.67, []);
  view.gesture(enter, seated);
  frames(view, 0.6);
  assert.equal(weight(view, enter), 1);
  frames(view, 3);
  assert.equal(weight(view, seated), 1);
  assert.equal(weight(view, enter), 0);
});

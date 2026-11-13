import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import { HERO } from '../../sim/hero.ts';
import { stepStride } from '../../sim/world/player.ts';
import type { ActorView } from './actor-view.ts';
import { createActorView } from './actor-view.ts';
import type { CharacterLibrary, GaitClip, LoadedRig, RigClipSet } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';

const content: Content = loadContent();

const SPEEDS: readonly number[] = [0.5, 1.2, 2.2, 2.8, 3, 3.4, 4.5, 7, 9, 6, 3.4, 3, 2.8, 2.2, 1.2, 0, 2.8, 3, 0.05, 3, 9, 0.5];

function heroView(def: RigDef): { readonly view: ActorView; readonly gaits: readonly GaitClip[]; readonly idle: AnimationClip } {
  const gaits: GaitClip[] = def.gaits.map((gait): GaitClip => ({ clip: new AnimationClip(gait.clip, 1, []), groundSpeed: gait.groundSpeed }));
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits, hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), HERO.size, 0);
  return { view, gaits, idle };
}

function playing(view: ActorView, clips: readonly AnimationClip[]): number {
  const weights: number[] = clips.map((clip: AnimationClip): number => {
    const action = view.rig.mixer.existingAction(clip);
    return action === null || !action.isRunning() ? 0 : action.getEffectiveWeight();
  });
  return weights.indexOf(Math.max(...weights));
}

for (const hero of content.player.heroes) {
  void test(`the ${hero.id} hero's step sounds are counted for the gait his view is playing, at every speed and through every change`, (): void => {
    const def: RigDef = must(content.rigs.get(hero.rig), hero.rig);
    const { view, gaits, idle } = heroView(def);
    const clips: readonly AnimationClip[] = [idle, ...gaits.map((gait: GaitClip): AnimationClip => gait.clip)];
    let held: number = -1;
    let stepping: number = 0;
    for (const speed of SPEEDS) {
      const counted = stepStride(def, speed, held);
      held = counted.gait;
      for (let frame: number = 0; frame < 60; frame += 1) {
        view.sync(1 / 30, { pos: { x: 0, z: 0 }, facing: 0, motion: speed > 0 ? 'stride' : 'still', gait: speed, knockTime: 0, busy: false, deadTime: 0 }, { rise: 1, floor: 0, turnRate: 10, seen: true });
      }
      const shown: number = playing(view, clips) - 1;
      if (counted.metres === null) {
        assert.equal(shown, -1, `at ${speed} m/s the view plays a gait but no step is counted`);
        continue;
      }
      stepping += 1;
      assert.equal(shown, counted.gait, `at ${speed} m/s the view plays gait ${shown} but steps are counted for gait ${counted.gait}`);
      assert.equal(counted.metres, must(def.gaits[counted.gait], 'gait').stride);
    }
    assert.ok(stepping > SPEEDS.length / 2);
  });
}

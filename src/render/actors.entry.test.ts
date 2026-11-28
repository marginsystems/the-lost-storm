import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { AnimationClip, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import { must } from '../../test/support.ts';
import { ACTORS, createActors } from './actors.ts';
import type { CharacterLibrary, LoadedRig } from './character-loader.ts';
import type { FramePacer } from './paced-work.ts';

function loaded(def: RigDef): LoadedRig {
  const template: Group = new Group();
  template.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
  const clip: AnimationClip = new AnimationClip('idle', 1, []);
  return { def, template, clips: { idle: clip, run: clip, gaits: [], hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() }, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
}

void test('a cave enemy can be aimed at on entry while its equipment is still loading', async (t: TestContext): Promise<void> => {
  const previous: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { location: { search: '' } }, configurable: true });
  t.after((): void => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', previous);
  });
  const content: Content = loadContent();
  const world: World = createWorld(content, { seed: 7, save: null });
  enterZone(world, must(content.zones.get('under_hall'), 'Hourfall Caves'), { type: 'start' });
  const foe: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.gear.length > 0), 'armed cave monster');
  world.monsters = [foe];
  const rigs: LoadedRig[] = [heroRig(content, world.player.hero), foe.def.rig].map((id: string): LoadedRig => loaded(must(content.rigs.get(id), id)));
  const library: CharacterLibrary = { rigs: new Map(rigs.map((rig: LoadedRig): [string, LoadedRig] => [rig.def.id, rig])), wearables: new Map(), attachments: new Map() };
  const pacer: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (message: string): void => { warnings.push(message); });
  const scene: Scene = new Scene();
  const actors = createActors(scene, library, world, false, undefined, null, pacer);
  await actors.raise(world);
  scene.updateMatrixWorld(true);
  const bounds: Box3 = new Box3();
  assert.ok(actors.boundsOf(foe.id, bounds));
  assert.ok(bounds.min.x <= foe.pos.x && bounds.max.x >= foe.pos.x);
  assert.ok(bounds.min.z <= foe.pos.z && bounds.max.z >= foe.pos.z);
  const missingWear = (): string[] => warnings.filter((message: string): boolean => message.includes('is drawn without'));
  actors.sync(0, world, null);
  assert.deepEqual(missingWear(), []);
  world.time += ACTORS.warnWearAfter;
  actors.sync(0, world, null);
  actors.sync(0, world, null);
  assert.equal(missingWear().length, 1);
});

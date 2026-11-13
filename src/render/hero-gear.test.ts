import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AttachmentDef, Content, RigDef, ZoneDef } from '../../sim/content/types.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import { toSave } from '../../sim/save.ts';
import { addToInventory, equipFromInventory } from '../../sim/world/character.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import type { ActorView } from './actor-view.ts';
import { createActorView } from './actor-view.ts';
import type { CharacterLibrary, LoadedAttachment, LoadedRig, RigClipSet, RigInstance } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';
import { holdEquipped } from './hero-gear.ts';

const content: Content = loadContent();
const rigDef: RigDef = must(content.rigs.get(content.player.rig), 'player rig');
const visual: string = must(must(content.itemBases.get('rusted_blade'), 'rusted_blade').visual, 'blade visual');
const attachmentDef: AttachmentDef = must(content.attachments.get(visual), 'blade attachment');

const clips: RigClipSet = {
  idle: new AnimationClip('armed_idle', 1, []),
  run: new AnimationClip('run', 1, []),
  gaits: [{ clip: new AnimationClip('walk', 1, []), groundSpeed: 1 }],
  hit: [],
  death: [],
  rise: null,
  actions: new Map(),
  unarmed: { idle: new AnimationClip('bare_idle', 1, []), actions: new Map() },
};

function rigTemplate(): Group {
  const template: Group = new Group();
  const hand: Bone = new Bone();
  hand.name = must(rigDef.sockets[attachmentDef.socket], 'socket').bone;
  template.add(hand);
  return template;
}

function bladeAttachment(): LoadedAttachment {
  const template: Group = new Group();
  template.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
  return { def: attachmentDef, template };
}

function library(withBlade: boolean): CharacterLibrary {
  const rig: LoadedRig = { def: rigDef, template: rigTemplate(), clips, bodyParts: [], bodyGroups: [], coveredModels: new Set<string>(), fitted: new Map() };
  return {
    rigs: new Map([[rigDef.id, rig]]),
    attachments: new Map(withBlade ? [[visual, bladeAttachment()]] : []),
    wearables: new Map(),
  };
}

function hero(held: CharacterLibrary): RigInstance {
  return instantiateRig(must(held.rigs.get(rigDef.id), 'loaded rig'), held, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false });
}

function armedWorld(): World {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.player.inventory.fill(null);
  addToInventory(world.player, must(generateItem(content, createRng(1), 900, 1, 'rusted_blade', 'common'), 'blade'));
  equipFromInventory(world, world.player.inventory.findIndex((item): boolean => item?.base === 'rusted_blade'));
  return world;
}

function idlePlaying(view: ActorView, clip: AnimationClip): boolean {
  view.sync(0.5, { pos: { x: 0, z: 0 }, facing: 0, motion: 'still', gait: 0, knockTime: 0, busy: false, deadTime: 0 }, { rise: 1, floor: 0, turnRate: 10, seen: true });
  return view.rig.mixer.existingAction(clip)?.isRunning() ?? false;
}

void test('the equipped blade is held and the armed idle plays after a zone change', (): void => {
  const world: World = armedWorld();
  const rig: RigInstance = hero(library(true));
  const view: ActorView = createActorView(rig, 1, 0);
  holdEquipped(content, rig, world.player.equipped);
  assert.equal(rig.armed(), true);
  const hall: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
  enterZone(world, hall, { type: 'start' });
  holdEquipped(content, rig, world.player.equipped);
  assert.equal(rig.armed(), true);
  assert.equal(idlePlaying(view, clips.idle), true);
});

void test('a loaded save shows the equipped blade and the armed idle', (): void => {
  const loaded: World = createWorld(content, { seed: 2, save: toSave(armedWorld()) });
  assert.equal(loaded.player.equipped.weapon?.base, 'rusted_blade');
  const rig: RigInstance = hero(library(true));
  holdEquipped(content, rig, loaded.player.equipped);
  const view: ActorView = createActorView(rig, 1, 0);
  assert.equal(rig.armed(), true);
  assert.equal(idlePlaying(view, clips.idle), true);
});

void test('a blade whose model loads late is picked up on the next frame', (): void => {
  const world: World = armedWorld();
  const held: CharacterLibrary = library(false);
  const rig: RigInstance = hero(held);
  holdEquipped(content, rig, world.player.equipped);
  assert.equal(rig.armed(), false);
  held.attachments.set(visual, bladeAttachment());
  holdEquipped(content, rig, world.player.equipped);
  assert.equal(rig.armed(), true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, BufferGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AttachmentDef, Content, RigDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedRig, RigClipSet, RigInstance } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';

const content: Content = loadContent();
const rigDef: RigDef = must(content.rigs.get(content.player.hero.rig), 'player rig');
const staffDef: AttachmentDef = must(content.attachments.get('driftwood_staff'), 'staff');
const swordDef: AttachmentDef = { ...staffDef, id: 'plain_sword' };
const FRAME: number = 1 / 60;
const UP: Vector3 = new Vector3(0, 1, 0);

const clips: RigClipSet = {
  idle: new AnimationClip('idle', 1, []),
  run: new AnimationClip('run', 1, []),
  gaits: [],
  hit: [],
  death: [],
  rise: null,
  actions: new Map(),
  unarmed: { idle: new AnimationClip('bare_idle', 1, []), actions: new Map() },
  stances: new Map(),
};

function rigHolding(def: AttachmentDef): { readonly rig: RigInstance; readonly hand: Object3D } {
  const template: Group = new Group();
  const hand: Bone = new Bone();
  hand.name = must(rigDef.sockets[def.socket], 'socket').bone;
  hand.rotation.set(0.7, 0.2, -1.1);
  template.add(hand);
  const held: Group = new Group();
  held.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
  const loaded: LoadedRig = { def: rigDef, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[rigDef.id, loaded]]), attachments: new Map([[def.id, { def, template: held }]]), wearables: new Map() };
  const rig: RigInstance = instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false });
  rig.setGear([def.id]);
  return { rig, hand: must(rig.root.getObjectByName(hand.name), 'hand') };
}

function settle(rig: RigInstance): void {
  for (let frame: number = 0; frame < 240; frame += 1) rig.stepWear(FRAME);
}

function lean(hand: Object3D): number {
  const holder: Object3D = must(hand.children[0], 'holder');
  hand.updateWorldMatrix(true, true);
  return UP.clone().applyQuaternion(holder.getWorldQuaternion(new Quaternion())).angleTo(UP);
}

void test('a piece the posture plants is held as its socket holds it until its wearer sits, then stands upright, and goes back to the hand when they rise', (): void => {
  const { rig, hand } = rigHolding(staffDef);
  settle(rig);
  const carried: number = lean(hand);
  assert.ok(carried > 0.1);
  rig.setPlanted([staffDef.id]);
  settle(rig);
  assert.ok(lean(hand) < 1e-6, `leans ${lean(hand)}`);
  rig.setPlanted([]);
  settle(rig);
  assert.ok(Math.abs(lean(hand) - carried) < 1e-6);
});

void test('the staff turns upright over a few frames and not in one', (): void => {
  const { rig, hand } = rigHolding(staffDef);
  settle(rig);
  const carried: number = lean(hand);
  rig.setPlanted([staffDef.id]);
  rig.stepWear(FRAME);
  const first: number = lean(hand);
  assert.ok(first < carried && first > 0.01, `${first} from ${carried}`);
});

void test('a held piece the posture does not name ignores the wearer sitting', (): void => {
  const { rig, hand } = rigHolding(swordDef);
  settle(rig);
  const carried: number = lean(hand);
  rig.setPlanted([staffDef.id]);
  settle(rig);
  assert.ok(Math.abs(lean(hand) - carried) < 1e-9);
});

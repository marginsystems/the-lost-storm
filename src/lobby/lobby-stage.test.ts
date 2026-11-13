import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip } from 'three';
import type { RigClipSet, StanceClipSet } from '../render/character-loader.ts';
import { coverShare, floorLift, LOBBY_FRAMING, LOBBY_STAGE, lobbyFraming, lobbyIdle, mistShare } from './lobby-stage.ts';
import type { Framing, IdleSource } from './lobby-stage.ts';

void test('a wide screen stands the hero larger and right of centre, clear of the dock under the middle', (): void => {
  assert.deepEqual(lobbyFraming(1440, 900), LOBBY_FRAMING.wide);
  assert.deepEqual(lobbyFraming(844, 390), LOBBY_FRAMING.wide);
});

void test('a tall phone raises the hero into the top half and steps back so the panels fit under him', (): void => {
  const tall: Framing = lobbyFraming(390, 844);
  assert.deepEqual(tall, LOBBY_FRAMING.tall);
  assert.deepEqual(lobbyFraming(0, 0), LOBBY_FRAMING.wide);
});

void test('the deepest sole over the idle is lifted to just above the floor, and a floating hero is lowered onto it', (): void => {
  assert.equal(floorLift([-0.01, -0.03, -0.02], 0.002), 0.032);
  assert.equal(floorLift([0.05, 0.08], 0), -0.05);
  assert.equal(floorLift([], 0.002), 0);
});

void test('the lobby hero plays the bare idle with no weapon, the stance idle of a held weapon, and his own armed idle while an equipped weapon is not in his hand yet', (): void => {
  const aim: StanceClipSet = { idle: new AnimationClip('aim_idle', 1, []), actions: new Map() };
  const bare: StanceClipSet = { idle: new AnimationClip('bare_idle', 1, []), actions: new Map() };
  const clips: RigClipSet = { idle: new AnimationClip('armed_idle', 1, []), run: new AnimationClip('run', 1, []), gaits: [], hit: [], death: [], rise: null, actions: new Map(), unarmed: bare, stances: new Map([['crossbow', aim]]) };
  const holding = (held: boolean, stance: StanceClipSet | null): IdleSource => ({ clips, armed: (): boolean => held, stance: (): StanceClipSet | null => (held ? stance : bare) });
  assert.equal(lobbyIdle(holding(false, null), false), bare.idle);
  assert.equal(lobbyIdle(holding(true, aim), true), aim.idle);
  assert.equal(lobbyIdle(holding(true, null), true), clips.idle);
  assert.equal(lobbyIdle(holding(false, null), true), clips.idle);
  assert.equal(lobbyIdle({ ...holding(false, null), clips: { ...clips, unarmed: null } }, false), clips.idle);
});

void test('the veil that hides a change of hero is solid over the whole figure and feathers to nothing at its edge', (): void => {
  const plateau: number = LOBBY_STAGE.coverPlateau;
  assert.equal(coverShare(0, plateau), 1);
  assert.equal(coverShare(plateau, plateau), 1);
  assert.equal(coverShare(1, plateau), 0);
  assert.equal(coverShare(1.4, plateau), 0);
  const mid: number = coverShare((1 + plateau) / 2, plateau);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.ok(LOBBY_STAGE.coverWide * plateau > 1.6 && LOBBY_STAGE.coverTall * plateau > 2.4);
});

void test('a mist layer is thick near the ground, gone at its top and sides, and broken into wisps', (): void => {
  assert.equal(mistShare(0.5, 1, 1), 0);
  assert.equal(mistShare(0, 0.3, 1), 0);
  assert.equal(mistShare(1, 0.3, 1), 0);
  assert.equal(mistShare(0.5, 0.3, 0.2), 0);
  assert.ok(mistShare(0.5, 0.2, 1) > mistShare(0.5, 0.7, 1));
  assert.ok(mistShare(0.5, 0.2, 1) > mistShare(0.5, 0.2, 0.5));
  assert.ok(LOBBY_STAGE.mistDepths.some((depth: number): boolean => depth > 0) && LOBBY_STAGE.mistDepths.some((depth: number): boolean => depth < -6));
});

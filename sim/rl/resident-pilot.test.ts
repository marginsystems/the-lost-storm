import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import type { Action } from './contract.ts';
import { ACTION_HEADS, contractShape, LAYOUT, MOVE_CHOICES, RL, SELF_FEATURES, SKILL_CHOICES } from './contract.ts';
import { GATHER, turnBetween } from './gather.ts';
import { moveBucket } from './moves.ts';
import type { PolicyContract } from './policy-file.ts';
import { expectedShapes } from './policy-file.ts';
import type { PilotPose, ResidentPilot } from './resident-pilot.ts';
import { createResidentPilot, RESIDENT, residentPilotFrom } from './resident-pilot.ts';
import type { RivalPilot } from './rival.ts';

const CONTENT: Content = loadContent();
const START = { x: 15.25, z: 21.25, facing: 0 } as const;
const SPOT: Vec2 = { x: 20.1, z: 20.9 };
const FRAME: number = 1 / 30;

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function plain(): ResidentPilot {
  return createResidentPilot({ content: CONTENT, zone: GATHER.hideout, pilot: null, start: START, seed: 4 });
}

function run(pilot: ResidentPilot, seconds: number, until: (pose: PilotPose) => boolean = (): boolean => false): PilotPose {
  let pose: PilotPose = pilot.step(FRAME);
  for (let frame: number = 1; frame < Math.round(seconds / FRAME) && !until(pose); frame += 1) pose = pilot.step(FRAME);
  return pose;
}

function objectiveSteer(calls: Uint8Array[]): RivalPilot {
  const dx: number = SELF_FEATURES.indexOf('objective_dx');
  const dz: number = SELF_FEATURES.indexOf('objective_dz');
  return (obs: Float32Array, mask: Uint8Array): Action => {
    calls.push(mask);
    const offset: Vec2 = { x: (obs[dx] ?? 0) * RL.distanceScale, z: (obs[dz] ?? 0) * RL.distanceScale };
    const near: boolean = Math.hypot(offset.x, offset.z) < GATHER.arrive * 0.8;
    return { move: near ? 0 : moveBucket(offset), skill: 1, target: 0, use: 1 };
  };
}

function fileBytes(contract: PolicyContract): Uint8Array {
  const shapes: Map<string, readonly number[]> = expectedShapes(contract, 4, 1);
  const tensors: { name: string; shape: readonly number[] }[] = [...shapes].map(([name, shape]: [string, readonly number[]]): { name: string; shape: readonly number[] } => ({ name, shape }));
  const numbers: number = tensors.reduce((sum: number, tensor: { shape: readonly number[] }): number => sum + tensor.shape.reduce((product: number, size: number): number => product * size, 1), 0);
  const text: Uint8Array = new TextEncoder().encode(JSON.stringify({ format: 1, dtype: 'float16', width: 4, layers: 1, attentionHeads: 2, contract, tensors, source: { update: 1 } }));
  const start: number = 8 + text.length;
  const padded: number = start + (start % 2);
  const bytes: Uint8Array = new Uint8Array(padded + numbers * 2);
  bytes.set(new TextEncoder().encode('LSPL'), 0);
  new DataView(bytes.buffer).setUint32(4, text.length, true);
  bytes.set(text, 8);
  return bytes;
}

void test('with no model he follows the path to a spot at the pace asked and stops there', (): void => {
  const pilot: ResidentPilot = plain();
  pilot.want({ kind: 'go', to: SPOT, pace: 1.5 });
  const walking: PilotPose = run(pilot, 1);
  assert.ok(walking.speed > 1.2 && walking.speed <= 1.55, `walked at ${walking.speed}`);
  assert.equal(walking.arrived, false);
  const there: PilotPose = run(pilot, 10, (pose: PilotPose): boolean => pose.arrived);
  assert.equal(there.arrived, true);
  assert.ok(gap(there, SPOT) <= GATHER.arrive);
  assert.equal(run(pilot, 0.5).speed, 0);
});

void test('with no model he walks up to a person, stops at a comfortable distance and faces them', (): void => {
  const pilot: ResidentPilot = plain();
  pilot.see([{ id: 'ana', x: 21, z: 21, facing: 0 }]);
  pilot.want({ kind: 'meet', who: 'ana', pace: 2 });
  const met: PilotPose = run(pilot, 12, (pose: PilotPose): boolean => pose.arrived);
  assert.equal(met.arrived, true);
  const apart: number = gap(met, { x: 21, z: 21 });
  assert.ok(apart >= GATHER.comfort.min && apart <= GATHER.comfort.max, `stopped ${apart} m away`);
  assert.ok(Math.abs(turnBetween(met.facing, facingOf({ x: 21 - met.x, z: 21 - met.z }))) <= GATHER.facingSlack);
});

void test('a person who walks off is followed, and one who leaves is no longer met', (): void => {
  const pilot: ResidentPilot = plain();
  pilot.see([{ id: 'ana', x: 19, z: 21, facing: 0 }]);
  pilot.want({ kind: 'meet', who: 'ana', pace: 2 });
  run(pilot, 6, (pose: PilotPose): boolean => pose.arrived);
  pilot.see([{ id: 'ana', x: 26, z: 21, facing: 0 }]);
  assert.equal(pilot.step(FRAME).arrived, false);
  const again: PilotPose = run(pilot, 12, (pose: PilotPose): boolean => pose.arrived);
  assert.equal(again.arrived, true);
  assert.ok(gap(again, { x: 26, z: 21 }) <= GATHER.comfort.max);
  pilot.see([]);
  const alone: PilotPose = run(pilot, 1);
  assert.equal(alone.arrived, false);
  assert.equal(alone.speed, 0);
});

void test('with no model, standing turns him in place toward the point', (): void => {
  const pilot: ResidentPilot = plain();
  const face: Vec2 = { x: START.x - 5, z: START.z };
  pilot.want({ kind: 'stand', face });
  const turned: PilotPose = run(pilot, 3, (pose: PilotPose): boolean => pose.arrived);
  assert.equal(turned.arrived, true);
  assert.ok(gap(turned, START) < 0.1);
  assert.ok(Math.abs(turnBetween(turned.facing, facingOf({ x: -1, z: 0 }))) <= GATHER.facingSlack);
  pilot.want({ kind: 'stand', face: null });
  assert.equal(pilot.step(FRAME).arrived, true);
});

void test('a model is asked every few ticks with only moves open, and walks him to the spot', (): void => {
  const calls: Uint8Array[] = [];
  const pilot: ResidentPilot = createResidentPilot({ content: CONTENT, zone: GATHER.hideout, pilot: objectiveSteer(calls), start: START, seed: 4 });
  pilot.want({ kind: 'go', to: SPOT, pace: 1.8 });
  run(pilot, 1);
  assert.equal(calls.length, Math.ceil(30 / RL.ticksPerDecision));
  for (const mask of calls) for (let choice: number = 1; choice < SKILL_CHOICES; choice += 1) assert.equal(mask[MOVE_CHOICES + choice], 0);
  const there: PilotPose = run(pilot, 10, (pose: PilotPose): boolean => pose.arrived);
  assert.equal(there.arrived, true);
});

void test('a long frame is stepped in sim ticks, never more than a few at once', (): void => {
  const calls: Uint8Array[] = [];
  const pilot: ResidentPilot = createResidentPilot({ content: CONTENT, zone: GATHER.hideout, pilot: objectiveSteer(calls), start: START, seed: 4 });
  pilot.want({ kind: 'go', to: SPOT, pace: 1.8 });
  pilot.step(5);
  assert.equal(calls.length, Math.ceil(RESIDENT.mostTicks / RL.ticksPerDecision));
  pilot.step(0);
  assert.equal(calls.length, Math.ceil(RESIDENT.mostTicks / RL.ticksPerDecision));
});

void test('a model file for the game contract becomes a pilot, and anything else is refused', (): void => {
  const shape = contractShape();
  const fitting: RivalPilot = residentPilotFrom(fileBytes({ version: shape.version, fingerprint: shape.fingerprint, layout: LAYOUT, heads: ACTION_HEADS }));
  const action: Action = fitting(new Float32Array(LAYOUT.size), new Uint8Array(LAYOUT.mask).fill(1));
  assert.ok(Number.isInteger(action.move) && action.move >= 0 && action.move < MOVE_CHOICES);
  assert.throws((): RivalPilot => residentPilotFrom(fileBytes({ version: shape.version, fingerprint: 'feedbeef', layout: LAYOUT, heads: ACTION_HEADS })), /resident's model was trained for contract feedbeef/);
  assert.throws((): RivalPilot => residentPilotFrom(new Uint8Array(16)), /magic/);
});

void test('a zone that does not exist is refused', (): void => {
  assert.throws((): ResidentPilot => createResidentPilot({ content: CONTENT, zone: 'nowhere', pilot: null, start: START, seed: 1 }), /no zone nowhere/);
});

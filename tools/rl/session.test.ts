import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { contractShape, LAYOUT, RL } from '../../sim/rl/contract.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Reply, Session } from './session.ts';
import { handle, readPoolOptions } from './session.ts';

function session(): Session {
  return { content: loadContent(), pool: null };
}

function only(reply: Reply): Frame {
  const all: Buffer[] = [...reply.frames];
  const out: Buffer | undefined = all[0];
  assert.ok(out !== undefined && all.length === 1);
  return { kind: out.readUInt8(FRAME.word), payload: out.subarray(FRAME.header) };
}

function request(kind: number, value: unknown): Frame {
  return { kind, payload: frame(kind, jsonPart(value)).subarray(FRAME.header + FRAME.word) };
}

void test('hello answers with the contract the trainer must match', (): void => {
  const answer: Frame = only(handle(session(), request(FRAME.hello, { seed: 3, envs: 2 })));
  assert.equal(answer.kind, FRAME.hello);
  const shape = readJson(answer.payload.subarray(FRAME.word));
  assert.deepEqual(shape, JSON.parse(JSON.stringify({ ...contractShape(), envs: 2 })));
});

void test('reset and step answer with observations for every arena', (): void => {
  const open: Session = session();
  handle(open, request(FRAME.hello, { seed: 4, envs: 2, waves: 1 }));
  const reset: Frame = only(handle(open, { kind: FRAME.reset, payload: Buffer.alloc(0) }));
  assert.equal(reset.kind, FRAME.observations);
  assert.equal(reset.payload.readUInt32LE(0), 2);
  assert.equal(reset.payload.readUInt32LE(4), LAYOUT.size);
  const step: Frame = only(handle(open, { kind: FRAME.step, payload: Buffer.alloc(2 * RL.actionParts * FRAME.word) }));
  assert.equal(step.kind, FRAME.observations);
});

void test('a step before hello and a bad hello come back as errors, not crashes', (): void => {
  assert.equal(only(handle(session(), { kind: FRAME.step, payload: Buffer.alloc(0) })).kind, FRAME.error);
  assert.equal(only(handle(session(), request(FRAME.hello, { envs: -1 }))).kind, FRAME.error);
  assert.equal(only(handle(session(), request(FRAME.hello, { envs: 1, jitter: 1.5 }))).kind, FRAME.error);
  assert.throws((): unknown => readPoolOptions('nope'));
});

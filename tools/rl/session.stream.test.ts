import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { LAYOUT } from '../../sim/rl/contract.ts';
import { fields } from '../../sim/content/read.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Session } from './session.ts';
import { handle } from './session.ts';

function session(): Session {
  return { content: loadContent(), pool: null };
}

function request(kind: number, value: unknown): Frame {
  return { kind, payload: frame(kind, jsonPart(value)).subarray(FRAME.header + FRAME.word) };
}

function kindOf(out: Buffer): number {
  return out.readUInt8(FRAME.word);
}

function infoOf(out: Buffer): unknown {
  const payload: Buffer = out.subarray(FRAME.header);
  const count: number = payload.readUInt32LE(0);
  const at: number = 3 * FRAME.word + count * (LAYOUT.size * FRAME.word + 4 * FRAME.word + LAYOUT.mask);
  return readJson(payload.subarray(at + FRAME.word));
}

void test('demonstrations stream one frame per episode, then an empty frame marked done', (): void => {
  const frames: Buffer[] = [...handle(session(), request(FRAME.demo, { seed: 5, episodes: 2, waves: 1 })).frames];
  assert.equal(frames.length, 3);
  assert.ok(frames.every((out: Buffer): boolean => kindOf(out) === FRAME.demonstrations));
  const last: Buffer | undefined = frames.at(-1);
  assert.ok(last !== undefined);
  assert.equal(last.subarray(FRAME.header).readUInt32LE(0), 0);
  assert.equal(fields(infoOf(last), 'info')['done'], true);
  const first: Buffer | undefined = frames[0];
  assert.ok(first !== undefined && first.subarray(FRAME.header).readUInt32LE(0) > 0);
  assert.equal(fields(infoOf(first), 'info')['done'], false);
});

void test('a seed that cannot be counted up safely is refused', (): void => {
  for (const seed of [2 ** 53, 2 ** 41, 1.5]) {
    const hello: Buffer[] = [...handle(session(), request(FRAME.hello, { seed, envs: 1 })).frames];
    assert.deepEqual(hello.map(kindOf), [FRAME.error]);
    const demo: Buffer[] = [...handle(session(), request(FRAME.demo, { seed, episodes: 1 })).frames];
    assert.deepEqual(demo.map(kindOf), [FRAME.error]);
  }
});

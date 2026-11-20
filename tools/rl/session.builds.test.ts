import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Fields } from '../../sim/content/read.ts';
import { fields } from '../../sim/content/read.ts';
import { BUILD } from '../../sim/rl/build.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Reply, Session } from './session.ts';
import { handle, readDemoRequest, readPoolOptions } from './session.ts';

const SPIN = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'] } as const;
const WALL = { name: 'Wall', weapon: 'iron_maul', skills: ['thunderclap'], route: ['stone_thunderclap', 'tempered_body', 'stone_1'] } as const;
const ILLEGAL = { name: 'Cheat', weapon: 'gullwing_blade', skills: [], route: [] } as const;

function session(): Session {
  return { content: loadContent(), pool: null };
}

function only(reply: Reply): Frame {
  const all: Buffer[] = [...reply.frames];
  const out: Buffer | undefined = all[0];
  assert.ok(out !== undefined && all.length === 1);
  return { kind: out.readUInt8(FRAME.word), payload: out.subarray(FRAME.header) };
}

function hello(value: unknown): Frame {
  return only(handle(session(), { kind: FRAME.hello, payload: frame(FRAME.hello, jsonPart(value)).subarray(FRAME.header + FRAME.word) }));
}

void test('hello with builds names the learner, the rivals that fit and the seats, at the duel level', (): void => {
  const answer: Frame = hello({ seed: 3, envs: 2, duels: 1, build: SPIN, rivals: [WALL, ILLEGAL] });
  assert.equal(answer.kind, FRAME.hello);
  const said: Fields = fields(readJson(answer.payload.subarray(FRAME.word)), 'hello');
  assert.equal(said['duelLevel'], BUILD.level);
  assert.equal(said['build'], 'Spin');
  assert.deepEqual(said['rivals'], ['Wall']);
  assert.deepEqual(said['seats'], []);
});

void test('an illegal learner or seat build is refused with what is wrong', (): void => {
  const learner: Frame = hello({ seed: 3, envs: 1, build: ILLEGAL });
  assert.equal(learner.kind, FRAME.error);
  assert.match(JSON.stringify(readJson(learner.payload.subarray(FRAME.word))), /gullwing_blade is not a standard weapon/);
  assert.equal(hello({ seed: 3, envs: 2, duels: 1, seats: [SPIN, ILLEGAL] }).kind, FRAME.error);
  assert.equal(hello({ seed: 3, envs: 2, duels: 1, seats: [SPIN] }).kind, FRAME.error);
});

void test('the pool and demo requests read builds, and leave them out when none are given', (): void => {
  assert.equal(readPoolOptions({ seed: 1 }).build, undefined);
  assert.equal(readPoolOptions({ seed: 1, build: SPIN }).build?.name, 'Spin');
  assert.deepEqual(readPoolOptions({ seed: 1, seats: [null, WALL] }).seats?.map((seat): string | null => seat?.name ?? null), [null, 'Wall']);
  assert.equal(readDemoRequest({ seed: 1 }).build, null);
  assert.equal(readDemoRequest({ seed: 1, build: WALL }).build?.name, 'Wall');
});

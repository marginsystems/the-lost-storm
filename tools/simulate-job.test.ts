import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JobMessage } from './simulate-job.ts';
import { readDoneMessage, readJobMessage } from './simulate-job.ts';

void test('job and done messages survive the trip to a worker and back', (): void => {
  const messages: JobMessage[] = [
    { index: 0, job: { scenario: { kind: 'slice' }, skill: 'poor', build: 'mixed', seed: 1 } },
    { index: 1, job: { scenario: { kind: 'farm', minutes: 5 }, skill: 'careful', build: 'echo', seed: 2 } },
    { index: 2, job: { scenario: { kind: 'fight', moment: 'campfire', repeats: 3 }, skill: 'average', build: 'blade', seed: 3 } },
    { index: 3, job: { scenario: { kind: 'level', level: 5, minutes: 60 }, skill: 'average', build: 'stone', seed: 4 } },
    { index: 4, job: { scenario: { kind: 'over', hero: 9, zone: 1, minutes: 20 }, skill: 'careful', build: 'mixed', seed: 5 } },
  ];
  for (const message of messages) assert.deepEqual(readJobMessage(structuredClone(message)), message);
  assert.deepEqual(readDoneMessage({ index: 2, stream: '{}' }), { index: 2, stream: '{}' });
  assert.throws((): JobMessage => readJobMessage({ index: 0, job: { scenario: { kind: 'dance' }, skill: 'x', build: 'y', seed: 1 } }));
});

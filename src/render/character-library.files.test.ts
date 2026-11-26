import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settle } from '../../test/backend-support.ts';
import { loadRigFiles } from './character-library.ts';

void test('a foreground rig starts its clip requests once while its body is still arriving', async (): Promise<void> => {
  const order: string[] = [];
  const files = await loadRigFiles(async (receiving: () => void): Promise<string> => {
    order.push('first bytes');
    receiving();
    receiving();
    await settle();
    order.push('body ready');
    return 'body';
  }, (): Promise<string[]> => {
    order.push('clips requested');
    return Promise.resolve(['idle', 'run']);
  });
  assert.deepEqual(order, ['first bytes', 'clips requested', 'body ready']);
  assert.deepEqual(files, ['body', ['idle', 'run']]);
});

void test('a cached body or a background load can complete without progress events', async (): Promise<void> => {
  const order: string[] = [];
  const files = await loadRigFiles((): Promise<string> => {
    order.push('body ready');
    return Promise.resolve('body');
  }, (): Promise<string[]> => {
    order.push('clips requested');
    return Promise.resolve(['idle']);
  });
  assert.deepEqual(order, ['body ready', 'clips requested']);
  assert.deepEqual(files, ['body', ['idle']]);
});

void test('a body request rejected before receiving bytes starts no clip downloads', async (): Promise<void> => {
  let requests: number = 0;
  await assert.rejects(loadRigFiles((): Promise<string> => Promise.reject(new Error('missing body')), (): Promise<string[]> => {
    requests += 1;
    return Promise.resolve([]);
  }), /missing body/);
  assert.equal(requests, 0);
});

void test('a clip failure before the body is ready still rejects the rig load', async (): Promise<void> => {
  await assert.rejects(loadRigFiles(async (receiving: () => void): Promise<string> => {
    receiving();
    await settle();
    return 'body';
  }, (): Promise<string[]> => Promise.reject(new Error('missing clip'))), /missing clip/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, makeSave } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { createApi } from './api.ts';
import type { Api, ReadResult, WriteResult } from './api.ts';

const SIGNAL: AbortSignal = AbortSignal.timeout(5000);
const SAVE = makeSave(3, 12);
const COPY = { save: SAVE, revision: 2, updatedAt: '2026-11-25T10:00:00.000Z', epoch: 2 };

function gear(): ItemInstance {
  const base: string | undefined = [...content.itemBases.values()].find((candidate): boolean => candidate.slot !== null)?.id;
  const rarity: string | undefined = content.rarities[0]?.id;
  assert.ok(base !== undefined && rarity !== undefined);
  const item: ItemInstance | null = generateItem(content, createRng(4), 4, 1, base, rarity);
  assert.ok(item !== null);
  return item;
}

function answering(body: unknown, seen: RequestInit[], status: number = 200): Api {
  return createApi(
    'http://localhost:8787',
    (_url: string, init: RequestInit): Promise<Response> => {
      seen.push(init);
      return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    },
    content,
  );
}

function sentBody(seen: readonly RequestInit[]): Readonly<Record<string, unknown>> {
  const body: unknown = seen.at(-1)?.body;
  assert.equal(typeof body, 'string');
  const parsed: unknown = JSON.parse(String(body));
  assert.ok(isFields(parsed));
  return parsed;
}

void test('reading the save also reads the shared stash the server sends beside it', async (): Promise<void> => {
  const item: ItemInstance = gear();
  const read: ReadResult = await answering({ ...COPY, stash: { items: [item, null], revision: 7 } }, []).readSave('tok', SIGNAL);
  assert.ok(read.kind === 'ok');
  assert.deepEqual(read.stash, { items: [item, null], revision: 7 });
});

void test('a stash without a whole revision is not a shared stash', async (): Promise<void> => {
  const read: ReadResult = await answering({ ...COPY, stash: { items: [], revision: 'seven' } }, []).readSave('tok', SIGNAL);
  assert.equal(read.kind === 'ok' ? read.stash : 'not ok', null);
});

void test('a save sent with a stash revision carries it and reads the revision the server answers', async (): Promise<void> => {
  const seen: RequestInit[] = [];
  const written: WriteResult = await answering({ ...COPY, stashRevision: 8 }, seen).writeSave('tok', SAVE, 1, 2, SIGNAL, null, 7);
  assert.equal(sentBody(seen)['stashRevision'], 7);
  assert.equal(written.kind === 'ok' ? written.stashRevision : null, 8);
});

void test('a save sent without a stash revision does not name one', async (): Promise<void> => {
  const seen: RequestInit[] = [];
  await answering(COPY, seen).writeSave('tok', SAVE, 1, 2, SIGNAL);
  assert.equal('stashRevision' in sentBody(seen), false);
});

void test('a save refused because the shared stash moved on reads the stash the server has now', async (): Promise<void> => {
  const item: ItemInstance = gear();
  const refusal: unknown = { error: { code: 'stash_conflict', message: 'moved on' }, stash: { items: [null, item], revision: 9 } };
  const written: WriteResult = await answering(refusal, [], 409).writeSave('tok', SAVE, 1, 2, SIGNAL, null, 7);
  assert.deepEqual(written, { kind: 'stash_conflict', stash: { items: [null, item], revision: 9 } });
});

void test('a stash conflict without a readable stash is a plain refusal', async (): Promise<void> => {
  const written: WriteResult = await answering({ error: { code: 'stash_conflict', message: 'moved on' } }, [], 409).writeSave('tok', SAVE, 1, 2, SIGNAL, null, 7);
  assert.deepEqual(written, { kind: 'refused', status: 409 });
});

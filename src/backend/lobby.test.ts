import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, makeSave } from '../../test/backend-support.ts';
import type { Harness } from '../../test/backend-support.ts';
import type { Backend } from './backend.ts';
import { createLobbyApi } from './lobby-api.ts';
import { createLobbyService } from './lobby.ts';
import type { LobbyService } from './lobby.ts';

const URL_A: string = 'http://localhost:8787';

function serviceFor(harness: Harness, url: string = URL_A, withAccount: boolean = true): LobbyService {
  return createLobbyService({ serverUrl: url, api: createLobbyApi(url, harness.server.fetch), store: withAccount ? harness.store : null });
}

async function playing(): Promise<Harness> {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(3, 40));
  await harness.timers.advance(1000);
  return harness;
}

void test('a browser with a cloud account reads the board with its own line', async (): Promise<void> => {
  const harness: Harness = await playing();
  const board = await serviceFor(harness).read();
  assert.ok(board !== null);
  assert.equal(board.you?.level, 3);
  assert.equal(harness.server.requests.at(-1)?.token, 'token-1');
});

void test('the token is sent only to the server that issued it, and a visitor sends none', async (): Promise<void> => {
  const harness: Harness = await playing();
  await serviceFor(harness, 'http://localhost:9999').read();
  assert.equal(harness.server.requests.at(-1)?.token, null);
  await serviceFor(harness, URL_A, false).read();
  assert.equal(harness.server.requests.at(-1)?.token, null);
});

void test('a failed read is absorbed as no board', async (): Promise<void> => {
  const harness: Harness = await playing();
  harness.server.goDown();
  assert.equal(await serviceFor(harness).read(), null);
  harness.server.comeUp();
  harness.server.plan(500);
  assert.equal(await serviceFor(harness).read(), null);
});

void test('naming needs an account, and says why a name was refused', async (): Promise<void> => {
  const fresh: Harness = createHarness();
  assert.equal(serviceFor(fresh).hasAccount(), false);
  assert.deepEqual(await serviceFor(fresh).rename('Wren'), { kind: 'unavailable' });
  assert.equal(fresh.server.requests.length, 0);
  const harness: Harness = await playing();
  const service: LobbyService = serviceFor(harness);
  assert.equal(service.hasAccount(), true);
  assert.deepEqual(await service.rename('Wren'), { kind: 'named', name: 'Wren' });
  assert.deepEqual(await service.rename('Admin Wren'), { kind: 'invalid', reason: 'name_blocked' });
  assert.equal((await service.read())?.you?.name, 'Wren');
  harness.server.goDown();
  assert.deepEqual(await service.rename('Moth'), { kind: 'unavailable' });
});

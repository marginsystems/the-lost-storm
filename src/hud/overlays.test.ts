import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import { overlayZ } from './overlay-table.ts';
import type { OverlayId } from './overlay-table.ts';
import { createOverlayManager, durationMs, OVERLAY_BODY, whenDropped } from './overlays.ts';
import type { OverlayBody, OverlayManager, OverlaySurface } from './overlays.ts';

const MOTION_MS: number = 260;

interface Probe {
  readonly log: string[];
  readonly surfaces: Map<OverlayId, OverlaySurface>;
}

interface Rig {
  readonly manager: OverlayManager;
  readonly body: OverlayBody;
  readonly fake: FakeTimers;
  readonly probe: Probe;
}

function rig(ids: readonly OverlayId[]): Rig {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const body: OverlayBody = { dataset: {} };
  const manager: OverlayManager = createOverlayManager({ body, timers: fake.timers, motionMs: (): number => MOTION_MS });
  const probe: Probe = { log: [], surfaces: new Map<OverlayId, OverlaySurface>() };
  for (const id of ids) {
    const surface: OverlaySurface = { style: { zIndex: '' } };
    probe.surfaces.set(id, surface);
    manager.register(id, {
      element: surface,
      show: (): void => {
        probe.log.push(`show ${id}`);
      },
      hide: (): void => {
        probe.log.push(`hide ${id}`);
      },
    });
  }
  return { manager, body, fake, probe };
}

void test('T then I: the chart is hidden first and the inventory shows only after its exit', async (): Promise<void> => {
  const { manager, body, fake, probe } = rig(['chart', 'inventory']);
  manager.send({ type: 'toggle', id: 'chart' });
  await fake.advance(MOTION_MS);
  assert.equal(body.dataset[OVERLAY_BODY.full], OVERLAY_BODY.on);
  assert.equal(probe.surfaces.get('chart')?.style.zIndex, String(overlayZ('chart')));
  probe.log.length = 0;
  manager.send({ type: 'toggle', id: 'inventory' });
  assert.deepEqual(probe.log, ['hide chart']);
  await fake.advance(MOTION_MS - 1);
  assert.deepEqual(probe.log, ['hide chart']);
  await fake.advance(1);
  assert.deepEqual(probe.log, ['hide chart', 'show inventory']);
  assert.equal(body.dataset[OVERLAY_BODY.full], OVERLAY_BODY.off);
  assert.equal(body.dataset[OVERLAY_BODY.any], OVERLAY_BODY.on);
});

void test('I then T then T again before the swap ends cancels the chart and leaves nothing open', async (): Promise<void> => {
  const { manager, fake, probe } = rig(['chart', 'inventory']);
  manager.send({ type: 'toggle', id: 'inventory' });
  await fake.advance(MOTION_MS);
  manager.send({ type: 'toggle', id: 'chart' });
  manager.send({ type: 'toggle', id: 'chart' });
  await fake.advance(MOTION_MS);
  assert.deepEqual(probe.log, ['show inventory', 'hide inventory']);
  assert.equal(manager.live('chart'), false);
  assert.equal(fake.pending(), 0);
});

void test('a handle that closes another overlay while it hides is queued, never re-entered', async (): Promise<void> => {
  const { manager, fake, probe } = rig(['inventory']);
  const surface: OverlaySurface = { style: { zIndex: '' } };
  manager.register('trade', {
    element: surface,
    show: (): void => {
      probe.log.push('show trade');
    },
    hide: (): void => {
      probe.log.push('hide trade');
      manager.send({ type: 'close', id: 'inventory' });
    },
  });
  manager.send({ type: 'open', id: 'trade' });
  await fake.advance(MOTION_MS);
  assert.deepEqual(probe.log, ['show inventory', 'show trade']);
  manager.send({ type: 'close', id: 'trade' });
  assert.deepEqual(probe.log, ['show inventory', 'show trade', 'hide trade', 'hide inventory']);
  await fake.advance(MOTION_MS);
  assert.equal(manager.hasTop(), false);
});

void test('death without a registered card settles at once and refuses panels until respawn', async (): Promise<void> => {
  const { manager, fake } = rig(['map']);
  manager.send({ type: 'toggle', id: 'map' });
  await fake.advance(MOTION_MS);
  manager.send({ type: 'death' });
  await fake.advance(MOTION_MS);
  await fake.advance(0);
  assert.equal(manager.shown('death'), true);
  assert.equal(manager.send({ type: 'toggle', id: 'map' }), 'refused');
  manager.send({ type: 'respawn' });
  await fake.advance(0);
  assert.equal(manager.send({ type: 'toggle', id: 'map' }), 'shown');
});

void test('Escape over the chart closes it and leaves pause for the next press', async (): Promise<void> => {
  const { manager, fake } = rig(['chart']);
  manager.send({ type: 'toggle', id: 'chart' });
  await fake.advance(MOTION_MS);
  assert.equal(manager.hasTop(), true);
  manager.send({ type: 'escape' });
  assert.equal(manager.live('pause'), false);
  await fake.advance(MOTION_MS);
  assert.equal(manager.hasTop(), false);
});

void test('a zone change during an exit drops a waiting reader without showing it, so a later request is not blocked', async (): Promise<void> => {
  const { manager, fake, probe } = rig(['inventory', 'reader']);
  manager.send({ type: 'open', id: 'inventory' });
  await fake.advance(MOTION_MS);
  assert.equal(manager.send({ type: 'open', id: 'reader' }), 'waiting');
  assert.deepEqual(manager.state().pending, ['reader']);
  manager.send({ type: 'interrupt', cause: 'zone' });
  assert.deepEqual(manager.state().pending, []);
  await fake.advance(MOTION_MS);
  assert.ok(!probe.log.includes('show reader'));
  assert.equal(manager.send({ type: 'open', id: 'reader' }), 'shown');
  assert.equal(probe.log.at(-1), 'show reader');
});

void test('a request parked behind an exit and then dropped is reported once, and one that enters is not', async (): Promise<void> => {
  const { manager, fake } = rig(['inventory', 'reader', 'pause']);
  const drops: string[] = [];
  whenDropped(manager, 'reader', (): void => {
    drops.push('reader');
  });
  whenDropped(manager, 'pause', (): void => {
    drops.push('pause');
  });
  manager.send({ type: 'open', id: 'inventory' });
  await fake.advance(MOTION_MS);
  assert.equal(manager.send({ type: 'open', id: 'reader' }), 'waiting');
  manager.send({ type: 'interrupt', cause: 'zone' });
  assert.deepEqual(drops, ['reader']);
  await fake.advance(MOTION_MS);
  manager.send({ type: 'open', id: 'inventory' });
  await fake.advance(MOTION_MS);
  assert.equal(manager.send({ type: 'open', id: 'pause' }), 'waiting');
  manager.send({ type: 'escape' });
  assert.deepEqual(drops, ['reader', 'pause']);
  await fake.advance(MOTION_MS);
  assert.equal(manager.send({ type: 'open', id: 'reader' }), 'shown');
  await fake.advance(MOTION_MS);
  assert.deepEqual(drops, ['reader', 'pause']);
});

void test('motion tokens read in milliseconds whether the build writes ms or seconds', (): void => {
  assert.equal(durationMs('260ms'), 260);
  assert.equal(durationMs(' .26s'), 260);
  assert.equal(durationMs('0.52s'), 520);
  assert.equal(durationMs(''), null);
  assert.equal(durationMs('fast'), null);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { anyOverlay, chromeHidden, exitingOverlays, INITIAL_OVERLAYS, isShown, liveOverlays, stepOverlays, visibleOverlays } from './overlay-core.ts';
import type { OverlayEvent, OverlayState, OverlayStep } from './overlay-core.ts';
import { OVERLAY_IDS, OVERLAY_PAIRS, OVERLAY_TABLE, overlayZ, paired, QUEUED_OVERLAYS } from './overlay-table.ts';
import type { OverlayId } from './overlay-table.ts';

const SPEC = {
  path: '../../spec/Overlays.tla',
  reachable: 697,
  seeds: 200,
  length: 60,
} as const;

const KEYED: readonly OverlayId[] = ['inventory', 'character', 'chart', 'map', 'ladder', 'pause'];

function allEvents(): OverlayEvent[] {
  return [
    ...KEYED.map((id: OverlayId): OverlayEvent => ({ type: 'toggle', id })),
    ...OVERLAY_IDS.map((id: OverlayId): OverlayEvent => ({ type: 'close', id })),
    ...OVERLAY_IDS.map((id: OverlayId): OverlayEvent => ({ type: 'settled', id })),
    { type: 'toggle', id: 'death' },
    { type: 'close', id: 'death' },
    { type: 'open', id: 'trade' },
    { type: 'open', id: 'reader' },
    { type: 'open', id: 'choice' },
    { type: 'escape' },
    { type: 'death' },
    { type: 'respawn' },
    { type: 'zone' },
    ...QUEUED_OVERLAYS.map((id: 'choice' | 'endcard'): OverlayEvent => ({ type: 'arrive', id })),
    { type: 'present' },
    { type: 'choose' },
  ];
}

function keyOf(state: OverlayState): string {
  return JSON.stringify([OVERLAY_IDS.map((id: OverlayId): string => state.phase[id]), state.pending, state.waiting.toSorted()]);
}

function assertInvariants(state: OverlayState, trail: string): void {
  const shown: OverlayId[] = visibleOverlays(state);
  assert.ok(shown.length <= 1 || (shown.length === 2 && paired(shown[0] ?? 'death', shown[1] ?? 'death')), `one exclusive overlay: ${shown.join(',')} after ${trail}`);
  for (const exiting of exitingOverlays(state)) {
    for (const id of OVERLAY_IDS) if (state.phase[id] === 'opening') assert.ok(paired(exiting, id), `${id} entered while ${exiting} was leaving after ${trail}`);
  }
  if (OVERLAY_IDS.some((id: OverlayId): boolean => OVERLAY_TABLE[id].layer === 'full' && state.phase[id] !== 'closed')) assert.ok(chromeHidden(state), trail);
  if (state.pending.length > 0) assert.ok(exitingOverlays(state).length > 0, `idle gap after ${trail}`);
  assert.ok(state.phase.choice === 'closed' || state.phase.endcard === 'closed', `two queued cards after ${trail}`);
  if (isShown(state, 'death')) assert.deepEqual(liveOverlays(state), ['death'], `orphan under death after ${trail}`);
  assert.equal(anyOverlay(state), liveOverlays(state).length > 0);
}

function apply(state: OverlayState, events: readonly OverlayEvent[]): OverlayState {
  return events.reduce((current: OverlayState, event: OverlayEvent): OverlayState => stepOverlays(current, event).state, state);
}

function settleAll(state: OverlayState): OverlayState {
  let current: OverlayState = state;
  for (let guard: number = 0; guard < 8; guard += 1) {
    const moving: OverlayId[] = OVERLAY_IDS.filter((id: OverlayId): boolean => current.phase[id] === 'opening' || current.phase[id] === 'closing');
    if (moving.length === 0) return current;
    current = apply(current, moving.map((id: OverlayId): OverlayEvent => ({ type: 'settled', id })));
  }
  return current;
}

function setOf(source: string, name: string): string[] {
  const match: RegExpExecArray | null = new RegExp(`^${name} == \\{([^}]*)\\}`, 'm').exec(source);
  assert.ok(match !== null, name);
  return [...(match[1] ?? '').matchAll(/"([a-z]+)"/g)].map((part: RegExpExecArray): string => part[1] ?? '').toSorted();
}

void test('the table and the TLA+ spec name the same overlays, layers, blockers, pairs and z ranks', (): void => {
  const source: string = readFileSync(new URL(SPEC.path, import.meta.url), 'utf8');
  assert.deepEqual(setOf(source, 'Overlays'), OVERLAY_IDS.toSorted());
  assert.deepEqual(setOf(source, 'Side'), OVERLAY_IDS.filter((id: OverlayId): boolean => OVERLAY_TABLE[id].layer === 'side').toSorted());
  assert.deepEqual(setOf(source, 'Full'), OVERLAY_IDS.filter((id: OverlayId): boolean => OVERLAY_TABLE[id].layer === 'full').toSorted());
  assert.deepEqual(setOf(source, 'Blockers'), OVERLAY_IDS.filter((id: OverlayId): boolean => OVERLAY_TABLE[id].blocks).toSorted());
  assert.deepEqual(setOf(source, 'Queued'), QUEUED_OVERLAYS.toSorted());
  const line: string = /^Pairs == (.*)$/m.exec(source)?.[1] ?? '';
  const pairs: string[] = [...line.matchAll(/\{"([a-z]+)", "([a-z]+)"\}/g)].map((pair: RegExpExecArray): string => `${pair[1] ?? ''}+${pair[2] ?? ''}`);
  assert.deepEqual(pairs.toSorted(), OVERLAY_PAIRS.map(([a, b]: readonly [OverlayId, OverlayId]): string => `${a}+${b}`).toSorted());
  for (const id of OVERLAY_IDS) assert.match(source, new RegExp(`o = "${id}" -> ${OVERLAY_TABLE[id].rank}\\b`), id);
});

void test('z order follows rank, one table for every overlay', (): void => {
  const z: number[] = OVERLAY_IDS.map(overlayZ);
  assert.deepEqual(z, z.toSorted((a: number, b: number): number => a - b));
  assert.equal(new Set(z).size, z.length);
});

void test('every state the core can reach keeps the spec invariants, and there are exactly as many as TLC finds', (): void => {
  const seen: Map<string, OverlayState> = new Map<string, OverlayState>([[keyOf(INITIAL_OVERLAYS), INITIAL_OVERLAYS]]);
  const queue: OverlayState[] = [INITIAL_OVERLAYS];
  const events: OverlayEvent[] = allEvents();
  for (let state: OverlayState | undefined = queue.shift(); state !== undefined; state = queue.shift()) {
    assertInvariants(state, keyOf(state));
    for (const event of events) {
      const next: OverlayStep = stepOverlays(state, event);
      if (event.type === 'escape' && visibleOverlays(state).some((id: OverlayId): boolean => id !== 'death') && !isShown(state, 'pause')) {
        assert.ok(!isShown(next.state, 'pause') && !next.state.pending.includes('pause'), `escape opened pause over ${keyOf(state)}`);
      }
      if (state.pending.includes('death')) assert.ok(next.state.pending.includes('death') || isShown(next.state, 'death'), `${JSON.stringify(event)} dropped death from ${keyOf(state)}`);
      if (event.type === 'zone') assert.ok(visibleOverlays(next.state).every((id: OverlayId): boolean => id === 'death'), `zone change left ${keyOf(next.state)}`);
      const key: string = keyOf(next.state);
      if (!seen.has(key)) {
        seen.set(key, next.state);
        queue.push(next.state);
      }
    }
  }
  assert.equal(seen.size, SPEC.reachable);
});

void test('random event sequences keep every invariant, and every request ends shown, waiting or refused', (): void => {
  const events: OverlayEvent[] = allEvents();
  for (let seed: number = 1; seed <= SPEC.seeds; seed += 1) {
    let random: number = seed;
    let state: OverlayState = INITIAL_OVERLAYS;
    const trail: string[] = [];
    for (let step: number = 0; step < SPEC.length; step += 1) {
      random = (random * 1103515245 + 12345) % 2147483648;
      const event: OverlayEvent | undefined = events[random % events.length];
      if (event === undefined) continue;
      const next: OverlayStep = stepOverlays(state, event);
      trail.push(JSON.stringify(event));
      if (event.type === 'open' && next.outcome !== 'ignored') {
        assert.ok(next.outcome === 'refused' || isShown(next.state, event.id) || next.state.pending.includes(event.id), trail.join(' '));
      }
      state = next.state;
      assertInvariants(state, trail.join(' '));
    }
    const settled: OverlayState = settleAll(state);
    assert.equal(settled.pending.length, 0, `nothing lost after ${trail.join(' ')}`);
    assert.ok(OVERLAY_IDS.every((id: OverlayId): boolean => settled.phase[id] === 'open' || settled.phase[id] === 'closed'));
  }
});

void test('T then I: the chart leaves first, then the inventory enters', (): void => {
  const chart: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'chart' }).state);
  assert.ok(chromeHidden(chart));
  const asked: OverlayStep = stepOverlays(chart, { type: 'toggle', id: 'inventory' });
  assert.equal(asked.outcome, 'waiting');
  assert.equal(asked.state.phase.chart, 'closing');
  assert.equal(asked.state.phase.inventory, 'closed');
  assert.deepEqual(asked.state.pending, ['inventory']);
  const after: OverlayState = stepOverlays(asked.state, { type: 'settled', id: 'chart' }).state;
  assert.equal(after.phase.chart, 'closed');
  assert.equal(after.phase.inventory, 'opening');
  assert.ok(!chromeHidden(after));
});

void test('I then T: the inventory leaves, then the chart enters and hides the chrome', (): void => {
  const bag: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'inventory' }).state);
  const asked: OverlayStep = stepOverlays(bag, { type: 'toggle', id: 'chart' });
  assert.equal(asked.state.phase.inventory, 'closing');
  assert.ok(!isShown(asked.state, 'chart'));
  const after: OverlayState = stepOverlays(asked.state, { type: 'settled', id: 'inventory' }).state;
  assert.equal(after.phase.chart, 'opening');
  assert.ok(chromeHidden(after));
});

void test('the bag stays open beside the character sheet and beside a shop', (): void => {
  const both: OverlayState = settleAll(apply(INITIAL_OVERLAYS, [{ type: 'toggle', id: 'inventory' }, { type: 'toggle', id: 'character' }]));
  assert.deepEqual(visibleOverlays(both), ['character', 'inventory']);
  const shop: OverlayState = settleAll(stepOverlays(both, { type: 'open', id: 'trade' }).state);
  assert.deepEqual(visibleOverlays(shop), ['inventory', 'trade']);
  const bagGone: OverlayState = stepOverlays(shop, { type: 'toggle', id: 'inventory' }).state;
  assert.equal(bagGone.phase.trade, 'closing');
});

void test('Escape closes the chart, and only the next Escape opens pause', (): void => {
  const chart: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'chart' }).state);
  const first: OverlayState = stepOverlays(chart, { type: 'escape' }).state;
  assert.equal(first.phase.chart, 'closing');
  assert.equal(first.phase.pause, 'closed');
  const second: OverlayState = stepOverlays(settleAll(first), { type: 'escape' }).state;
  assert.equal(second.phase.pause, 'opening');
});

void test('Escape walks down a stack one overlay at a time', (): void => {
  const stack: OverlayState = settleAll(apply(INITIAL_OVERLAYS, [{ type: 'toggle', id: 'character' }, { type: 'toggle', id: 'inventory' }]));
  const one: OverlayState = settleAll(stepOverlays(stack, { type: 'escape' }).state);
  assert.deepEqual(visibleOverlays(one), ['character']);
  const two: OverlayState = settleAll(stepOverlays(one, { type: 'escape' }).state);
  assert.deepEqual(visibleOverlays(two), []);
  assert.equal(stepOverlays(two, { type: 'escape' }).state.phase.pause, 'opening');
});

void test('a pending skill choice with a panel open waits; opening it closes the panel; Escape defers it', (): void => {
  const bag: OverlayState = settleAll(apply(INITIAL_OVERLAYS, [{ type: 'toggle', id: 'inventory' }, { type: 'arrive', id: 'choice' }]));
  assert.ok(isShown(bag, 'inventory'));
  assert.equal(bag.phase.choice, 'closed');
  const choosing: OverlayState = settleAll(stepOverlays(bag, { type: 'open', id: 'choice' }).state);
  assert.deepEqual(visibleOverlays(choosing), ['choice']);
  const deferred: OverlayState = settleAll(stepOverlays(choosing, { type: 'escape' }).state);
  assert.deepEqual(deferred.waiting, ['choice']);
  assert.equal(deferred.phase.pause, 'closed');
  const chosen: OverlayState = settleAll(apply(deferred, [{ type: 'open', id: 'choice' }, { type: 'settled', id: 'choice' }, { type: 'choose' }]));
  assert.deepEqual(chosen.waiting, []);
});

void test('the end card waits behind the skill choice and any panel', (): void => {
  const choosing: OverlayState = settleAll(apply(INITIAL_OVERLAYS, [{ type: 'arrive', id: 'choice' }, { type: 'open', id: 'choice' }, { type: 'arrive', id: 'endcard' }]));
  assert.equal(stepOverlays(choosing, { type: 'present' }).outcome, 'ignored');
  const done: OverlayState = settleAll(apply(choosing, [{ type: 'choose' }]));
  assert.equal(stepOverlays(done, { type: 'present' }).state.phase.endcard, 'opening');
});

void test('death closes every panel before its card enters; a zone change leaves nothing open', (): void => {
  const busy: OverlayState = settleAll(apply(INITIAL_OVERLAYS, [{ type: 'toggle', id: 'inventory' }, { type: 'toggle', id: 'character' }]));
  const dying: OverlayState = stepOverlays(busy, { type: 'death' }).state;
  assert.deepEqual(exitingOverlays(dying), ['character', 'inventory']);
  assert.deepEqual(dying.pending, ['death']);
  assert.deepEqual(liveOverlays(settleAll(dying)), ['death']);
  assert.equal(stepOverlays(settleAll(dying), { type: 'toggle', id: 'map' }).outcome, 'refused');
  const map: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'map' }).state);
  assert.deepEqual(visibleOverlays(stepOverlays(map, { type: 'zone' }).state), []);
});

void test('Escape while death waits behind a closing panel keeps death, and its card still enters', (): void => {
  const bag: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'inventory' }).state);
  const dying: OverlayState = stepOverlays(bag, { type: 'death' }).state;
  const escaped: OverlayState = stepOverlays(dying, { type: 'escape' }).state;
  assert.deepEqual(escaped.pending, ['death']);
  const dead: OverlayState = settleAll(escaped);
  assert.equal(dead.phase.death, 'open');
  assert.equal(stepOverlays(dead, { type: 'respawn' }).state.phase.death, 'closing');
});

void test('death leaves only through respawn: toggle and close are ignored', (): void => {
  const dead: OverlayState = settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'death' }).state);
  assert.equal(stepOverlays(dead, { type: 'toggle', id: 'death' }).outcome, 'ignored');
  assert.equal(stepOverlays(dead, { type: 'close', id: 'death' }).outcome, 'ignored');
  assert.equal(stepOverlays(dead, { type: 'escape' }).outcome, 'ignored');
  const pending: OverlayState = stepOverlays(settleAll(stepOverlays(INITIAL_OVERLAYS, { type: 'toggle', id: 'map' }).state), { type: 'death' }).state;
  assert.deepEqual(stepOverlays(pending, { type: 'toggle', id: 'death' }).state.pending, ['death']);
});

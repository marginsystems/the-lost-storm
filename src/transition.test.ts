import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content } from '../sim/content/types.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Timers } from './backend/backend.ts';
import type { TransitionReport, Veil, ZoneTransition } from './transition.ts';
import { cleanFrameLimit, createZoneTransition, isLight, TRANSITION, veilColour } from './transition.ts';

const content: Content = loadContent();

void test('entering the Hall from the white In-Between fades through the Hall night, never through white', (): void => {
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'between', to: 'hall_of_time' }]), '#0a0e16');
});

void test('leaving a dark zone for a light one fades through the dark side', (): void => {
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'hall_of_time', to: 'between' }]), '#0a0e16');
});

void test('between two dark zones the fade takes the colour of the zone being entered', (): void => {
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'hideout', to: 'hall_of_time' }]), '#0a0e16');
});

void test('with no zone change, or an unknown zone on either side, the fade keeps its own dark', (): void => {
  assert.equal(veilColour(content.zones, []), null);
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'nowhere', to: 'between' }]), null);
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'between', to: 'nowhere' }]), null);
});

interface FakeVeil extends Veil {
  readonly log: string[];
  finishCover(): void;
  finishLift(): void;
}

function fakeVeil(): FakeVeil {
  const log: string[] = [];
  const covers: (() => void)[] = [];
  const lifts: (() => void)[] = [];
  return {
    log,
    cover(colour: string | null): Promise<void> {
      log.push(`cover ${colour ?? 'none'}`);
      return new Promise<void>((resolve: () => void): void => {
        covers.push(resolve);
      });
    },
    lift(): Promise<void> {
      log.push('lift');
      return new Promise<void>((resolve: () => void): void => {
        lifts.push(resolve);
      });
    },
    finishCover(): void {
      for (const done of covers.splice(0)) done();
    },
    finishLift(): void {
      for (const done of lifts.splice(0)) done();
    },
  };
}

function revealOf(run: Harness): () => void {
  return (): void => {
    run.veil.log.push('reveal');
  };
}

interface Harness {
  readonly veil: FakeVeil;
  readonly transition: ZoneTransition;
  readonly reports: TransitionReport[];
  readonly errors: unknown[];
  readonly due: (() => void)[];
  advance(ms: number): void;
}

function harness(): Harness {
  const veil: FakeVeil = fakeVeil();
  const reports: TransitionReport[] = [];
  const errors: unknown[] = [];
  const due: (() => void)[] = [];
  let clock: number = 0;
  const timers: Timers = {
    after(_ms: number, task: () => void): () => void {
      due.push(task);
      return (): void => {
        const index: number = due.indexOf(task);
        if (index >= 0) due.splice(index, 1);
      };
    },
  };
  const transition: ZoneTransition = createZoneTransition({
    veil,
    timers,
    now: (): number => clock,
    onError: (error: unknown): void => {
      errors.push(error);
    },
    onReport: (report: TransitionReport): void => {
      reports.push(report);
    },
  });
  return {
    veil,
    transition,
    reports,
    errors,
    due,
    advance(ms: number): void {
      clock += ms;
      transition.frame(ms);
    },
  };
}

function only(reports: readonly TransitionReport[]): TransitionReport {
  const [first] = reports;
  if (first === undefined) throw new Error('no transition was reported');
  return first;
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function cleanFrames(run: Harness, count: number): void {
  for (let index: number = 0; index < count; index += 1) run.advance(TRANSITION.cleanFrameMs - 6);
}

void test('the new zone is built only once the veil fully covers the old one', async (): Promise<void> => {
  const run: Harness = harness();
  const built: string[] = [];
  run.transition.begin((): Promise<void> => {
    built.push('built');
    return Promise.resolve();
  }, '#0a0e16', revealOf(run));
  await settle();
  assert.deepEqual(run.veil.log, ['cover #0a0e16']);
  assert.deepEqual(built, []);
  assert.equal(run.transition.blocking, true);
  assert.equal(run.transition.presenting, false);
  run.veil.finishCover();
  await settle();
  assert.deepEqual(built, ['built']);
});

void test('the veil lifts, and the HUD hears of the new zone, only after the new zone has drawn several clean frames in a row', async (): Promise<void> => {
  const run: Harness = harness();
  run.transition.begin((): Promise<void> => Promise.resolve(), null, revealOf(run));
  run.veil.finishCover();
  await settle();
  assert.equal(run.transition.presenting, true);
  assert.equal(run.transition.blocking, true);
  cleanFrames(run, TRANSITION.cleanFrames - 1);
  run.advance(TRANSITION.cleanFrameMs * 4);
  cleanFrames(run, TRANSITION.cleanFrames - 1);
  await settle();
  assert.deepEqual(run.veil.log.slice(1), []);
  cleanFrames(run, 1);
  await settle();
  assert.deepEqual(run.veil.log.slice(1), ['reveal', 'lift']);
  assert.equal(run.transition.blocking, false);
  run.veil.finishLift();
  await settle();
  assert.equal(run.reports.length, 1);
  assert.equal(only(run.reports).settled, true);
  assert.equal(only(run.reports).worstHiddenMs, TRANSITION.cleanFrameMs * 4);
});

void test('a zone that never draws clean frames still lifts the veil after the cap', async (): Promise<void> => {
  const run: Harness = harness();
  run.transition.begin((): Promise<void> => Promise.resolve(), null, revealOf(run));
  run.veil.finishCover();
  await settle();
  run.advance(TRANSITION.cleanFrameMs * 3);
  assert.equal(run.due.length, 1);
  for (const task of run.due.splice(0)) task();
  await settle();
  assert.deepEqual(run.veil.log.slice(1), ['reveal', 'lift']);
  run.veil.finishLift();
  await settle();
  assert.equal(only(run.reports).settled, false);
});

void test('frames while the veil comes and goes count as seen, frames behind it as hidden', async (): Promise<void> => {
  const run: Harness = harness();
  run.transition.begin((): Promise<void> => Promise.resolve(), null, revealOf(run));
  run.advance(17);
  run.veil.finishCover();
  await settle();
  run.advance(300);
  cleanFrames(run, TRANSITION.cleanFrames);
  await settle();
  run.advance(19);
  run.veil.finishLift();
  await settle();
  assert.equal(only(run.reports).worstShownMs, 19);
  assert.equal(only(run.reports).worstHiddenMs, 300);
  assert.equal(run.due.length, 0);
});

void test('a failed build lifts the veil, reports the error and leaves the transition ready again', async (): Promise<void> => {
  const run: Harness = harness();
  run.transition.begin((): Promise<void> => Promise.reject(new Error('no models')), null, revealOf(run));
  run.veil.finishCover();
  await settle();
  assert.equal(run.errors.length, 1);
  assert.deepEqual(run.veil.log.slice(1), ['lift']);
  assert.equal(run.transition.blocking, false);
  run.transition.begin((): Promise<void> => Promise.resolve(), '#d9dcdf', revealOf(run));
  assert.equal(run.veil.log.at(-1), 'cover #d9dcdf');
});

void test('a second zone change while one is under way is ignored', async (): Promise<void> => {
  const run: Harness = harness();
  run.transition.begin((): Promise<void> => Promise.resolve(), null, revealOf(run));
  run.transition.begin((): Promise<void> => Promise.resolve(), '#d9dcdf', revealOf(run));
  await settle();
  assert.deepEqual(run.veil.log, ['cover none']);
});

void test('light zone colours are told from dark ones by their luminance', (): void => {
  assert.equal(isLight('#d9dcdf'), true);
  assert.equal(isLight('#0a0e16'), false);
  assert.equal(isLight(null), false);
  assert.equal(isLight('steelblue'), false);
});

void test('a clean frame is judged against how the game was running before the change', (): void => {
  assert.equal(cleanFrameLimit([]), TRANSITION.cleanFrameMs);
  assert.equal(cleanFrameLimit([12, 13, 12]), TRANSITION.cleanFrameMs);
  assert.equal(cleanFrameLimit([33, 34, 33]), 33 * TRANSITION.slackOverTypical);
});

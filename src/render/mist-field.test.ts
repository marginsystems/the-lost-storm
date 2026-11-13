import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec2 } from '../../sim/math.ts';
import { clearing, createMistDrive, createMistField, gustAim, MIST, sampleField, stepDrive, stepField, stepMomentum, wakePocket, wakeRim, wantedDir } from './mist-field.ts';
import type { MistDrive, MistField } from './mist-field.ts';

const DT: number = 1 / 60;
const CELLS: number = 64;
const SPEED: number = 4;

interface Walk {
  readonly field: MistField;
  readonly drive: MistDrive;
  readonly hero: Vec2;
}

function fresh(): Walk {
  return { field: createMistField(CELLS), drive: createMistDrive(), hero: { x: 10, z: 10 } };
}

function walk(state: Walk, dir: Vec2 | null, seconds: number, finds: readonly Vec2[] = []): void {
  for (let time: number = 0; time < seconds; time += DT) {
    if (dir !== null) {
      state.hero.x += dir.x * SPEED * DT;
      state.hero.z += dir.z * SPEED * DT;
    }
    stepDrive(state.drive, { hero: state.hero, speed: dir === null ? 0 : SPEED, maxSpeed: SPEED, moveDir: dir, look: null, finds, wake: null, dt: DT, random: (): number => 0.5 });
    stepField(state.field, state.drive, state.hero, DT);
  }
}

function at(state: Walk, dx: number, dz: number): number {
  return sampleField(state.field, { x: state.hero.x + dx, z: state.hero.z + dz });
}

function reachAhead(state: Walk, dir: Vec2): number {
  let reach: number = 0;
  for (let distance: number = 0; distance < MIST.span / 2; distance += 0.5) if (at(state, dir.x * distance, dir.z * distance) > 0.5) reach = distance;
  return reach;
}

const EAST: Vec2 = { x: 1, z: 0 };
const NORTH: Vec2 = { x: 0, z: 1 };

void test('the longer he keeps walking, the further ahead the mist parts', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 0.6);
  const early: number = reachAhead(state, EAST);
  walk(state, EAST, 3);
  const later: number = reachAhead(state, EAST);
  assert.ok(early >= MIST.pocketStill * 0.5, `early ${early}`);
  assert.ok(later > early + 4, `early ${early} later ${later}`);
  assert.ok(later <= MIST.reachMax + 1);
});

void test('standing still lets the mist creep back to a small pocket', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 4);
  assert.ok(at(state, 6, 0) > 0.5);
  walk(state, null, 6);
  assert.ok(at(state, 6, 0) < 0.1, `ahead ${at(state, 6, 0)}`);
  assert.ok(at(state, 0.4, 0) > 0.8);
  assert.ok(at(state, MIST.pocketStill + 1, 0) < 0.1);
});

void test('the path he cut stays for a moment behind him, then fills', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 3);
  const behind: number = 4;
  assert.ok(at(state, -behind, 0) > 0.5, `just behind ${at(state, -behind, 0)}`);
  walk(state, EAST, 0.4);
  assert.ok(at(state, -behind - SPEED * 0.4, 0) > 0.3);
  walk(state, EAST, 5);
  assert.ok(at(state, -behind - SPEED * 5.4, 0) < 0.05);
});

void test('turning swings the opening round with a lag, and the old channel lingers before it fills', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 3);
  walk(state, NORTH, 0.05);
  assert.ok(state.drive.dir.x > 0.6, `dir right after the turn ${state.drive.dir.x}`);
  assert.ok(at(state, 8, 0) > 0.4);
  walk(state, NORTH, 1);
  assert.ok(state.drive.dir.z > 0.95);
  walk(state, NORTH, 4);
  assert.ok(reachAhead(state, NORTH) > 6);
});

void test('the mist opens and closes like a spring, never by a jump', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 2);
  let previous: number = at(state, 5, 0);
  let largest: number = 0;
  for (let frame: number = 0; frame < 240; frame += 1) {
    walk(state, null, DT);
    const now: number = sampleField(state.field, { x: state.hero.x + 5, z: state.hero.z });
    largest = Math.max(largest, Math.abs(now - previous));
    previous = now;
  }
  assert.ok(largest < 0.1, `largest step ${largest}`);
});

void test('the field stays closed near its edge so nothing wraps round into view', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 6);
  const edge: number = (MIST.span / 2) * MIST.edgeEnd + 0.5;
  assert.equal(at(state, edge, 0), 0);
  assert.equal(at(state, 0, -edge), 0);
});

void test('a gust only comes while walking, and reaches for a find ahead of him', (): void => {
  const still: Walk = fresh();
  walk(still, null, MIST.gustMaxWait + 2);
  assert.equal(still.drive.gust, null);
  const state: Walk = fresh();
  const find: Vec2 = { x: state.hero.x + 60, z: state.hero.z + 25 };
  let reached: boolean = false;
  for (let time: number = 0; time < MIST.gustFirstWait + 4 && !reached; time += DT) {
    walk(state, EAST, DT, [find]);
    reached = state.drive.gust !== null && state.drive.gust.strength > 0.9;
  }
  assert.ok(reached);
  const gust = state.drive.gust;
  assert.ok(gust !== null && gust.aimed && gust.dir.z > 0.3);
  assert.ok(at(state, gust.dir.x * MIST.gustReach * 0.6, gust.dir.z * MIST.gustReach * 0.6) > 0.3);
});

void test('a gust with nothing ahead swings a little off his heading', (): void => {
  const aim = gustAim(EAST, { x: 0, z: 0 }, [{ x: -20, z: 0 }], (): number => 1);
  assert.equal(aim.aimed, false);
  assert.ok(aim.dir.x > Math.cos((MIST.gustSwing + 1) * (Math.PI / 180)) && aim.dir.z > 0.1);
  assert.equal(gustAim(EAST, { x: 0, z: 0 }, [{ x: 20, z: 3 }], (): number => 1).aimed, true);
});

void test('the cursor bends the opening toward where he looks', (): void => {
  const drive: MistDrive = createMistDrive();
  const bent: Vec2 = wantedDir(drive, { moveDir: EAST, look: NORTH });
  assert.ok(bent.x > bent.z && bent.z > 0.2);
  assert.deepEqual(wantedDir(drive, { moveDir: null, look: null }), drive.dir);
});

void test('the cursor does not turn the mist while he stands still', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 1);
  walk(state, null, 3);
  const settled: Vec2 = { x: state.drive.dir.x, z: state.drive.dir.z };
  const around: readonly Vec2[] = [NORTH, { x: -1, z: 0 }, { x: 0, z: -1 }, EAST];
  for (const look of around) {
    stepDrive(state.drive, { hero: state.hero, speed: 0, maxSpeed: SPEED, moveDir: null, look, finds: [], wake: null, dt: DT, random: (): number => 0.5 });
    assert.deepEqual(state.drive.dir, settled);
  }
  assert.deepEqual(wantedDir(state.drive, { moveDir: null, look: NORTH }), state.drive.dir);
});

void test('momentum builds with pace and drains when he stops', (): void => {
  assert.ok(stepMomentum(0, 1, 1) > stepMomentum(0, 0.5, 1));
  assert.equal(stepMomentum(0.2, 0, 1), 0);
  assert.equal(stepMomentum(1, 1, 1), 1);
});

void test('walking spins off eddies behind him, a few at a time', (): void => {
  const state: Walk = fresh();
  walk(state, EAST, 4);
  assert.ok(state.drive.eddies.length > 0 && state.drive.eddies.length <= MIST.eddies);
  for (const eddy of state.drive.eddies) assert.ok(eddy.at.x < state.hero.x);
  const oldest: number = Math.min(...state.drive.eddies.map((eddy): number => eddy.life));
  walk(state, EAST, 0.1);
  assert.ok(state.drive.eddies.every((eddy): boolean => eddy.life > 0) && state.drive.eddies.length <= MIST.eddies);
  assert.ok(oldest > 0);
  walk(state, null, MIST.eddyLife + 0.5);
  assert.equal(state.drive.eddies.length, 0);
});

void test('the clearing is a small pocket at rest and a channel ahead in motion', (): void => {
  const rest = { dir: EAST, momentum: 0, gust: null, wake: null };
  assert.ok(clearing(rest, 0, 0) > 0.99);
  assert.equal(clearing(rest, 6, 0), 0);
  const moving = { dir: EAST, momentum: 1, gust: null, wake: null };
  assert.ok(clearing(moving, 8, 0) > 0.9);
  assert.equal(clearing(moving, -8, 0), 0);
  assert.equal(clearing(moving, 0, 8), 0);
});

void test('a full set of eddies lets each one fade out before a new one spins up', (): void => {
  const state: Walk = fresh();
  let fewest: number = 1;
  for (let time: number = 0; time < 8; time += DT) {
    const before = state.drive.eddies.map((eddy) => eddy.life);
    walk(state, Math.floor(time * 2) % 2 === 0 ? EAST : NORTH, DT);
    if (before.length === MIST.eddies && state.drive.eddies.length < before.length) fewest = Math.min(fewest, ...before);
  }
  assert.ok(fewest <= DT / MIST.eddyLife + 1e-6, `an eddy with life ${fewest} was dropped`);
});

void test('a gust lane runs its whole length inside the field', (): void => {
  const half: number = MIST.span / 2;
  assert.ok(MIST.gustReach <= half * MIST.edgeStart);
});

void test('the wake pocket starts tight on him, swells out past the play pocket and settles into it', (): void => {
  assert.equal(wakePocket(0), MIST.wake.lying);
  assert.ok(Math.abs(wakePocket(1) - MIST.pocketStill) < 1e-9);
  const peak: number = wakePocket(MIST.wake.swell);
  assert.ok(peak > MIST.pocketMoving);
  let before: number = wakePocket(0);
  for (let front: number = 0.002; front <= 1.0001; front += 0.002) {
    const now: number = wakePocket(front);
    assert.ok(Math.abs(now - before) < 0.06, `the pocket jumps at ${front.toFixed(2)}`);
    before = now;
  }
});

void test('the wake front clears the field around him and hands over to the play pocket with no step', (): void => {
  const lying = { dir: EAST, momentum: 0, gust: null, wake: 0 };
  assert.equal(clearing(lying, 2, 0), 0);
  const swelling = { dir: EAST, momentum: 0, gust: null, wake: MIST.wake.swell };
  assert.ok(clearing(swelling, 2, 0) > 0.9);
  assert.ok(clearing(swelling, 4, 0) > clearing(lying, 1, 0));
  const settled = { dir: EAST, momentum: 0, gust: null, wake: 1 };
  const play = { dir: EAST, momentum: 0, gust: null, wake: null };
  for (let away: number = 0; away < 8; away += 0.25) assert.ok(Math.abs(clearing(settled, away, 0) - clearing(play, away, 0)) < 1e-9);
});

void test('the stir sends a small ripple, the rise a front that rolls outward past the play pocket and fades before control', (): void => {
  assert.equal(wakeRim(0, 0).strength, 0);
  const ripple = wakeRim(0.5, 0);
  assert.ok(ripple.strength > 0 && ripple.strength < MIST.rim.strength);
  assert.ok(ripple.radius > MIST.wake.lying);
  let before = wakeRim(0, 0.001);
  let strongest: number = 0;
  for (let front: number = 0.002; front <= 1.0001; front += 0.002) {
    const now = wakeRim(0, front);
    if (now.strength > 0.05) assert.ok(now.radius >= before.radius - 1e-9, `the front turns back at ${front.toFixed(3)}`);
    assert.ok(Math.abs(now.radius - before.radius) < 0.06 && Math.abs(now.strength - before.strength) < 0.02);
    strongest = Math.max(strongest, now.strength);
    before = now;
  }
  assert.ok(strongest > 0.95);
  assert.ok(wakeRim(0, 0.5).radius > MIST.pocketMoving);
  assert.ok(Math.abs(wakeRim(0, 1).strength) < 1e-9);
});

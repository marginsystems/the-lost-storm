import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_COVERS, coverKey, coveringKeys, coversOf, groupHidden, hiddenWithCovers, readCover } from './body-covers.ts';
import type { BodyCover, CoverableWearable } from './body-covers.ts';

const COAT: string = 'models/wear/leather_jerkin.glb';
const TROUSERS: CoverableWearable = { model: 'models/wear/wool_trousers.glb', hides: ['legs'] };
const JERKIN: CoverableWearable = { model: COAT, hides: ['torso', 'arms'] };
const VEST: CoverableWearable = { model: 'models/wear/vest.glb', hides: ['torso'] };

function never(): boolean {
  return false;
}

function cover(hidden: readonly (readonly [number, number])[]): BodyCover {
  return { body: 'models/characters/man.glb', mesh: 'man', wearable: COAT, triangles: 6, hidden };
}

void test('a baked list is read only when every range sits inside the body it names', (): void => {
  const read: BodyCover = readCover({ body: 'b.glb', mesh: 'b', wearable: 'w.glb', triangles: 4, hidden: [[0, 1], [3, 3]] }, 'cover');
  assert.deepEqual(read.hidden, [[0, 1], [3, 3]]);
  assert.throws((): BodyCover => readCover({ body: 'b.glb', mesh: 'b', wearable: 'w.glb', triangles: 4, hidden: [[2, 4]] }, 'cover'));
  assert.throws((): BodyCover => readCover({ body: 'b.glb', mesh: 'b', wearable: 'w.glb', triangles: 4, hidden: [[3, 1]] }, 'cover'));
  assert.throws((): BodyCover => readCover({ body: 'b.glb', wearable: 'w.glb', triangles: 4, hidden: [] }, 'cover'));
});

void test('the shipped coat list names the man and the coat model', (): void => {
  const coats: readonly BodyCover[] = BODY_COVERS.filter((entry: BodyCover): boolean => entry.wearable === COAT);
  assert.deepEqual(coats.map((entry: BodyCover): string => `${entry.body}#${entry.mesh}`), ['models/characters/human_man.glb#human_man']);
});

void test('a list applies only to the body, mesh and triangle count it was baked on', (): void => {
  const covers: readonly BodyCover[] = [cover([[1, 2]])];
  assert.equal(coversOf(covers, 'models/characters/man.glb', 'man', 6).length, 1);
  assert.equal(coversOf(covers, 'models/characters/man.glb', 'man', 7).length, 0);
  assert.equal(coversOf(covers, 'models/characters/man.glb', 'man_eyes', 6).length, 0);
  assert.equal(coversOf(covers, 'models/characters/woman.glb', 'man', 6).length, 0);
});

void test('each triangle knows which worn models cover it', (): void => {
  assert.deepEqual(coveringKeys([cover([[1, 2], [5, 5]])], 6), [[], [coverKey(COAT)], [coverKey(COAT)], [], [], [coverKey(COAT)]]);
});

void test('a coat with a list hides by its list, and pieces without one still hide their parts', (): void => {
  const listed: ReadonlySet<string> = new Set<string>([COAT]);
  assert.deepEqual(hiddenWithCovers([JERKIN, TROUSERS], ['torso', 'arms', 'legs'], listed), ['legs', coverKey(COAT)]);
  assert.deepEqual(hiddenWithCovers([JERKIN, VEST], ['torso', 'arms'], listed), ['torso', coverKey(COAT)]);
  assert.deepEqual(hiddenWithCovers([JERKIN, TROUSERS], ['torso', 'arms', 'legs'], new Set<string>()), ['torso', 'arms', 'legs']);
});

void test('a group hides when its parts are hidden or a worn list covers it', (): void => {
  assert.equal(groupHidden({ mask: 1, covers: [coverKey(COAT)] }, [coverKey(COAT)], never), true);
  assert.equal(groupHidden({ mask: 1, covers: [coverKey(COAT)] }, ['legs'], never), false);
  assert.equal(groupHidden({ mask: 1, covers: [] }, ['legs'], (): boolean => true), true);
});

void test('taking every piece off brings the hidden set back to exactly what the base pieces hide', (): void => {
  const listed: ReadonlySet<string> = new Set<string>([COAT]);
  const base: readonly string[] = ['feet'];
  const boots: CoverableWearable = { model: 'models/wear/tall_boots.glb', hides: ['feet'] };
  for (const piece of [JERKIN, TROUSERS, VEST]) {
    const on: string[] = hiddenWithCovers([boots, piece], [...base, ...piece.hides], listed);
    assert.notDeepEqual(on, base);
    assert.deepEqual(hiddenWithCovers([boots], base, listed), base);
  }
});

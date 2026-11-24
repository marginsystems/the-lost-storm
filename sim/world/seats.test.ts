import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef, PropSeat, ZoneDef, ZoneProp } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { outlineGap } from '../nav/outline.ts';
import { seatAt, zoneSeats } from './seats.ts';
import type { ZoneSeat } from './seats.ts';

const SITTER = {
  hipsBehind: 0.33,
  feetWithin: 0.2,
} as const;

const NEAR: number = 1e-9;

const content: Content = loadContent();

function placed(rotationDegrees: number): ZoneProp {
  return { prop: 'bench', x: 20, z: 23.5, y: 0, rotationDegrees, when: [] };
}

function placedWhen(prop: string, rotationDegrees: number): ZoneProp {
  return { prop, x: 20, z: 23.5, y: 0, rotationDegrees, when: [{ type: 'flag', flag: 'never', is: 'set', not: false }] };
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < NEAR, `${actual} is not ${expected}`);
}

function gapTo(def: PropDef, x: number, z: number): number {
  return Math.min(...def.footprints.map((outline: readonly ReadonlyVec2[]): number => outlineGap(outline, x, z)));
}

void test('a seat turns with its prop: where the sitter stands and which way they face', (): void => {
  const seat: PropSeat = { x: 0, z: 0.33, facingDegrees: 0 };
  const straight: ZoneSeat = seatAt(seat, placed(0));
  close(straight.x, 20);
  close(straight.z, 23.83);
  close(straight.facing, 0);
  const turned: ZoneSeat = seatAt(seat, placed(90));
  close(turned.x, 20.33);
  close(turned.z, 23.5);
  close(turned.facing, Math.PI / 2);
  const back: ZoneSeat = seatAt({ x: 0.5, z: 0, facingDegrees: 90 }, placed(180));
  close(back.x, 19.5);
  close(back.z, 23.5);
  close(Math.abs(back.facing), Math.PI / 2);
  assert.ok(back.facing < 0);
});

void test('the facing points from the seat out the way the sitter looks, the way a hero faces', (): void => {
  const seat: ZoneSeat = seatAt({ x: 0, z: 0.33, facingDegrees: 0 }, placed(90));
  close(Math.sin(seat.facing), (seat.x - 20) / 0.33);
  close(Math.cos(seat.facing), (seat.z - 23.5) / 0.33);
});

void test('the Hideout seats come from its props: the bench and the stool, and nothing that waits on a condition', (): void => {
  const hideout: ZoneDef = zoneOf(content, 'hideout');
  const seats: readonly ZoneSeat[] = zoneSeats(hideout, content.props);
  const bench: ZoneSeat = must(seats.find((seat: ZoneSeat): boolean => seat.prop === 'bench'), 'bench');
  close(bench.x, 20.33);
  close(bench.z, 23.5);
  close(bench.facing, Math.PI / 2);
  assert.ok(seats.some((seat: ZoneSeat): boolean => seat.prop === 'stool'));
  const waiting: ZoneDef = { ...hideout, props: hideout.props.map((prop: ZoneProp): ZoneProp => placedWhen(prop.prop, prop.rotationDegrees)) };
  assert.deepEqual(zoneSeats(waiting, content.props), []);
});

void test('every seat in the data stands the sitter just in front of the prop with the hips over it', (): void => {
  const seated: readonly PropDef[] = [...content.props.values()].filter((def: PropDef): boolean => def.seat !== null);
  assert.deepEqual(seated.map((def: PropDef): string => def.id).toSorted(), ['bench', 'chair', 'stool']);
  for (const def of seated) {
    const seat: PropSeat = must(def.seat, def.id);
    const facing: number = (seat.facingDegrees * Math.PI) / 180;
    const feet: number = gapTo(def, seat.x, seat.z);
    assert.ok(feet > 0 && feet <= SITTER.feetWithin, `${def.id}: the sitter stands ${feet} m from it`);
    const hips: number = gapTo(def, seat.x - Math.sin(facing) * SITTER.hipsBehind, seat.z - Math.cos(facing) * SITTER.hipsBehind);
    assert.ok(hips < 0, `${def.id}: the hips land ${hips} m off it`);
  }
});

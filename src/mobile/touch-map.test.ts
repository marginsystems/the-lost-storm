import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Candidate } from './touch-map.ts';
import { aimedSkill, autoAimTarget, clampKnob, cooldownTurn, isTap, joinsPinch, pinchWheelDelta, prefersTouch, readStick, rotateHintShows, sideForPoint, startsStick, stickDirection, stickMove, TOUCH, touchButtons } from './touch-map.ts';

const YAW: number = Math.PI / 4;
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

void test('a query string forces touch on or off, otherwise a coarse pointer decides', (): void => {
  assert.equal(prefersTouch('?touch=1', false), true);
  assert.equal(prefersTouch('?touch=0', true), false);
  assert.equal(prefersTouch('', true), true);
  assert.equal(prefersTouch('', false), false);
});

void test('the stick reads a direction and a magnitude capped at its radius', (): void => {
  const reading = readStick(TOUCH.stickRadius * 2, 0);
  near(reading.x, 1);
  near(reading.magnitude, 1);
  assert.deepEqual(readStick(0, 0), { x: 0, y: 0, magnitude: 0 });
  const knob = clampKnob(0, TOUCH.stickRadius * 3);
  near(knob.z, TOUCH.stickRadius);
});

void test('pushing the stick up walks away from the camera and right walks along the screen right', (): void => {
  const up = stickDirection(readStick(0, -TOUCH.stickRadius), YAW);
  assert.ok(up !== null);
  near(up.x, -Math.sin(YAW));
  near(up.z, -Math.cos(YAW));
  const right = stickDirection(readStick(TOUCH.stickRadius, 0), YAW);
  assert.ok(right !== null);
  near(right.x, Math.cos(YAW));
  near(right.z, -Math.sin(YAW));
});

void test('a small push inside the dead zone moves nothing', (): void => {
  assert.equal(stickDirection(readStick(TOUCH.stickRadius * TOUCH.deadzone * 0.5, 0), YAW), null);
  assert.equal(stickMove({ x: 0, z: 0 }, null, false), null);
});

void test('a stick move heads a fixed reach ahead and is held after the first one', (): void => {
  const first = stickMove({ x: 1, z: 2 }, { x: 1, z: 0 }, false);
  assert.deepEqual(first, { type: 'move', held: false, dest: { x: 1 + TOUCH.stickReach, z: 2 } });
  assert.equal(stickMove({ x: 1, z: 2 }, { x: 1, z: 0 }, true)?.held, true);
});

void test('auto aim takes the nearest living enemy in front and ignores the dead and the far', (): void => {
  const monsters: Candidate[] = [
    { id: 1, pos: { x: 0, z: 6 }, alive: true },
    { id: 2, pos: { x: 0, z: 3 }, alive: false },
    { id: 3, pos: { x: 0, z: 4 }, alive: true },
    { id: 4, pos: { x: 0, z: TOUCH.aimRange + 1 }, alive: true },
  ];
  assert.equal(autoAimTarget(monsters, { x: 0, z: 0 }, { x: 0, z: 1 })?.id, 3);
});

void test('auto aim ignores an enemy behind unless it is within melee reach', (): void => {
  const behind: Candidate = { id: 7, pos: { x: 0, z: -5 }, alive: true };
  assert.equal(autoAimTarget([behind], { x: 0, z: 0 }, { x: 0, z: 1 }), null);
  const close: Candidate = { id: 8, pos: { x: 0, z: -TOUCH.meleeRange * 0.5 }, alive: true };
  assert.equal(autoAimTarget([behind, close], { x: 0, z: 0 }, { x: 0, z: 1 })?.id, 8);
});

void test('an aimed skill targets the enemy, or swings ahead at full range when there is none', (): void => {
  assert.deepEqual(aimedSkill(0, { x: 0, z: 0 }, { x: 0, z: 1 }, { id: 5, pos: { x: 1, z: 2 }, alive: true }), { type: 'skill', slot: 0, aim: { x: 1, z: 2 }, targetId: 5 });
  assert.deepEqual(aimedSkill(2, { x: 1, z: 1 }, { x: 2, z: 0 }, null), { type: 'skill', slot: 2, aim: { x: 1 + TOUCH.aimRange, z: 1 }, targetId: null });
});

void test('buttons put the left click skill first as the attack, then every other slot, then the flasks', (): void => {
  const buttons = touchButtons([{ bindings: ['KeyQ'] }, { bindings: ['mouse_left'] }, { bindings: ['KeyW', 'mouse_right'] }], 'mouse_left', [{ name: 'Life Flask' }]);
  assert.deepEqual(buttons, [
    { kind: 'attack', slot: 1 },
    { kind: 'skill', slot: 0 },
    { kind: 'skill', slot: 2 },
    { kind: 'flask', slot: 0, label: 'Life Flask' },
  ]);
});

void test('spreading two fingers zooms in by their ratio', (): void => {
  const step: number = 0.0016;
  const delta: number = pinchWheelDelta(100, 200, step);
  near(1 + delta * step, 0.5);
  assert.equal(pinchWheelDelta(0, 100, step), 0);
});

void test('the left share of the screen moves, the rest touches the world', (): void => {
  assert.equal(sideForPoint(10, 800), 'move');
  assert.equal(sideForPoint(700, 800), 'world');
});

void test('the rotate hint shows only in portrait while playing, until dismissed or timed out', (): void => {
  assert.equal(rotateHintShows(true, 0, false, true), true);
  assert.equal(rotateHintShows(true, 0, false, false), false);
  assert.equal(rotateHintShows(false, 0, false, true), false);
  assert.equal(rotateHintShows(true, 0, true, true), false);
  assert.equal(rotateHintShows(true, TOUCH.rotateHintMs + 1, false, true), false);
});

void test('a short still touch is a tap, a drag or a long press is not', (): void => {
  assert.equal(isTap(3, 4, 100), true);
  assert.equal(isTap(TOUCH.tapSlopPx + 1, 0, 100), false);
  assert.equal(isTap(0, 0, TOUCH.tapMs + 1), false);
});

void test('the cooldown sweep is a full turn when ready and grows as the cooldown runs out', (): void => {
  assert.equal(cooldownTurn(0, 4), TOUCH.fullTurn);
  assert.equal(cooldownTurn(4, 4), 0);
  assert.equal(cooldownTurn(2, 4), TOUCH.fullTurn / 2);
  assert.equal(cooldownTurn(1, 0), TOUCH.fullTurn);
});

void test('the stick starts on the move side only when no other finger is on the world', (): void => {
  assert.equal(startsStick(10, 800, false, 0), true);
  assert.equal(startsStick(10, 800, true, 0), false);
  assert.equal(startsStick(10, 800, false, 1), false);
  assert.equal(startsStick(700, 800, false, 0), false);
});

void test('a still stick finger joins a second finger that lands soon after as a pinch', (): void => {
  assert.equal(joinsPinch(false, TOUCH.pinchJoinMs - 1), true);
  assert.equal(joinsPinch(true, 10), false);
  assert.equal(joinsPinch(false, TOUCH.pinchJoinMs + 1), false);
});

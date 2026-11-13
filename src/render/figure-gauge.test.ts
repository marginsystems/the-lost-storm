import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BoxGeometry, Group, Mesh, Object3D } from 'three';
import { clampFigure, clampReach, createFigureGauge, FIGURE_GAUGE, figureJoints } from './figure-gauge.ts';

const JOINTS = { head: 'Head', feet: ['foot_l', 'foot_r'] } as const;

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} is not ${expected}`);
}

function figureOf(height: number): Group {
  const group: Group = new Group();
  const body: Mesh = new Mesh(new BoxGeometry(0.5, height, 0.4));
  body.position.y = height / 2;
  group.add(body);
  group.updateMatrixWorld(true);
  return group;
}

function lyingOf(length: number): Group {
  const group: Group = new Group();
  const body: Mesh = new Mesh(new BoxGeometry(length, 0.3, 0.4));
  body.position.x = length / 2;
  group.add(body);
  group.updateMatrixWorld(true);
  return group;
}

void test('a figure is measured from its real bounds, so a taller body clears a taller pocket', (): void => {
  const gauge = createFigureGauge(JOINTS);
  near(gauge.measure(figureOf(1.7), 0).height, 1.7);
  near(gauge.measure(figureOf(2.4), 0.1).height, 2.4);
});

void test('a figure lying down reaches out along the ground from where it stands', (): void => {
  const gauge = createFigureGauge(JOINTS);
  const standing: number = gauge.measure(figureOf(1.7), 0).reach;
  const lying: number = gauge.measure(lyingOf(1.8), 0).reach;
  assert.ok(standing < 0.5, `standing reach ${standing}`);
  near(lying, Math.hypot(1.8, 0.2));
});

void test('the same figure is measured again only after a while', (): void => {
  const gauge = createFigureGauge(JOINTS);
  const figure: Group = figureOf(1.7);
  near(gauge.measure(figure, 0).height, 1.7);
  figure.scale.set(1, 1.5, 1);
  figure.updateMatrixWorld(true);
  near(gauge.measure(figure, FIGURE_GAUGE.everySeconds / 2).height, 1.7);
  near(gauge.measure(figure, FIGURE_GAUGE.everySeconds).height, 2.55);
});

void test('an empty or absurd figure falls back to a person-sized height', (): void => {
  assert.equal(createFigureGauge(JOINTS).measure(new Group(), 0).height, FIGURE_GAUGE.fallback);
  assert.equal(clampFigure(Number.NaN), FIGURE_GAUGE.fallback);
  assert.equal(clampFigure(40), FIGURE_GAUGE.max);
  assert.equal(clampFigure(0.3), FIGURE_GAUGE.min);
  assert.equal(clampReach(Number.NaN), 0);
  assert.equal(clampReach(40), FIGURE_GAUGE.maxReach);
});

void test('a figure with a head and feet reports where they rest on the ground, every frame', (): void => {
  const gauge = createFigureGauge(JOINTS);
  const figure: Group = lyingOf(1.8);
  const head: Object3D = new Object3D();
  head.name = JOINTS.head;
  head.position.set(1.7, 0.2, 0);
  figure.add(head);
  for (const [index, name] of JOINTS.feet.entries()) {
    const foot: Object3D = new Object3D();
    foot.name = name;
    foot.position.set(0.1, 0.1, index === 0 ? -0.1 : 0.1);
    figure.add(foot);
  }
  figure.updateMatrixWorld(true);
  const first = gauge.measure(figure, 0).span;
  assert.ok(first !== null);
  near(first.head.x, 1.7);
  near(first.feet.x, 0.1);
  near(first.feet.z, 0);
  head.position.x = 0.2;
  figure.updateMatrixWorld(true);
  const moved = gauge.measure(figure, FIGURE_GAUGE.everySeconds / 4).span;
  assert.ok(moved !== null);
  near(moved.head.x, 0.2);
  assert.equal(gauge.measure(figureOf(1.7), 1).span, null);
});

void test('a rising figure is as tall as its head every frame, so the mist clear reaches his face before the next measurement', (): void => {
  const gauge = createFigureGauge(JOINTS);
  const figure: Group = lyingOf(1.8);
  const head: Object3D = new Object3D();
  head.name = JOINTS.head;
  head.position.set(1.7, 0.2, 0);
  figure.add(head);
  const foot: Object3D = new Object3D();
  foot.name = JOINTS.feet[0];
  figure.add(foot);
  figure.updateMatrixWorld(true);
  const lying: number = gauge.measure(figure, 0).height;
  head.position.set(0, 1.6, 0);
  figure.updateMatrixWorld(true);
  near(gauge.measure(figure, FIGURE_GAUGE.everySeconds / 4).height, Math.max(lying, 1.6 + FIGURE_GAUGE.crown));
  assert.ok(gauge.measure(figure, FIGURE_GAUGE.everySeconds / 4).height >= 1.6 + FIGURE_GAUGE.crown - 1e-9);
});

void test('the gauge takes the head and the feet from the rig\'s body parts, and a rig that names neither has no span', (): void => {
  assert.deepEqual(figureJoints({ head: ['Head', 'neck_01'], feet: ['foot_l', 'ball_l'] }), { head: 'Head', feet: ['foot_l', 'ball_l'] });
  assert.deepEqual(figureJoints({}), { head: null, feet: [] });
  const figure: Group = new Group();
  const head: Bone = new Bone();
  head.name = JOINTS.head;
  figure.add(head);
  assert.equal(createFigureGauge(figureJoints({})).measure(figure, 0).span, null);
});

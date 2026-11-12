import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh } from 'three';
import { clampFigure, createFigureGauge, FIGURE_GAUGE } from './figure-gauge.ts';

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

void test('a figure is measured from its real bounds, so a taller body clears a taller pocket', (): void => {
  const gauge = createFigureGauge();
  near(gauge.height(figureOf(1.7), 0), 1.7);
  near(gauge.height(figureOf(2.4), 0.1), 2.4);
});

void test('the same figure is measured again only after a while', (): void => {
  const gauge = createFigureGauge();
  const figure: Group = figureOf(1.7);
  near(gauge.height(figure, 0), 1.7);
  figure.scale.set(1, 1.5, 1);
  figure.updateMatrixWorld(true);
  near(gauge.height(figure, FIGURE_GAUGE.everySeconds / 2), 1.7);
  near(gauge.height(figure, FIGURE_GAUGE.everySeconds), 2.55);
});

void test('an empty or absurd figure falls back to a person-sized height', (): void => {
  assert.equal(createFigureGauge().height(new Group(), 0), FIGURE_GAUGE.fallback);
  assert.equal(clampFigure(Number.NaN), FIGURE_GAUGE.fallback);
  assert.equal(clampFigure(40), FIGURE_GAUGE.max);
  assert.equal(clampFigure(0.3), FIGURE_GAUGE.min);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWeather } from './weather.ts';

void test('the first strike in a zone comes after its first wait, and later ones inside its range', (): void => {
  const weather = createWeather((): number => 0);
  const flash = (): number => weather.flash;
  weather.setLightning({ first: 1, min: 5, max: 9 });
  weather.update(0.9);
  assert.equal(flash(), 0);
  weather.update(0.2);
  assert.ok(flash() > 0.9);
  for (let step: number = 0; step < 240; step += 1) weather.update(1 / 60);
  assert.ok(flash() < 0.05);
  weather.update(1.5);
  assert.ok(flash() > 0.9);
});

void test('a zone with no lightning never strikes, and a strike from a hit still flashes', (): void => {
  const weather = createWeather((): number => 0);
  weather.setLightning(null);
  for (let step: number = 0; step < 600; step += 1) weather.update(1 / 20);
  assert.equal(weather.flash, 0);
  weather.strike(0.6);
  assert.equal(weather.flash, 0.6);
});

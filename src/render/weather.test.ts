import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIGHTNING_CLUSTER, LIGHTNING_KINDS } from '../../sim/content/parse-weather.ts';
import type { ZoneLightning } from '../../sim/content/road-types.ts';
import { LIGHTNING } from './lightning.ts';
import type { Thunder, Weather } from './weather.ts';
import { createFlashLimiter, createWeather, pickKind, WEATHER } from './weather.ts';
import type { FlashLimiter } from './weather.ts';

function seeded(seed: number): () => number {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const STORM: ZoneLightning = { first: 1, min: 5, max: 9, cluster: LIGHTNING_CLUSTER, kinds: LIGHTNING_KINDS };
const MS: number = 0.001;
const SWING: number = WEATHER.swing;

function flashTimes(weather: Weather, seconds: number, strikeAt: (time: number) => boolean): number[] {
  const times: number[] = [];
  let low: number = 0;
  let high: number = 0;
  let rising: boolean = true;
  for (let step: number = 0; step < seconds / MS; step += 1) {
    const time: number = step * MS;
    if (strikeAt(time)) weather.strike(1);
    weather.update(MS);
    const value: number = weather.flash;
    if (rising) {
      if (value < low) low = value;
      if (value - low >= SWING) {
        times.push(time);
        rising = false;
        high = value;
      }
    } else {
      if (value > high) high = value;
      if (high - value >= SWING) {
        rising = true;
        low = value;
      }
    }
  }
  return times;
}

function mostInOneSecond(times: readonly number[]): number {
  let most: number = 0;
  times.forEach((start: number, index: number): void => {
    most = Math.max(most, times.slice(index).filter((time: number): boolean => time < start + 1).length);
  });
  return most;
}

void test('the first strike in a zone comes after its first wait, and a zone with no lightning never strikes', (): void => {
  const weather: Weather = createWeather(seeded(1));
  weather.setLightning(STORM);
  weather.update(0.9);
  const before: number = weather.flash;
  weather.update(0.2);
  weather.update(0.01);
  const after: number = weather.flash;
  assert.equal(before, 0);
  assert.ok(after > 0.1);
  const calm: Weather = createWeather(seeded(1));
  calm.setLightning(null);
  for (let step: number = 0; step < 600; step += 1) calm.update(1 / 20);
  assert.equal(calm.flash, 0);
});

void test('strikes come in clusters and lulls, never on a beat', (): void => {
  const weather: Weather = createWeather(seeded(6));
  weather.setLightning({ ...STORM, cluster: { chance: 0.6, most: 3, min: 1.4, max: 3 } });
  const starts: number[] = [];
  let was: number = 0;
  for (let step: number = 0; step < 600 * 30; step += 1) {
    weather.update(1 / 30);
    if (weather.flash > 0.05 && was <= 0.05 && (starts.length === 0 || step / 30 - (starts[starts.length - 1] ?? 0) > 1)) starts.push(step / 30);
    was = weather.flash;
  }
  const gaps: number[] = starts.slice(1).map((start: number, index: number): number => start - (starts[index] ?? 0));
  assert.ok(gaps.some((gap: number): boolean => gap < 3.5));
  assert.ok(gaps.some((gap: number): boolean => gap >= 5));
  assert.ok(new Set(gaps.map((gap: number): number => Math.round(gap * 4))).size > 8);
});

void test('in any one second there are never more than three flashes, even with moment strikes landing on top', (): void => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const random: () => number = seeded(seed * 31);
    const weather: Weather = createWeather(seeded(seed));
    weather.setLightning({ ...STORM, min: 1.4, max: 3, cluster: { chance: 0.7, most: 3, min: 1.4, max: 2 } });
    const times: number[] = flashTimes(weather, 120, (): boolean => random() < 0.0004);
    assert.ok(times.length > 40, `seed ${seed} flashed ${times.length} times`);
    assert.ok(mostInOneSecond(times) <= LIGHTNING.deepPerSecond, `seed ${seed}`);
  }
});

void test('softened flashes stay gentle and never flash more than once a second', (): void => {
  const weather: Weather = createWeather(seeded(7));
  weather.setSoft(true);
  weather.setLightning({ ...STORM, min: 1.4, max: 3 });
  let peak: number = 0;
  const times: number[] = flashTimes(weather, 120, (time: number): boolean => Math.abs(time % 7 - 3) < MS / 2);
  for (let step: number = 0; step < 2000; step += 1) {
    weather.update(MS * 10);
    peak = Math.max(peak, weather.flash);
  }
  assert.ok(peak <= LIGHTNING.softPeak + 1e-9);
  assert.ok(mostInOneSecond(times) <= 1);
});

void test('a near strike swings the key light to its side and a sheet strike lifts only the sky', (): void => {
  assert.equal(pickKind({ sheet: 1, near: 0, fork: 0 }, 0.99), 'sheet');
  assert.equal(pickKind({ sheet: 0, near: 1, fork: 0 }, 0.5), 'near');
  assert.equal(pickKind({ sheet: 1, near: 1, fork: 2 }, 0.75), 'fork');
  const near: Weather = createWeather(seeded(3));
  near.setLightning({ ...STORM, kinds: { sheet: 0, near: 1, fork: 0 } });
  near.update(1.005);
  assert.equal(near.light.sheet, 0);
  assert.ok(Math.hypot(near.light.dirX, near.light.dirZ) > 0.99);
  assert.ok(near.light.cool > 0.9);
  const sheet: Weather = createWeather(seeded(3));
  sheet.setLightning({ ...STORM, kinds: { sheet: 1, near: 0, fork: 0 } });
  sheet.update(1.1);
  assert.equal(sheet.light.sheet, 1);
  assert.ok(sheet.light.amount > 0);
});

void test('a forked strike shows its bolt only while its strokes burn, and thunder arrives by distance', (): void => {
  const weather: Weather = createWeather(seeded(11));
  weather.setLightning({ ...STORM, kinds: { sheet: 0, near: 0, fork: 1 } });
  weather.update(1.003);
  assert.ok(weather.bolt.shown > 0);
  for (let step: number = 0; step < 60; step += 1) weather.update(1 / 60);
  assert.equal(weather.bolt.shown, 0);
  let heard: Thunder[] = [];
  for (let step: number = 0; step < 60 * 20 && heard.length === 0; step += 1) {
    weather.update(1 / 60);
    heard = weather.takeThunder();
  }
  const kinds: string[] = heard.map((thunder: Thunder): string => thunder.kind);
  const loudness: number[] = heard.map((thunder: Thunder): number => thunder.loudness);
  assert.deepEqual(kinds, ['fork']);
  assert.ok(loudness.every((value: number): boolean => value > 0));
  assert.deepEqual(weather.takeThunder(), []);
});

void test('each moment strike plays once, and several landing together merge into one or two, and a hit pulse is a plain glow with no thunder', (): void => {
  const weather: Weather = createWeather(seeded(13));
  weather.setLightning(null);
  for (let index: number = 0; index < 4; index += 1) weather.strike(1);
  let lit: number = 0;
  for (let step: number = 0; step < 60 * 8; step += 1) {
    weather.update(1 / 60);
    if (weather.flash > 0.05) lit = step;
  }
  assert.ok(lit < 60 * 6);
  const heard: number = weather.takeThunder().length;
  assert.ok(heard >= 1 && heard <= 2);
  weather.pulse(0.5);
  weather.update(1 / 60);
  weather.update(1 / 60);
  assert.ok(weather.flash > 0.1);
  for (let step: number = 0; step < 60 * 3; step += 1) weather.update(1 / 60);
  assert.equal(weather.flash, 0);
  assert.deepEqual(weather.takeThunder(), []);
});

void test('the limiter counts a rise from a shallow dip as a flash, so a strike that never fully darkens cannot slip past the cap', (): void => {
  const limiter: FlashLimiter = createFlashLimiter();
  const steps: readonly number[] = [0, 0.4, 0.8, 0.7, 0.65, 0.8, 0.95, 0.6, 0.62, 0.9];
  const shown: number[] = steps.map((value: number, index: number): number => limiter.limit(value, index * 0.01, 1));
  assert.equal(shown[2], 0.8);
  assert.ok((shown[6] ?? 1) < 0.65 + WEATHER.swing);
  assert.ok((shown[9] ?? 1) < 0.6 + WEATHER.swing);
  const later: number = limiter.limit(0, 2, 1);
  assert.equal(later, 0);
  assert.equal(limiter.limit(0.9, 2.01, 1), 0.9);
});

void test('turning on softened flashes in the middle of a strike calms that strike at once', (): void => {
  const weather: Weather = createWeather(seeded(3));
  weather.setLightning({ ...STORM, kinds: { sheet: 0, near: 1, fork: 0 } });
  weather.update(1.008);
  assert.ok(weather.flash > LIGHTNING.softPeak);
  weather.setSoft(true);
  for (let step: number = 0; step < 600; step += 1) {
    weather.update(MS);
    assert.ok(weather.flash <= LIGHTNING.softPeak + 1e-9);
  }
});

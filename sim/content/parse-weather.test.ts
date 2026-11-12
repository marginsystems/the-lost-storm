import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_WEATHER, zoneWeather } from './parse-weather.ts';
import { ContentError } from './read.ts';

void test('a zone with no weather keeps the default storm overhead and no rain', (): void => {
  assert.deepEqual(zoneWeather(undefined, 'zone.weather'), DEFAULT_WEATHER);
});

void test('weather reads lightning timing, rain, wet ground and a mist wall', (): void => {
  const read = zoneWeather({ lightning: { first: 1.2, min: 5, max: 11 }, rain: 0.8, wet: 0.6, mistWall: { from: { x: 0, z: 4 }, to: { x: 0, z: 40 }, height: 9 } }, 'zone.weather');
  assert.deepEqual(read, { lightning: { first: 1.2, min: 5, max: 11 }, rain: 0.8, wet: 0.6, mistWall: { from: { x: 0, z: 4 }, to: { x: 0, z: 40 }, height: 9 } });
  assert.deepEqual(zoneWeather({ lightning: null, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), { lightning: null, rain: 0, wet: 0, mistWall: null });
});

void test('weather rejects rain past full and strikes that wait less at most than at least', (): void => {
  assert.throws((): unknown => zoneWeather({ lightning: null, rain: 1.5, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
  assert.throws((): unknown => zoneWeather({ lightning: { first: 0, min: 9, max: 4 }, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
});

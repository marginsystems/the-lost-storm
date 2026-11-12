import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShaderChunk } from 'three';
import { gradeShader, installGrade, rimFor, STAGE } from './stage.ts';
import type { ZoneAmbience } from '../../sim/content/types.ts';

const NIGHT: ZoneAmbience = { background: '#06080d', abyss: '#040508', fogNear: 20, fogFar: 70, skyColor: '#4a5c7c', groundColor: '#100d0b', skyIntensity: 1.1, keyColor: '#9fb3d6', keyIntensity: 0.7 };

void test('the grade only reaches into the darks: tint, contrast and floor all fade out by shade', (): void => {
  const shader: string = gradeShader();
  assert.match(shader, /shade \* /);
  assert.match(shader, /mix\( mapped, min\( deeper, mapped \), shade \)/);
  assert.match(shader, /\* shade, 0\.0, 1\.0 \)/);
});

void test('figures get a rim in a dark zone and almost none in white mist', (): void => {
  const dark: number = rimFor(NIGHT).r;
  const white: number = rimFor({ ...NIGHT, background: '#d9dcdf', keyColor: '#f3f5f8', keyIntensity: 0.9 }).r;
  assert.ok(dark > 0.05);
  assert.ok(white < dark * 0.1);
});

void test('the grade is installed into the tone-mapping chunk on load, and installing again changes nothing', (): void => {
  assert.ok(ShaderChunk.tonemapping_pars_fragment.includes(gradeShader()));
  const before: string = ShaderChunk.tonemapping_pars_fragment;
  installGrade();
  assert.equal(ShaderChunk.tonemapping_pars_fragment, before);
});

void test('a bright key never turns the rim into a white outline', (): void => {
  const rim = rimFor({ ...NIGHT, keyColor: '#ffffff', keyIntensity: 8 });
  assert.ok(Math.max(rim.r, rim.g, rim.b) <= STAGE.rimMost + 1e-9);
});

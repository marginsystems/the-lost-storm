import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShaderLib } from 'three';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import type { FloorLayout } from './floor-material.ts';
import { floorProgramKey, glowLayerFunction, patchFloorShader } from './floor-material.ts';

const glows: SurfaceGlow[] = [...loadContent().surfaces.values()].flatMap((def): SurfaceGlow[] => (def.glow === null ? [] : [def.glow]));

function layout(glow: SurfaceGlow | null): FloorLayout {
  return {
    layers: [
      { tint: '#ffffff', roughness: 1, normalScale: 1, scale: 0.25, glow: null },
      { tint: '#a0a0a0', roughness: 0.8, normalScale: 1.2, scale: 0.3, glow },
    ],
    fringes: [1],
    blends: [0, 1],
    fringeOrder: [0],
    blendOrder: [1, 0],
    wet: 0.35,
  };
}

function patched(plan: FloorLayout): { vertexShader: string; fragmentShader: string } {
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  patchFloorShader(shader, plan);
  return shader;
}

void test('the floor shader replaces every chunk it draws itself, so none of them reads the one-texture maps', (): void => {
  const shader = patched(layout(null));
  for (const chunk of ['map_fragment', 'roughnessmap_fragment', 'normal_fragment_maps', 'aomap_fragment']) assert.ok(!shader.fragmentShader.includes(`#include <${chunk}>`), chunk);
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance += floorGlow;'));
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= floorAlbedo * vFloorShade;'));
  assert.ok(shader.vertexShader.includes('vGroundXZ = uv;'));
  assert.deepEqual(unsafeGlsl(shader.fragmentShader), []);
});

void test('every lava glow is rewritten to read the colour array at its own layer', (): void => {
  assert.ok(glows.length > 0);
  for (const glow of glows) {
    const source: string = glowLayerFunction(3, glow);
    assert.ok(!/\bmap\b/.test(source.replaceAll('floorMap', '').replaceAll('floorMapBias', '')), source);
    assert.ok(!source.includes('vMapUv') && !source.includes('diffuseColor') && !source.includes('totalEmissiveRadiance') && !source.includes('USE_MAP'));
    assert.ok(source.startsWith('void floorGlow3('));
  }
});

void test('a glowing layer is called only for its own layer, and the program key follows the layout', (): void => {
  const glow: SurfaceGlow | undefined = glows[0];
  if (glow === undefined) throw new Error('no glow surface');
  const lit = patched(layout(glow));
  assert.ok(lit.fragmentShader.includes('if ( layer == 1 ) floorGlow1('));
  assert.ok(!patched(layout(null)).fragmentShader.includes('floorGlow1('));
  assert.notEqual(floorProgramKey(layout(glow)), floorProgramKey(layout(null)));
  assert.notEqual(floorProgramKey({ ...layout(null), wet: 0 }), floorProgramKey(layout(null)));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import raw from '../../data/glitches.json' with { type: 'json' };
import { loadContent } from './content.ts';
import { must } from '../../test/support.ts';
import type { GlitchDef, GlitchStage } from './glitches.ts';
import { glitchKnownOf, glitchProblems, loadGlitches, parseGlitches } from './glitches.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

const content: Content = loadContent();

void test('the shipped glitches read cleanly and every prop and quest they name exists', (): void => {
  const def: GlitchDef = loadGlitches();
  assert.deepEqual(glitchProblems(def, glitchKnownOf(content)), []);
  const first: GlitchStage = must(def.stages[0], 'first stage');
  assert.equal(first.from, 0);
  assert.equal(first.kinds.includes('hard_cut'), false);
  assert.ok(def.stages.every((stage): boolean => stage.mist.min >= 1 && stage.mist.max <= 3));
});

void test('glitches that name a missing prop or quest are reported', (): void => {
  const def: GlitchDef = parseGlitches({ ...raw, mistZone: 'hall_of_time', triggers: [{ id: 'x', kind: 'stutter', during: 'any', when: [{ type: 'quest', quest: 'no_quest', is: 'done' }] }], edits: [...raw.edits, { id: 'odd', type: 'prop_shift', weight: 1, reach: 2, distance: 1, props: ['no_prop'] }] });
  assert.deepEqual(glitchProblems(def, glitchKnownOf(content)), ['glitches.edits.odd: unknown prop no_prop', 'glitches: unknown quest no_quest', 'glitches.mistZone: hall_of_time is not a void zone']);
});

void test('stages out of order, an unknown edit, a bad template or a bad kind are refused', (): void => {
  const [first, second] = raw.stages;
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [second, first] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, edits: ['missing'] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, wrongWord: { names: [], template: 'no slots' } }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, kinds: ['explode'] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, mist: { min: 2, max: 1 } }] }), ContentError);
});

void test('a swap edit with no pairs, or a twoWay that is not a boolean, is refused', (): void => {
  assert.throws((): GlitchDef => parseGlitches({ ...raw, edits: [...raw.edits, { id: 'empty', type: 'prop_swap', weight: 1, reach: 2, twoWay: true, pairs: [] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, edits: [...raw.edits, { id: 'loose', type: 'prop_swap', weight: 1, reach: 2, twoWay: 'yes', pairs: [{ from: 'crate', to: 'barrel' }] }] }), ContentError);
});

void test('a stage with no kinds, a hard-cut stage with no edits, no wrong names, or a loose quietPass flag is refused', (): void => {
  const first = must(raw.stages[0], 'first stage');
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, kinds: [] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, kinds: ['hard_cut'], edits: [] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, quietPass: 'true' }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, wrongWord: { ...raw.wrongWord, names: [] } }), ContentError);
});

void test('silhouettes whose far ring is not beyond the near one, or hard cuts with no hero_turn to fall back on, are refused', (): void => {
  assert.throws((): GlitchDef => parseGlitches({ ...raw, silhouettes: { near: 9, far: 9 } }), ContentError);
  const first = must(raw.stages[0], 'first stage');
  const turnless = { ...first, kinds: ['hard_cut'], edits: ['lamp_out'] };
  assert.throws((): GlitchDef => parseGlitches({ ...raw, edits: raw.edits.filter((entry): boolean => entry.type !== 'hero_turn'), stages: [turnless] }), ContentError);
});

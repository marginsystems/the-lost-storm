import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { MomentDef } from './moment-types.ts';
import { momentProblems } from './moments.ts';
import type { Content, ZoneDef } from './types.ts';

const shipped: Content = loadContent();

const MOMENT: MomentDef = {
  id: 'test_fire',
  name: 'A campfire',
  tint: '#ff9a3c',
  bright: false,
  radius: 6,
  lifetime: 40,
  awake: 15,
  turnChance: 0.5,
  props: [{ prop: 'fire_pit', x: 0, z: 0, rotationDegrees: 0 }],
  echoes: [{ monster: 'unfinished_brute', x: 1, z: 0, facingDegrees: 0, pose: { clip: 'idle', at: 0.5 }, turns: true, look: null }],
  reward: { goldMin: 5, goldMax: 9, items: 1, itemChance: 0.4, rarity: null },
};

function withMoment(def: MomentDef, zone: ZoneDef | null = null): Content {
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(shipped.zones);
  if (zone !== null) zones.set(zone.id, zone);
  return { ...shipped, zones, moments: { ...shipped.moments, defs: new Map<string, MomentDef>([...shipped.moments.defs, [def.id, def]]) } };
}

void test('the shipped moments are consistent', (): void => {
  assert.deepEqual(momentProblems(shipped), []);
});

void test('a moment naming an unknown prop, monster, clip or rarity is reported', (): void => {
  assert.deepEqual(momentProblems(withMoment(MOMENT)), []);
  const broken: MomentDef = {
    ...MOMENT,
    props: [{ prop: 'nowhere', x: 0, z: 0, rotationDegrees: 0 }],
    echoes: [
      { monster: 'nobody', x: 0, z: 0, facingDegrees: 0, pose: { clip: 'idle', at: 0 }, turns: false, look: null },
      { monster: 'unfinished_brute', x: 0, z: 0, facingDegrees: 0, pose: { clip: 'juggle', at: 0 }, turns: false, look: null },
    ],
    reward: { ...MOMENT.reward, rarity: 'mythic' },
  };
  assert.equal(momentProblems(withMoment(broken)).length, 4);
});

void test('an echo look must fit its rig, and an echo that may turn needs its fighting clip on that rig', (): void => {
  const dressed: MomentDef = { ...MOMENT, echoes: [{ monster: 'unfinished_brute', x: 1, z: 0, facingDegrees: 0, pose: { clip: 'idle', at: 0.5 }, turns: true, look: { rig: 'human_man', scale: 1, gear: ['raider_maul'], wear: ['linen_shirt', 'wool_trousers'] } }] };
  assert.deepEqual(momentProblems(withMoment(dressed)), []);
  const misfit: MomentDef = { ...MOMENT, echoes: [{ monster: 'unfinished_taker', x: 1, z: 0, facingDegrees: 0, pose: { clip: 'idle', at: 0.5 }, turns: true, look: { rig: 'human_man', scale: 0.6, gear: ['nothing'], wear: ['linen_shirt', 'dirty_shirt'] } }] };
  assert.equal(momentProblems(withMoment(misfit)).length, 3);
});

void test('a zone field naming an unknown moment or an area outside the zone is reported', (): void => {
  const base: ZoneDef | undefined = shipped.zones.get(shipped.world.start);
  assert.ok(base !== undefined);
  const zone: ZoneDef = { ...base, id: 'test_field', moments: { combat: true, areas: [{ x: -50, z: 4, radius: 4 }], clearance: { hero: 1, exits: 1, between: 1 }, interval: { min: 1, max: 2 }, start: 0, max: 1, table: [{ moment: 'ghost', weight: 1 }], sure: [] } };
  assert.equal(momentProblems(withMoment(MOMENT, zone)).length, 2);
});

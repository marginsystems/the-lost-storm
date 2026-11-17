import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ZoneDef } from './content/types.ts';
import type { Threat, ThreatZone } from './threat.ts';
import { currentZone, partOf, routeAhead, shareOf, THREAT, threatAt, threatNear, zoneDamageMix } from './threat.ts';

const content: Content = loadContent();
const caves: ZoneDef = zoneOf(content, 'under_hall_2');

function ids(threat: Threat): string[] {
  return threat.zones.map((zone: ThreatZone): string => zone.id);
}

void test('a zone mixes the damage its monsters deal by kind, from their own skills and a boss from its phases', (): void => {
  const storm: ZoneDef = { ...caves, ranks: false, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'stormcaller_rival', count: 3, mods: [] }] }] };
  const rival = zoneDamageMix(content, storm);
  assert.ok(must(content.monsters.get('stormcaller_rival'), 'rival').boss !== null);
  assert.ok(rival.storm > 0.2 && rival.physical > 0.2, 'a boss deals what its phases cast');
  const frost: ZoneDef = { ...caves, ranks: false, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'still_standing', count: 2, mods: [] }] }] };
  assert.equal(zoneDamageMix(content, frost).frost, 1);
  assert.deepEqual(zoneDamageMix(content, { ...caves, packs: [] }), { physical: 1, storm: 0, frost: 0 });
});

void test('ranked packs bring storm and frost into a physical cave, and a volatile mod brings storm through its death burst', (): void => {
  const mix = zoneDamageMix(content, caves);
  assert.ok(mix.storm > 0 && mix.storm < 0.5);
  assert.ok(mix.frost > 0 && mix.frost < 0.5);
  const plain: ZoneDef = { ...caves, ranks: false };
  assert.equal(zoneDamageMix(content, plain).storm, 0);
  const volatile: ZoneDef = { ...plain, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'wolf', count: 1, mods: ['volatile'] }] }] };
  assert.ok(zoneDamageMix(content, volatile).storm > 0);
});

void test('standing somewhere safe the current zone is the deepest fighting zone visited', (): void => {
  const hideout: ZoneDef = zoneOf(content, 'hideout');
  assert.equal(currentZone(content, ['hall_of_time', 'under_hall', 'under_hall_2'], hideout)?.id, 'under_hall_2');
  assert.equal(currentZone(content, ['under_hall', 'under_hall_2', 'under_hall_3'], caves)?.id, 'under_hall_2');
  assert.equal(currentZone(content, [], hideout), null);
  assert.deepEqual(ids(threatAt(content, null, 14)), ['']);
});

void test('the route ahead follows the act roads to the boss, nearer zones counting more, the current zone half', (): void => {
  const route = routeAhead(content, caves);
  assert.deepEqual(route.map((entry) => entry.zone.id), ['under_hall_3', 'lava_depths', 'lava_depths_2', 'lava_depths_3', 'ledger_hall', 'ledger_hall_2', 'ledger_hall_3', 'ledger_court']);
  const threat: Threat = threatNear(content, ['hall_of_time', 'under_hall', 'under_hall_2'], zoneOf(content, 'hideout'), 15);
  const here: ThreatZone = must(threat.zones[0], 'here');
  assert.equal(here.id, 'under_hall_2');
  assert.equal(here.weight, THREAT.hereShare);
  const ahead: readonly ThreatZone[] = threat.zones.filter((zone: ThreatZone): boolean => zone.ahead);
  const weights: number[] = ahead.map((zone: ThreatZone): number => zone.weight);
  assert.ok(weights.every((weight: number, index: number): boolean => index === 0 || weight < (weights.at(index - 1) ?? 0)));
  const total: number = threat.zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const court: ThreatZone | undefined = threat.zones.find((zone: ThreatZone): boolean => zone.id === 'ledger_court');
  assert.ok(court !== undefined && court.mix.storm > 0.3 && court.mix.frost > 0.05);
});

void test('a character in the last hall weighs only that hall and the boss beyond it', (): void => {
  const threat: Threat = threatAt(content, zoneOf(content, 'ledger_hall_3'), 29);
  assert.deepEqual(ids(threat), ['ledger_hall_3', 'ledger_court']);
  assert.equal(threat.zones[1]?.weight, 1 - THREAT.hereShare);
  assert.deepEqual(ids(threatAt(content, zoneOf(content, 'ledger_court'), 30)), ['ledger_court']);
  assert.equal(threatAt(content, zoneOf(content, 'ledger_court'), 30).zones[0]?.weight, 1);
});

void test('a zone far below the character counts for nothing', (): void => {
  const threat: Threat = threatAt(content, caves, caves.levelUpTo + THREAT.staleLevels + 1);
  assert.ok(!ids(threat).includes('under_hall_2'));
  assert.equal(partOf(threat, false), null);
  const total: number = threat.zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

void test('a threat splits into here and ahead, each weighed to one, and with nothing to fight every hit is physical', (): void => {
  const threat: Threat = threatNear(content, ['under_hall_2'], zoneOf(content, 'hideout'), 15);
  assert.equal(partOf(threat, false)?.zones.length, 1);
  assert.ok(Math.abs((partOf(threat, true)?.zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight, 0) ?? 0) - 1) < 1e-9);
  assert.ok(shareOf(threat, 'physical') > 0.9);
  assert.equal(shareOf(threatAt(content, null, 1), 'physical'), 1);
});

void test('a stormlit or rimebound monster deals its element share of what it hits as that element', (): void => {
  const plain: ZoneDef = { ...caves, ranks: false };
  for (const [mod, type] of [['stormlit', 'storm'], ['rimebound', 'frost']] as const) {
    const share: number = must(must(content.monsterMods.get(mod), mod).element, `${mod} element`).share;
    const charged: ZoneDef = { ...plain, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'wolf', count: 1, mods: [mod] }] }] };
    assert.ok(Math.abs(zoneDamageMix(content, charged)[type] - share) < 1e-9);
  }
});

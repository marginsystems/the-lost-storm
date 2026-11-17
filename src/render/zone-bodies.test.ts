import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, MonsterDef, ZoneDef, ZonePack } from '../../sim/content/types.ts';
import type { MonsterModDef } from '../../sim/content/combat-types.ts';
import { modsNamed, withMods } from '../../sim/world/elites.ts';
import type { ZoneBody } from './zone-bodies.ts';
import { monsterKey, ZONE_BODIES, zoneBodies } from './zone-bodies.ts';

const content: Content = loadContent();

function monster(id: string): MonsterDef {
  return must(content.monsters.get(id), id);
}

function spares(bodies: ReadonlyMap<string, ZoneBody>, def: MonsterDef): number {
  return bodies.get(monsterKey(def))?.spares ?? 0;
}

function zoneOf(packs: readonly ZonePack[]): ZoneDef {
  return { ...must(content.zones.get('lava_depths'), 'lava_depths'), packs, surge: null };
}

function pack(members: ZonePack['members'], waits: boolean): ZonePack {
  return waits ? { x: 0, z: 0, members, when: [], waits: { near: 10 } } : { x: 0, z: 0, members, when: [] };
}

void test('every pack member in a zone has a body ready before the fight, and a pack that is already standing needs only one of each', (): void => {
  const zone: ZoneDef = must(content.zones.get('lava_depths'), 'lava_depths');
  const bodies: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zone);
  for (const each of zone.packs) for (const member of each.members) assert.ok(spares(bodies, monster(member.monster)) >= 1, member.monster);
  const standing: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zoneOf([pack([{ monster: 'cinder_hound', count: 12, mods: [] }], false)]));
  assert.equal(spares(standing, monster('cinder_hound')), 1);
});

void test('a pack that wakes in the middle of a fight finds a ready body for every one of its members of a kind, up to the cap', (): void => {
  const woken: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zoneOf([pack([{ monster: 'cinder_mite', count: 5, mods: [] }, { monster: 'cinder_mite', count: 4, mods: [] }], true), pack([{ monster: 'cinder_mite', count: 3, mods: [] }], true)]));
  assert.equal(spares(woken, monster('cinder_mite')), 9);
  const crowd: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zoneOf([pack([{ monster: 'cinder_mite', count: 40, mods: [] }], true)]));
  assert.equal(spares(crowd, monster('cinder_mite')), ZONE_BODIES.sparesCap);
});

void test('a surge adds its extra monsters to the first member of a waking pack', (): void => {
  const zone: ZoneDef = { ...zoneOf([pack([{ monster: 'cinder_mite', count: 3, mods: [] }, { monster: 'slagback', count: 2, mods: [] }], true)]), surge: { delay: 1, surgesPerExtraMonster: 1, maxExtraMonsters: 2 } };
  const bodies: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zone);
  assert.equal(spares(bodies, monster('cinder_mite')), 5);
  assert.equal(spares(bodies, monster('slagback')), 2);
});

void test('a monster that is only ever summoned has bodies ready for as many as one summoner can call', (): void => {
  const elder: MonsterDef = monster('slagback_elder');
  const summon = must(elder.summon, 'elder summon');
  const minion: MonsterDef = monster(summon.monster ?? elder.id);
  const bodies: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zoneOf([pack([{ monster: elder.id, count: 1, mods: [] }], false)]));
  assert.equal(spares(bodies, minion), Math.min(ZONE_BODIES.sparesCap, summon.limit));
});

void test('an elite pack member of another size gets a body of its own as well as the plain one', (): void => {
  const mods: readonly string[] = [must([...content.monsterMods.values()].find((mod: MonsterModDef): boolean => mod.sizeScale !== 1), 'a modifier that changes size').id];
  const elite: MonsterDef = withMods(monster('slagback'), modsNamed(content.monsterMods, mods));
  const bodies: ReadonlyMap<string, ZoneBody> = zoneBodies(content, zoneOf([pack([{ monster: 'slagback', count: 2, mods }], true)]));
  assert.notEqual(monsterKey(elite), monsterKey(monster('slagback')));
  assert.equal(spares(bodies, elite), 2);
  assert.equal(spares(bodies, monster('slagback')), 1);
});

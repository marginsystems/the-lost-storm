import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ItemStat, StatMod } from './content/types.ts';
import { ITEM_STATS } from './content/types.ts';
import { emptyEquipment } from './items.ts';
import { buildOf, compareBuilds, itemVerdict, OUTSIDE_VERDICT, verdictNote, verdictParts, VERDICT } from './item-verdict.ts';
import type { Build, Verdict, VerdictSubject } from './item-verdict.ts';
import { computeStats } from './stats.ts';
import type { Threat, ThreatZone } from './threat.ts';
import { mixThreat, threatNear } from './threat.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const physical: Threat = mixThreat({ physical: 1, storm: 0, frost: 0 });
const storm: Threat = mixThreat({ physical: 0, storm: 1, frost: 0 });
const even: Threat = mixThreat({ physical: 1 / 3, storm: 1 / 3, frost: 1 / 3 });

function zone(id: string, weight: number, ahead: boolean, mix: ThreatZone['mix']): ThreatZone {
  return { id, name: id, stormTier: 0, weight, ahead, mix };
}

function item(base: string, rarity: string, affixes: ItemInstance['affixes'], level: number = 9): ItemInstance {
  return { uid: 1, base, rarity, level, affixes, ledger: null };
}

function blade(level: number, charm: ItemInstance | null): VerdictSubject {
  return {
    level,
    equipped: { ...emptyEquipment(), weapon: item('stormsteel_sword', 'rare', [{ affix: 'honed', value: 0.08 }]), chest: item('saltworn_shirt', 'common', []), charm },
    allocated: [],
    bar: ['cleave', null, null, null, null, 'dodge_roll'],
    changes: {},
  };
}

const quickToken: ItemInstance = item('gilded_token', 'magic', [{ affix: 'quick', value: 0.06 }, { affix: 'hale', value: 20 }], 7);
const groundedToken: ItemInstance = item('gilded_token', 'rare', [{ affix: 'grounded', value: 0.13 }, { affix: 'hearthwarm', value: 0.1 }, { affix: 'clear', value: 1.1 }]);

function verdictOf(subject: VerdictSubject, threat: Threat, candidate: ItemInstance): Verdict {
  return must(itemVerdict(content, subject, threat, candidate), 'verdict');
}

function withStats(build: Build, mods: readonly StatMod[], subject: VerdictSubject): Build {
  return { ...build, stats: computeStats(content, subject.level, subject.equipped, subject.allocated, mods) };
}

void test('the owner case: looking ahead through the Act I route the rare token is still worse, level only at the Inner Hall', (): void => {
  const hideout = zoneOf(content, 'hideout');
  for (const level of [14, 15, 16, 17]) {
    const threat: Threat = threatNear(content, ['hall_of_time', 'under_hall', 'under_hall_2'], hideout, level);
    assert.equal(threat.zones.length, 9);
    const verdict: Verdict = verdictOf(blade(level, quickToken), threat, groundedToken);
    assert.equal(verdict.kind, 'worse');
    assert.ok(verdict.damage < -VERDICT.clear, `damage at ${level}`);
    assert.ok(verdict.here < -VERDICT.clear && (verdict.ahead ?? 0) < -VERDICT.clear, `toughness at ${level}`);
    assert.ok((verdict.ahead ?? 0) > verdict.here);
    assert.deepEqual(verdict.absent, []);
    assert.match(verdictNote(verdict) ?? '', /^Storm and frost hit hardest in the Inner Hall: \+\d+% toughness there$/);
  }
  const threat: Threat = threatNear(content, ['under_hall_2'], hideout, 14);
  assert.deepEqual(verdictParts(verdictOf(blade(14, quickToken), threat, groundedToken)), ['−4% toughness', '−4% damage']);
  const court: Threat = mixThreat(must(threat.zones.find((entry: ThreatZone): boolean => entry.id === 'ledger_court'), 'court').mix);
  const atBoss: Verdict = verdictOf(blade(14, quickToken), court, groundedToken);
  assert.ok(atBoss.toughness > VERDICT.clear);
  assert.ok(Math.abs(atBoss.power) < VERDICT.even);
});

void test('toughness down against what is near and up against what is ahead is a trade that names both', (): void => {
  const threat: Threat = { zones: [zone('cave', 0.5, false, { physical: 1, storm: 0, frost: 0 }), zone('hall', 0.5, true, { physical: 0.2, storm: 0.8, frost: 0 })] };
  const subject: VerdictSubject = blade(14, null);
  const before: Build = buildOf(content, subject, subject.equipped);
  const life: number = before.stats.maxLife;
  const verdict: Verdict = compareBuilds(content, before, withStats(before, [{ stat: 'maxLife', op: 'add', value: -life * 0.05 }, { stat: 'stormResist', op: 'add', value: 0.3 }], subject), threat);
  assert.equal(verdict.kind, 'trade');
  assert.ok(verdict.here < 0 && (verdict.ahead ?? 0) > 0);
  assert.deepEqual(verdictParts(verdict), [`toughness +${Math.round((verdict.ahead ?? 0) * 100)}% ahead, −${Math.round(-verdict.here * 100)}% here`]);
  assert.equal(verdictNote(verdict), `Storm hits hardest in the hall: +${Math.round((verdict.ahead ?? 0) * 100)}% toughness there`);
  const lost: Verdict = compareBuilds(content, before, withStats(before, [{ stat: 'maxLife', op: 'add', value: -life * 0.3 }, { stat: 'stormResist', op: 'add', value: 0.05 }], subject), threat);
  assert.equal(lost.kind, 'worse');
});

void test('a resistance to an element nothing here or ahead deals is worth nothing and the note says so', (): void => {
  const threat: Threat = { zones: [zone('cave', 0.5, false, { physical: 1, storm: 0, frost: 0 }), zone('hall', 0.5, true, { physical: 0.5, storm: 0.5, frost: 0 })] };
  const plain: ItemInstance = item('gilded_token', 'common', []);
  const verdict: Verdict = verdictOf(blade(14, plain), threat, item('gilded_token', 'magic', [{ affix: 'hearthwarm', value: 0.1 }]));
  assert.deepEqual(verdict.absent, ['frost']);
  assert.equal(verdict.toughness, 0);
  assert.equal(verdict.kind, 'same');
  assert.equal(verdictNote(verdict), 'No frost here or ahead');
});

void test('storm resistance counts fully up to the cap and nothing past it', (): void => {
  const subject: VerdictSubject = blade(14, null);
  const before: Build = buildOf(content, subject, subject.equipped);
  const cap: number = content.player.resistance.cap;
  const near: Verdict = compareBuilds(content, withStats(before, [{ stat: 'stormResist', op: 'add', value: cap - 0.05 }], subject), withStats(before, [{ stat: 'stormResist', op: 'add', value: cap + 0.1 }], subject), storm);
  assert.ok(Math.abs(near.toughness - (1 - (cap - 0.05)) / (1 - cap) + 1) < 1e-9);
  assert.equal(near.kind, 'better');
  assert.deepEqual(near.against, ['storm']);
  assert.equal(verdictParts(near)[0], `+${Math.round(near.toughness * 100)}% toughness against storm`);
  const past: Verdict = compareBuilds(content, withStats(before, [{ stat: 'stormResist', op: 'add', value: cap }], subject), withStats(before, [{ stat: 'stormResist', op: 'add', value: cap + 0.2 }], subject), storm);
  assert.equal(past.toughness, 0);
  assert.equal(past.kind, 'same');
  assert.deepEqual(past.capped, ['storm']);
  assert.equal(verdictNote(past), 'Storm resistance already capped');
});

void test('resistance to an element nobody nearby deals is worth nothing and the note says so', (): void => {
  const verdict: Verdict = verdictOf(blade(14, null), physical, item('tidestone_charm', 'magic', [{ affix: 'hearthwarm', value: 0.1 }]));
  assert.deepEqual(verdict.absent, ['frost']);
  assert.equal(verdict.damage, 0);
  assert.equal(verdictNote(verdict), 'No frost nearby');
  const frostless: Verdict = verdictOf(blade(14, null), physical, item('gilded_token', 'magic', [{ affix: 'hearthwarm', value: 0.1 }]));
  assert.ok(frostless.toughness > 0);
  assert.ok(verdictParts(frostless).every((part: string): boolean => !part.includes('frost')));
});

void test('mana regeneration is worth nothing to a build that never runs dry and damage to one that does', (): void => {
  const plain: ItemInstance = item('gilded_token', 'common', []);
  const clear: ItemInstance = item('gilded_token', 'magic', [{ affix: 'clear', value: 1 }]);
  const steady: Verdict = verdictOf(blade(14, plain), physical, clear);
  assert.equal(steady.damage, 0);
  assert.equal(steady.kind, 'same');
  const caster: VerdictSubject = { ...blade(14, plain), bar: ['storm_bolt', null, null, null, null, 'dodge_roll'] };
  const thirsty: Verdict = verdictOf(caster, physical, clear);
  assert.ok(thirsty.damage > 0);
  const mixed: VerdictSubject = { ...caster, bar: ['cleave', 'storm_bolt', null, null, null, 'dodge_roll'] };
  assert.ok(verdictOf(mixed, physical, clear).damage <= thirsty.damage);
});

void test('a pure damage upgrade and a pure life upgrade are better and name only their side', (): void => {
  const subject: VerdictSubject = blade(14, null);
  const sharper: Verdict = verdictOf(subject, physical, item('stormsteel_sword', 'rare', [{ affix: 'honed', value: 0.2 }]));
  assert.equal(sharper.kind, 'better');
  assert.equal(sharper.toughness, 0);
  assert.deepEqual(verdictParts(sharper), [`+${Math.round(sharper.damage * 100)}% damage`]);
  const hale: Verdict = verdictOf(subject, physical, item('saltworn_shirt', 'magic', [{ affix: 'hale', value: 40 }]));
  assert.equal(hale.kind, 'better');
  assert.equal(hale.damage, 0);
  assert.deepEqual(verdictParts(hale), [`+${Math.round(hale.toughness * 100)}% toughness`]);
});

void test('an item for an empty slot is judged against wearing nothing there, and an unknown base has no verdict', (): void => {
  const verdict: Verdict = verdictOf(blade(14, null), physical, quickToken);
  assert.equal(verdict.kind, 'better');
  assert.ok(verdict.damage > 0 && verdict.toughness > 0);
  assert.equal(itemVerdict(content, blade(14, null), physical, item('ghost', 'common', [])), null);
});

void test('one side clearly up and the other clearly down with power about level is a trade, the gain named first', (): void => {
  const subject: VerdictSubject = blade(14, null);
  const before: Build = buildOf(content, subject, subject.equipped);
  const life: number = before.stats.maxLife;
  const trade: Verdict = compareBuilds(content, before, withStats(before, [{ stat: 'maxLife', op: 'add', value: life * 0.08 }, { stat: 'damagePercent', op: 'add', value: -0.06 }], subject), physical);
  assert.equal(trade.kind, 'trade');
  assert.ok(trade.toughness > 0 && trade.damage < 0);
  assert.match(verdictParts(trade)[0] ?? '', /toughness$/);
  const lopsided: Verdict = compareBuilds(content, before, withStats(before, [{ stat: 'maxLife', op: 'add', value: life * 0.03 }, { stat: 'damagePercent', op: 'add', value: -0.3 }], subject), physical);
  assert.equal(lopsided.kind, 'worse');
});

void test('every stat an item can roll moves damage, toughness or movement speed for some build, unless it is named as outside the verdict', (): void => {
  const subjects: VerdictSubject[] = [blade(10, null), { ...blade(10, null), bar: ['storm_bolt', null, null, null, null, 'dodge_roll'] }];
  const sizes: Map<ItemStat, number> = new Map<ItemStat, number>();
  for (const affix of content.affixes.values()) if (affix.op === 'add') sizes.set(affix.stat, Math.max(sizes.get(affix.stat) ?? 0, affix.max));
  for (const stat of ITEM_STATS) {
    if (OUTSIDE_VERDICT.includes(stat)) continue;
    const size: number = sizes.get(stat) ?? 1;
    const moved: boolean = subjects.some((subject: VerdictSubject): boolean => {
      const before: Build = buildOf(content, subject, subject.equipped);
      const verdict: Verdict = compareBuilds(content, before, withStats(before, [{ stat, op: 'add', value: size }], subject), even);
      return Math.abs(verdict.power) > VERDICT.absent || Math.abs(verdict.move) > VERDICT.absent;
    });
    assert.ok(moved, `${stat} changes neither damage, toughness nor movement speed`);
  }
});

void test('an unidentified item cannot be judged; once identified it can', (): void => {
  const hidden: ItemInstance = { ...groundedToken, unidentified: true };
  assert.equal(itemVerdict(content, blade(9, null), physical, hidden), null);
  assert.notEqual(itemVerdict(content, blade(9, null), physical, groundedToken), null);
});

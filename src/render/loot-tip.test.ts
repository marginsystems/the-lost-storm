import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LootTip, TipCheck } from './loot-tip.ts';
import { createLootTip } from './loot-tip.ts';

const HELD: TipCheck = { present: true, leaving: false, sameZone: true, underPointer: true };

interface Probe {
  readonly tip: LootTip;
  readonly shown: () => boolean;
}

function probe(): Probe {
  let visible: boolean = false;
  const tip: LootTip = createLootTip((): void => {
    visible = false;
  });
  return {
    tip,
    shown: (): boolean => {
      if (tip.owner() === null) return false;
      return visible;
    },
  };
}

function hover(subject: Probe, id: number, leaving: boolean): boolean {
  let visible: boolean = false;
  subject.tip.enter(id, leaving, (): void => {
    visible = true;
  });
  return visible;
}

void test('picking up a hovered item takes its tooltip away on the next frame, with no pointer leave', (): void => {
  const subject: Probe = probe();
  assert.equal(hover(subject, 7, false), true);
  subject.tip.check((): TipCheck => HELD);
  assert.equal(subject.tip.owner(), 7);
  subject.tip.check((): TipCheck => ({ ...HELD, present: false }));
  assert.equal(subject.tip.owner(), null);
  assert.equal(subject.shown(), false);
});

void test('a zone change takes the tooltip away', (): void => {
  const subject: Probe = probe();
  hover(subject, 3, false);
  subject.tip.check((): TipCheck => ({ ...HELD, sameZone: false }));
  assert.equal(subject.tip.owner(), null);
});

void test('a label that is leaving never opens a tooltip, and one that starts leaving closes it', (): void => {
  const subject: Probe = probe();
  assert.equal(hover(subject, 4, true), false);
  assert.equal(subject.tip.owner(), null);
  hover(subject, 5, false);
  subject.tip.check((): TipCheck => ({ ...HELD, leaving: true }));
  assert.equal(subject.tip.owner(), null);
});

void test('the hero walking away or a panel covering the tag takes the tooltip away', (): void => {
  const subject: Probe = probe();
  hover(subject, 9, false);
  subject.tip.check((): TipCheck => ({ ...HELD, underPointer: false }));
  assert.equal(subject.tip.owner(), null);
});

void test('leaving another label does not close the tooltip of the one under the pointer', (): void => {
  const subject: Probe = probe();
  hover(subject, 1, false);
  subject.tip.leave(2);
  assert.equal(subject.tip.owner(), 1);
  subject.tip.leave(1);
  assert.equal(subject.tip.owner(), null);
});

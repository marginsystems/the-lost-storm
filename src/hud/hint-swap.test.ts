import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Timers } from '../backend/backend.ts';
import { createHintSwap, HINT_SWAP } from './hint-swap.ts';
import type { HintFace, HintSwap } from './hint-swap.ts';

interface Pending {
  readonly at: number;
  readonly task: () => void;
  cancelled: boolean;
}

interface Clock extends Timers {
  advance(ms: number): void;
}

function fakeClock(): Clock {
  let now: number = 0;
  const pending: Pending[] = [];
  return {
    after(ms: number, task: () => void): () => void {
      const entry: Pending = { at: now + ms, task, cancelled: false };
      pending.push(entry);
      return (): void => {
        entry.cancelled = true;
      };
    },
    advance(ms: number): void {
      now += ms;
      for (const entry of pending.filter((item: Pending): boolean => !item.cancelled && item.at <= now)) {
        entry.cancelled = true;
        entry.task();
      }
    },
  };
}

interface Face extends HintFace<string> {
  readonly frames: string[];
  text: string;
  shown: boolean;
}

function face(): Face {
  const made: Face = {
    frames: [],
    text: '',
    shown: false,
    fill(hint: string): void {
      made.text = hint;
      made.frames.push(`${made.shown ? 'shown' : 'hidden'}:${hint}`);
    },
    show(shown: boolean): void {
      made.shown = shown;
    },
    showing(): boolean {
      return made.shown;
    },
  };
  return made;
}

void test('a hint over an empty plate fills and shows at once', (): void => {
  const plate: Face = face();
  const swap: HintSwap<string> = createHintSwap(plate, fakeClock());
  swap.show('Click a monster to attack');
  assert.equal(plate.text, 'Click a monster to attack');
  assert.equal(plate.shown, true);
  assert.equal(swap.busy(), false);
});

void test('a new hint never replaces the words on a visible plate: the plate eases out, then the new words ease in', (): void => {
  const plate: Face = face();
  const clock: Clock = fakeClock();
  const swap: HintSwap<string> = createHintSwap(plate, clock);
  swap.show('Click a monster to attack');
  swap.show('Leave a moment and it is gone');
  assert.equal(plate.shown, false);
  assert.equal(plate.text, 'Click a monster to attack');
  assert.equal(swap.busy(), true);
  clock.advance(HINT_SWAP.outMs - 1);
  assert.equal(plate.text, 'Click a monster to attack');
  clock.advance(1);
  assert.equal(plate.text, 'Leave a moment and it is gone');
  assert.equal(plate.shown, true);
  assert.equal(swap.busy(), false);
  assert.ok(plate.frames.every((frame: string): boolean => frame.startsWith('hidden:')));
});

void test('only the latest of several quick hints is shown, and a hide during the swap cancels it', (): void => {
  const plate: Face = face();
  const clock: Clock = fakeClock();
  const swap: HintSwap<string> = createHintSwap(plate, clock);
  swap.show('one');
  swap.show('two');
  swap.show('three');
  clock.advance(HINT_SWAP.outMs);
  assert.equal(plate.text, 'three');
  swap.show('four');
  swap.hide();
  clock.advance(HINT_SWAP.outMs);
  assert.equal(plate.text, 'three');
  assert.equal(plate.shown, false);
});

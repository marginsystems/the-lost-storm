import type { TailwindDef } from '../../sim/content/tailwind-types.ts';
import type { TailwindState } from '../../sim/world/tailwind-types.ts';
import { el, replay, setClass, setData, setText, setVar } from './dom.ts';
import type { TailwindMeterState, TailwindReading } from './tailwind-reading.ts';
import { createTailwindMeter, readTailwind, spendTailwind, TAILWIND_METER } from './tailwind-reading.ts';

export interface TailwindMeter {
  update(live: TailwindState, def: TailwindDef, dt: number): void;
  spent(best: number, points: number, xp: number, gold: number): void;
}

export function createTailwindView(parent: HTMLElement): TailwindMeter {
  const root: HTMLDivElement = el('div', 'hud-tailwind', null);
  parent.prepend(root);
  const head: HTMLDivElement = el('div', 'tw-head', root);
  const count: HTMLSpanElement = el('span', 'tw-count', head);
  const name: HTMLSpanElement = el('span', 'tw-name', head);
  const fuse: HTMLDivElement = el('div', 'tw-fuse', root);
  el('div', 'tw-fill', fuse);
  const windfall: HTMLDivElement = el('div', 'tw-windfall', root);
  const state: TailwindMeterState = createTailwindMeter();
  return {
    update(live: TailwindState, def: TailwindDef, dt: number): void {
      const reading: TailwindReading = readTailwind(state, live, def, Math.min(TAILWIND_METER.longestFrame, dt));
      setClass(root, 'shown', reading.shown > TAILWIND_METER.hidden);
      setData(root, 'phase', reading.phase);
      setData(root, 'tier', String(reading.tier));
      setVar(root, '--tw-show', reading.shown.toFixed(3));
      setVar(root, '--tw-fuse', reading.fuse.toFixed(4));
      setVar(root, '--tw-over', reading.over.toFixed(3));
      setVar(root, '--tw-heat', reading.heat.toFixed(3));
      if (reading.count !== '') setText(count, reading.count, true);
      if (reading.name !== '') setText(name, reading.name, false);
      if (reading.rose) replay(name, 'tw-rise');
      if (reading.windfall !== '') setText(windfall, reading.windfall, false);
      setClass(windfall, 'shown', reading.windfall !== '' && reading.phase === 'ended');
    },
    spent(best: number, points: number, xp: number, gold: number): void {
      spendTailwind(state, best, points, xp, gold);
    },
  };
}

import type { Content, ModOp, StatId, StatMod } from './content/types.ts';
import { itemMods } from './items.ts';
import { describeMod, roundStat } from './stat-text.ts';
import type { ItemInstance } from './world/types.ts';

export interface StatDifference {
  readonly stat: StatId;
  readonly op: ModOp;
  readonly delta: number;
  readonly better: boolean;
  readonly text: string;
}

interface Total {
  readonly stat: StatId;
  readonly op: ModOp;
  value: number;
}

function totals(content: Content, item: ItemInstance | null): Map<string, Total> {
  const sums: Map<string, Total> = new Map<string, Total>();
  if (item === null) return sums;
  for (const mod of itemMods(content, item)) {
    const key: string = `${mod.stat}:${mod.op}`;
    const sum: Total | undefined = sums.get(key);
    if (sum === undefined) sums.set(key, { stat: mod.stat, op: mod.op, value: mod.value });
    else sum.value += mod.value;
  }
  return sums;
}

export function compareItems(content: Content, item: ItemInstance, equipped: ItemInstance | null): StatDifference[] {
  const mine: Map<string, Total> = totals(content, item);
  const theirs: Map<string, Total> = totals(content, equipped);
  const keys: string[] = [...mine.keys(), ...[...theirs.keys()].filter((key: string): boolean => !mine.has(key))];
  const differences: StatDifference[] = [];
  for (const key of keys) {
    const own: Total | undefined = mine.get(key);
    const other: Total | undefined = theirs.get(key);
    const source: Total | undefined = own ?? other;
    if (source === undefined) continue;
    const delta: number = roundStat(source.stat, source.op, (own?.value ?? 0) - (other?.value ?? 0));
    if (delta === 0) continue;
    const mod: StatMod = { stat: source.stat, op: source.op, value: delta };
    differences.push({ stat: source.stat, op: source.op, delta, better: delta > 0, text: describeMod(mod) });
  }
  return differences;
}

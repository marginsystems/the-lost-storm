import type { RunCondition } from '../content/run-table-types.ts';
import type { Content } from '../content/types.ts';
import { isFields } from '../content/read.ts';
import { clashIn } from './run-state.ts';
import type { RunPin, RunSetup, RunState } from './run-types.ts';

function readPin(content: Content, value: unknown): RunPin | null {
  if (!isFields(value)) return null;
  const id: unknown = value['condition'];
  const pick: unknown = value['pick'];
  const known: RunCondition | undefined = content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === id);
  if (known === undefined) return null;
  if (known.pick === 'monster') return typeof pick === 'string' && content.monsters.has(pick) ? { condition: known.id, pick } : null;
  return { condition: known.id, pick: null };
}

function readSetup(content: Content, value: unknown): RunSetup | null {
  if (!isFields(value)) return null;
  const zone: unknown = value['zone'];
  const pins: unknown = value['pins'];
  if (typeof zone !== 'string' || !content.runTable.levels.includes(zone) || !Array.isArray(pins)) return null;
  const list: readonly unknown[] = pins;
  const read: RunPin[] = [];
  for (const entry of list) {
    const pin: RunPin | null = readPin(content, entry);
    if (pin !== null && read.length < content.runTable.pins && !read.some((held: RunPin): boolean => held.condition === pin.condition) && clashIn(content, read, pin.condition) === null) read.push(pin);
  }
  return { zone, pins: read };
}

export function readRun(content: Content, value: unknown): RunState {
  if (!isFields(value)) return { active: null, last: null };
  return { active: readSetup(content, value['active']), last: readSetup(content, value['last']) };
}

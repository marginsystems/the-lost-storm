import countData from '../../data/journal-count.json' with { type: 'json' };
import { isFields } from '../../sim/content/read.ts';

export interface CountLines {
  readonly none: string;
  readonly one: string;
  readonly many: string;
}

const OTHERS_SLOT: string = '{others}';

function line(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function readCountLines(value: unknown): CountLines | null {
  if (!isFields(value)) return null;
  const none: string | null = line(value['none']);
  const one: string | null = line(value['one']);
  const many: string | null = line(value['many']);
  return none === null || one === null || many === null || !many.includes(OTHERS_SLOT) ? null : { none, one, many };
}

export function loadCountLines(): CountLines {
  const lines: CountLines | null = readCountLines(countData);
  if (lines === null) throw new Error('data/journal-count.json is not a set of count lines');
  return lines;
}

export function countLine(lines: CountLines, others: number): string {
  if (others <= 0) return lines.none;
  if (others === 1) return lines.one;
  return lines.many.replace(OTHERS_SLOT, String(others));
}

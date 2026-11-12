import marksData from '../../data/marks.json' with { type: 'json' };
import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';

export interface MarkWord {
  readonly id: string;
  readonly text: string;
}

export interface MarkList {
  readonly id: string;
  readonly words: readonly MarkWord[];
}

export interface CountCopy {
  readonly none: string;
  readonly one: string;
  readonly many: string;
}

export interface MarkCopy {
  readonly open: string;
  readonly leave: string;
  readonly close: string;
  readonly left: string;
  readonly count: CountCopy;
}

export interface MarkVocabulary {
  readonly lists: readonly MarkList[];
  readonly copy: MarkCopy;
}

const WORD_ID: RegExp = /^[a-z][a-z_]{0,31}$/;
const COUNT_SLOT: string = '{count}';

function text(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readWord(value: unknown): MarkWord | null {
  if (!isFields(value)) return null;
  const id: string | null = text(value, 'id');
  const shown: string | null = text(value, 'text');
  return id === null || shown === null || !WORD_ID.test(id) ? null : { id, text: shown };
}

function readList(value: unknown): MarkList | null {
  if (!isFields(value) || !Array.isArray(value['words'])) return null;
  const id: string | null = text(value, 'id');
  const raw: readonly unknown[] = value['words'];
  const words: (MarkWord | null)[] = raw.map(readWord);
  if (id === null || words.length === 0 || words.some((word: MarkWord | null): boolean => word === null)) return null;
  return { id, words: words.filter((word: MarkWord | null): word is MarkWord => word !== null) };
}

function readCopy(value: unknown): MarkCopy | null {
  if (!isFields(value) || !isFields(value['count'])) return null;
  const count: Fields = value['count'];
  const none: string | null = text(count, 'none');
  const one: string | null = text(count, 'one');
  const many: string | null = text(count, 'many');
  const open: string | null = text(value, 'open');
  const leave: string | null = text(value, 'leave');
  const close: string | null = text(value, 'close');
  const left: string | null = text(value, 'left');
  if (none === null || one === null || many === null || !many.includes(COUNT_SLOT) || open === null || leave === null || close === null || left === null) return null;
  return { open, leave, close, left, count: { none, one, many } };
}

export function readMarkVocabulary(value: unknown): MarkVocabulary | null {
  if (!isFields(value) || !Array.isArray(value['lists'])) return null;
  const raw: readonly unknown[] = value['lists'];
  const lists: (MarkList | null)[] = raw.map(readList);
  const copy: MarkCopy | null = readCopy(value['copy']);
  if (copy === null || lists.length === 0 || lists.some((list: MarkList | null): boolean => list === null)) return null;
  return { lists: lists.filter((list: MarkList | null): list is MarkList => list !== null), copy };
}

export function loadMarkVocabulary(): MarkVocabulary {
  const vocabulary: MarkVocabulary | null = readMarkVocabulary(marksData);
  if (vocabulary === null) throw new Error('data/marks.json is not a mark vocabulary');
  return vocabulary;
}

export function wordText(vocabulary: MarkVocabulary, id: string): string | null {
  for (const list of vocabulary.lists) for (const word of list.words) if (word.id === id) return word.text;
  return null;
}

export function markText(vocabulary: MarkVocabulary, words: readonly string[]): string | null {
  const shown: (string | null)[] = words.map((id: string): string | null => wordText(vocabulary, id));
  if (shown.length === 0 || shown.some((part: string | null): boolean => part === null)) return null;
  return shown.join(' ');
}

export function countLine(copy: CountCopy, others: number): string {
  if (others <= 0) return copy.none;
  if (others === 1) return copy.one;
  return copy.many.replace(COUNT_SLOT, String(others));
}

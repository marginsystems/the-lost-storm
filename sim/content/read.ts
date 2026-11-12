export type Fields = Readonly<Record<string, unknown>>;

export class ContentError extends Error {
  constructor(where: string, problem: string) {
    super(`${where}: ${problem}`);
    this.name = 'ContentError';
  }
}

export function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fields(value: unknown, where: string): Fields {
  if (!isFields(value)) throw new ContentError(where, 'expected an object');
  return value;
}

export function items(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ContentError(where, 'expected an array');
  const list: readonly unknown[] = value;
  return list;
}

export function text(source: Fields, key: string, where: string): string {
  const value: unknown = source[key];
  if (typeof value !== 'string') throw new ContentError(`${where}.${key}`, 'expected a string');
  return value;
}

export function nullableText(source: Fields, key: string, where: string): string | null {
  const value: unknown = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ContentError(`${where}.${key}`, 'expected a string or null');
  return value;
}

export function numeric(source: Fields, key: string, where: string): number {
  const value: unknown = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ContentError(`${where}.${key}`, 'expected a number');
  return value;
}

export function flag(source: Fields, key: string, where: string): boolean {
  const value: unknown = source[key];
  if (typeof value !== 'boolean') throw new ContentError(`${where}.${key}`, 'expected true or false');
  return value;
}

export function choice<T extends string>(source: Fields, key: string, options: readonly T[], where: string): T {
  const value: unknown = source[key];
  const match: T | undefined = options.find((option: T): boolean => option === value);
  if (match === undefined) throw new ContentError(`${where}.${key}`, `expected one of ${options.join(', ')}`);
  return match;
}

export function each<T>(value: unknown, where: string, read: (entry: unknown, where: string) => T): T[] {
  return items(value, where).map((entry: unknown, index: number): T => read(entry, `${where}[${index}]`));
}

export function textList(source: Fields, key: string, where: string): string[] {
  return each(source[key], `${where}.${key}`, (entry: unknown, entryWhere: string): string => {
    if (typeof entry !== 'string') throw new ContentError(entryWhere, 'expected a string');
    return entry;
  });
}

export function choiceList<T extends string>(source: Fields, key: string, options: readonly T[], where: string): T[] {
  return each(source[key], `${where}.${key}`, (entry: unknown, entryWhere: string): T => {
    const match: T | undefined = options.find((option: T): boolean => option === entry);
    if (match === undefined) throw new ContentError(entryWhere, `expected one of ${options.join(', ')}`);
    return match;
  });
}

export function byId<T extends { readonly id: string }>(defs: readonly T[], where: string): Map<string, T> {
  const map: Map<string, T> = new Map<string, T>();
  for (const def of defs) {
    if (map.has(def.id)) throw new ContentError(where, `duplicate id ${def.id}`);
    map.set(def.id, def);
  }
  return map;
}

export function positive(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value <= 0) throw new ContentError(`${where}.${key}`, 'expected a number above zero');
  return value;
}

export function nonNegative(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < 0) throw new ContentError(`${where}.${key}`, 'expected a number of zero or more');
  return value;
}

export function fraction(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value <= 0 || value > 1) throw new ContentError(`${where}.${key}`, 'expected a number above 0 and at most 1');
  return value;
}

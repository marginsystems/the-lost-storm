import type { Condition } from './content/condition-types.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content, SkillBinding } from './content/types.ts';

export type Bar = readonly (string | null)[];

export function unlockLevel(content: Content, skill: string): number | null {
  return content.player.skillBook.find((entry: SkillUnlock): boolean => entry.skill === skill)?.level ?? null;
}

export function startingSkills(content: Content): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.level <= 1 && entry.when.length === 0).map((entry: SkillUnlock): string => entry.skill);
}

export function unlockedSkills(content: Content, level: number): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.level <= level).map((entry: SkillUnlock): string => entry.skill);
}

export function learnable(content: Content, learned: readonly string[], level: number, holds: (when: readonly Condition[]) => boolean): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => !learned.includes(entry.skill) && entry.level <= level && holds(entry.when)).map((entry: SkillUnlock): string => entry.skill);
}

export function homeSlot(content: Content, skill: string): number {
  return content.player.skillBar.findIndex((binding: SkillBinding): boolean => binding.skill === skill);
}

export function defaultBar(content: Content): (string | null)[] {
  const known: readonly string[] = startingSkills(content);
  return content.player.skillBar.map((binding: SkillBinding): string | null => (binding.skill !== null && known.includes(binding.skill) ? binding.skill : null));
}

export function placeLearned(content: Content, bar: Bar, skill: string): (string | null)[] {
  const next: (string | null)[] = [...bar];
  if (next.includes(skill)) return next;
  const home: number = homeSlot(content, skill);
  const slot: number = home >= 0 && next[home] === null ? home : next.indexOf(null);
  if (slot >= 0) next[slot] = skill;
  return next;
}

export function readLearned(content: Content, value: unknown, level: number, bar: Bar): string[] {
  const book: ReadonlySet<string> = new Set<string>(content.player.skillBook.map((entry: SkillUnlock): string => entry.skill));
  if (!Array.isArray(value)) {
    const known: string[] = unlockedSkills(content, level);
    for (const skill of bar) if (skill !== null && book.has(skill) && !known.includes(skill)) known.push(skill);
    return known;
  }
  const list: readonly unknown[] = value;
  const learned: string[] = startingSkills(content);
  for (const entry of list) if (typeof entry === 'string' && book.has(entry) && !learned.includes(entry)) learned.push(entry);
  return learned;
}

export function readBar(content: Content, value: unknown, learned: readonly string[]): (string | null)[] {
  if (!Array.isArray(value)) return learned.reduce((bar: (string | null)[], skill: string): (string | null)[] => placeLearned(content, bar, skill), defaultBar(content));
  const list: readonly unknown[] = value;
  const seen: Set<string> = new Set<string>();
  return content.player.skillBar.map((_binding: SkillBinding, slot: number): string | null => {
    const entry: unknown = list[slot];
    if (typeof entry !== 'string' || seen.has(entry) || !learned.includes(entry)) return null;
    seen.add(entry);
    return entry;
  });
}

export function assignSlot(bar: Bar, slot: number, skill: string | null): (string | null)[] {
  const next: (string | null)[] = [...bar];
  if (!Number.isInteger(slot) || slot < 0 || slot >= next.length) return next;
  const previous: string | null = next[slot] ?? null;
  const from: number = skill === null ? -1 : next.indexOf(skill);
  if (from >= 0) next[from] = previous;
  next[slot] = skill;
  return next;
}

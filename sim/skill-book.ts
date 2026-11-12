import type { SkillUnlock } from './content/shape-types.ts';
import type { Content, SkillBinding } from './content/types.ts';

export type Bar = readonly (string | null)[];

export function unlockLevel(content: Content, skill: string): number | null {
  return content.player.skillBook.find((entry: SkillUnlock): boolean => entry.skill === skill)?.level ?? null;
}

export function isUnlocked(content: Content, skill: string, level: number): boolean {
  const needed: number | null = unlockLevel(content, skill);
  return needed !== null && needed <= level;
}

export function unlockedSkills(content: Content, level: number): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.level <= level).map((entry: SkillUnlock): string => entry.skill);
}

export function defaultBar(content: Content): (string | null)[] {
  return content.player.skillBar.map((binding: SkillBinding): string | null => binding.skill);
}

export function readBar(content: Content, value: unknown, level: number): (string | null)[] {
  if (!Array.isArray(value)) return withUnlocks(content, defaultBar(content), 1, level);
  const list: readonly unknown[] = value;
  const seen: Set<string> = new Set<string>();
  return content.player.skillBar.map((_binding: SkillBinding, slot: number): string | null => {
    const entry: unknown = list[slot];
    if (typeof entry !== 'string' || seen.has(entry) || !isUnlocked(content, entry, level)) return null;
    seen.add(entry);
    return entry;
  });
}

export function assignSlot(bar: Bar, slot: number, skill: string | null): (string | null)[] {
  const next: (string | null)[] = [...bar];
  if (slot < 0 || slot >= next.length) return next;
  const previous: string | null = next[slot] ?? null;
  const from: number = skill === null ? -1 : next.indexOf(skill);
  if (from >= 0) next[from] = previous;
  next[slot] = skill;
  return next;
}

export function withUnlocks(content: Content, bar: Bar, from: number, to: number): (string | null)[] {
  const next: (string | null)[] = [...bar];
  for (const entry of content.player.skillBook) {
    if (entry.level <= from || entry.level > to || next.includes(entry.skill)) continue;
    const free: number = next.indexOf(null);
    if (free < 0) return next;
    next[free] = entry.skill;
  }
  return next;
}

export function newlyUnlocked(content: Content, from: number, to: number): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.level > from && entry.level <= to).map((entry: SkillUnlock): string => entry.skill);
}

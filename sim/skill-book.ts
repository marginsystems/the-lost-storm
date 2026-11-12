import type { Condition } from './content/condition-types.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content, SkillBinding, SkillTreeNodeDef } from './content/types.ts';

export type Bar = readonly (string | null)[];

export function unlockLevel(content: Content, skill: string): number | null {
  return content.player.skillBook.find((entry: SkillUnlock): boolean => entry.skill === skill)?.level ?? null;
}

export function startingSkills(content: Content): string[] {
  return content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.level <= 1 && entry.when.length === 0).map((entry: SkillUnlock): string => entry.skill);
}

export function chartSkills(content: Content, allocated: readonly string[]): string[] {
  return content.skillTree.flatMap((node: SkillTreeNodeDef): string[] => (node.unlock !== null && allocated.includes(node.id) ? [node.unlock] : []));
}

export function everySkill(content: Content): SkillUnlock[] {
  const entries: SkillUnlock[] = [...content.player.skillBook];
  for (const node of content.skillTree) {
    if (node.unlock !== null && !entries.some((entry: SkillUnlock): boolean => entry.skill === node.unlock)) entries.push({ skill: node.unlock, level: 1, when: [] });
  }
  return entries;
}

export function placeOf(content: Content, skill: string): SkillTreeNodeDef | null {
  return content.skillTree.find((node: SkillTreeNodeDef): boolean => node.unlock === skill) ?? null;
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

export function readLearned(content: Content, value: unknown, allocated: readonly string[]): string[] {
  const book: ReadonlySet<string> = new Set<string>(content.player.skillBook.map((entry: SkillUnlock): string => entry.skill));
  const learned: string[] = startingSkills(content);
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  for (const entry of list) if (typeof entry === 'string' && book.has(entry) && !learned.includes(entry)) learned.push(entry);
  for (const skill of chartSkills(content, allocated)) if (!learned.includes(skill)) learned.push(skill);
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

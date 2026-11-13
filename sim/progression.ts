import type { Content, SkillTreeNodeDef, SkillVariant, XpCurve } from './content/types.ts';

export interface XpResult {
  readonly level: number;
  readonly xp: number;
  readonly levelsGained: number;
}

export function xpToNextLevel(curve: XpCurve, level: number): number {
  return Math.round(curve.base * Math.pow(curve.growth, level - 1));
}

export function applyXp(curve: XpCurve, level: number, xp: number, gained: number): XpResult {
  let nextLevel: number = level;
  let nextXp: number = xp + gained;
  while (nextLevel < curve.maxLevel && nextXp >= xpToNextLevel(curve, nextLevel)) {
    nextXp -= xpToNextLevel(curve, nextLevel);
    nextLevel += 1;
  }
  if (nextLevel >= curve.maxLevel) nextXp = Math.min(nextXp, xpToNextLevel(curve, nextLevel));
  return { level: nextLevel, xp: nextXp, levelsGained: nextLevel - level };
}

export function findNode(content: Content, nodeId: string): SkillTreeNodeDef | null {
  return content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === nodeId) ?? null;
}

export function isStartingPlace(node: SkillTreeNodeDef): boolean {
  return node.requires.length === 0;
}

const LINKS: WeakMap<Content, ReadonlyMap<string, readonly string[]>> = new WeakMap<Content, ReadonlyMap<string, readonly string[]>>();

export function placeLinks(content: Content): ReadonlyMap<string, readonly string[]> {
  const cached: ReadonlyMap<string, readonly string[]> | undefined = LINKS.get(content);
  if (cached !== undefined) return cached;
  const links: Map<string, string[]> = new Map<string, string[]>(content.skillTree.map((node: SkillTreeNodeDef): [string, string[]] => [node.id, []]));
  for (const node of content.skillTree) {
    for (const other of node.requires) {
      const near: string[] | undefined = links.get(other);
      const own: string[] | undefined = links.get(node.id);
      if (near === undefined || own === undefined) continue;
      if (!own.includes(other)) own.push(other);
      if (!near.includes(node.id)) near.push(node.id);
    }
  }
  LINKS.set(content, links);
  return links;
}

export function startingPlaces(content: Content): string[] {
  return content.skillTree.filter(isStartingPlace).map((node: SkillTreeNodeDef): string => node.id);
}

function startsAt(content: Content, id: string): boolean {
  const node: SkillTreeNodeDef | null = findNode(content, id);
  return node !== null && isStartingPlace(node);
}

export function holdingParts(content: Content, allocated: readonly string[]): string[][] {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const held: ReadonlySet<string> = new Set<string>(allocated.filter((id: string): boolean => links.has(id)));
  const seen: Set<string> = new Set<string>();
  const parts: string[][] = [];
  for (const id of allocated) {
    if (!held.has(id) || seen.has(id)) continue;
    const part: string[] = [id];
    seen.add(id);
    for (let index: number = 0; index < part.length; index += 1) {
      const at: string | undefined = part[index];
      for (const next of at === undefined ? [] : (links.get(at) ?? [])) {
        if (!held.has(next) || seen.has(next)) continue;
        seen.add(next);
        part.push(next);
      }
    }
    parts.push(part);
  }
  return parts;
}

function rooted(content: Content, part: readonly string[]): boolean {
  return part.some((id: string): boolean => startsAt(content, id));
}

export function holdingTrunk(content: Content, allocated: readonly string[]): string[] {
  const parts: readonly string[][] = holdingParts(content, allocated);
  const candidates: readonly string[][] = parts.some((part: readonly string[]): boolean => rooted(content, part)) ? parts.filter((part: readonly string[]): boolean => rooted(content, part)) : parts;
  return candidates.reduce<string[]>((best: string[], part: string[]): string[] => (part.length > best.length ? part : best), []);
}

export type JoinBlock = 'begin' | 'connect';

export function joinBlock(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): JoinBlock | null {
  const trunk: readonly string[] = holdingTrunk(content, allocated);
  if (trunk.length === 0) return isStartingPlace(node) ? null : 'begin';
  const near: readonly string[] = placeLinks(content).get(node.id) ?? [];
  return near.some((id: string): boolean => trunk.includes(id)) ? null : 'connect';
}

export function rivalVariant(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): SkillTreeNodeDef | null {
  const varied: ReadonlySet<string> = new Set<string>(node.variants.map((variant: SkillVariant): string => variant.skill));
  if (varied.size === 0) return null;
  return content.skillTree.find((other: SkillTreeNodeDef): boolean => other.id !== node.id && allocated.includes(other.id) && other.variants.some((variant: SkillVariant): boolean => varied.has(variant.skill))) ?? null;
}

export function canAllocate(content: Content, allocated: readonly string[], skillPoints: number, nodeId: string): boolean {
  const node: SkillTreeNodeDef | null = findNode(content, nodeId);
  if (node === null || skillPoints <= 0 || allocated.includes(nodeId)) return false;
  return joinBlock(content, allocated, node) === null && rivalVariant(content, allocated, node) === null;
}

export type RefundBlock = 'not_held' | 'root' | 'split';

function unrooted(content: Content, parts: readonly (readonly string[])[]): number {
  return parts.filter((part: readonly string[]): boolean => !rooted(content, part)).length;
}

export function refundBlock(content: Content, allocated: readonly string[], nodeId: string): RefundBlock | null {
  if (!allocated.includes(nodeId)) return 'not_held';
  const before: readonly string[][] = holdingParts(content, allocated);
  const after: readonly string[][] = holdingParts(content, allocated.filter((id: string): boolean => id !== nodeId));
  if (after.length <= before.length && unrooted(content, after) <= unrooted(content, before)) return null;
  return startsAt(content, nodeId) ? 'root' : 'split';
}

export function canRefund(content: Content, allocated: readonly string[], nodeId: string): boolean {
  return refundBlock(content, allocated, nodeId) === null;
}

export function refundCost(content: Content, level: number, points: number): number {
  return Math.round(points * (content.chart.respec.goldPerPoint + content.chart.respec.goldPerLevel * level));
}

export interface ChartHolder {
  readonly allocated: readonly string[];
  readonly gold: number;
  readonly level: number;
}

export type ChartChange = 'ready' | 'not_allowed' | 'no_gold';

function affordable(content: Content, holder: ChartHolder, points: number): ChartChange {
  return holder.gold < refundCost(content, holder.level, points) ? 'no_gold' : 'ready';
}

export function refundState(content: Content, holder: ChartHolder, nodeId: string): ChartChange {
  return canRefund(content, holder.allocated, nodeId) ? affordable(content, holder, 1) : 'not_allowed';
}

export function respecState(content: Content, holder: ChartHolder): ChartChange {
  return holder.allocated.length > 0 ? affordable(content, holder, holder.allocated.length) : 'not_allowed';
}

export function reachablePlaces(content: Content, allocated: readonly string[]): string[] {
  const kept: ReadonlySet<string> = new Set<string>(holdingParts(content, allocated).filter((part: readonly string[]): boolean => rooted(content, part)).flat());
  return allocated.filter((id: string): boolean => kept.has(id));
}

export interface AdoptedPlaces {
  readonly allocated: readonly string[];
  readonly refund: number;
}

export function adoptLearned(content: Content, learned: unknown, allocated: readonly string[]): AdoptedPlaces {
  const taken: string[] = [...allocated];
  let refund: number = 0;
  const list: readonly unknown[] = Array.isArray(learned) ? learned : [];
  for (const skill of list) {
    const node: SkillTreeNodeDef | undefined = content.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.unlock !== null && entry.unlock === skill);
    if (node === undefined || taken.includes(node.id)) continue;
    const near: readonly string[] = placeLinks(content).get(node.id) ?? [];
    if (isStartingPlace(node) || near.some((id: string): boolean => taken.includes(id))) taken.push(node.id);
    else refund += 1;
  }
  return { allocated: taken, refund };
}

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

export function requirementsMet(node: SkillTreeNodeDef, allocated: readonly string[]): boolean {
  if (node.requires.length === 0) return true;
  const has = (required: string): boolean => allocated.includes(required);
  return node.requireMode === 'all' ? node.requires.every(has) : node.requires.some(has);
}

export function rivalVariant(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): SkillTreeNodeDef | null {
  const varied: ReadonlySet<string> = new Set<string>(node.variants.map((variant: SkillVariant): string => variant.skill));
  if (varied.size === 0) return null;
  return content.skillTree.find((other: SkillTreeNodeDef): boolean => other.id !== node.id && allocated.includes(other.id) && other.variants.some((variant: SkillVariant): boolean => varied.has(variant.skill))) ?? null;
}

export function canAllocate(content: Content, allocated: readonly string[], skillPoints: number, nodeId: string): boolean {
  const node: SkillTreeNodeDef | null = findNode(content, nodeId);
  if (node === null || skillPoints <= 0 || allocated.includes(nodeId)) return false;
  return requirementsMet(node, allocated) && rivalVariant(content, allocated, node) === null;
}

export function canRefund(content: Content, allocated: readonly string[], nodeId: string): boolean {
  if (!allocated.includes(nodeId)) return false;
  const rest: readonly string[] = allocated.filter((id: string): boolean => id !== nodeId);
  return rest.every((id: string): boolean => {
    const node: SkillTreeNodeDef | null = findNode(content, id);
    return node === null || requirementsMet(node, rest);
  });
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
  const kept: Set<string> = new Set<string>();
  let grew: boolean = true;
  while (grew) {
    grew = false;
    for (const id of allocated) {
      const node: SkillTreeNodeDef | null = findNode(content, id);
      if (node === null || kept.has(id) || !requirementsMet(node, [...kept])) continue;
      kept.add(id);
      grew = true;
    }
  }
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
    if (requirementsMet(node, taken)) taken.push(node.id);
    else refund += 1;
  }
  return { allocated: taken, refund };
}

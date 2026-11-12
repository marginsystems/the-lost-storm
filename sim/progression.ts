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
  const variant: SkillVariant | null = node.variant;
  if (variant === null) return null;
  return content.skillTree.find((other: SkillTreeNodeDef): boolean => other.id !== node.id && allocated.includes(other.id) && other.variant?.skill === variant.skill) ?? null;
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

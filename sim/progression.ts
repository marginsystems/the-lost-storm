import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';

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

export function canAllocate(content: Content, allocated: readonly string[], skillPoints: number, nodeId: string): boolean {
  const node: SkillTreeNodeDef | null = findNode(content, nodeId);
  if (node === null || skillPoints <= 0 || allocated.includes(nodeId)) return false;
  return requirementsMet(node, allocated);
}

import type { Content, RequireMode, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { canAllocate, findNode, requirementsMet } from '../../sim/progression.ts';

export const TREE_NODE_COST: number = 1;

export type TreeNodeStatus =
  | { readonly kind: 'allocated' }
  | { readonly kind: 'available' }
  | { readonly kind: 'no_points' }
  | { readonly kind: 'locked'; readonly missing: readonly string[]; readonly mode: RequireMode };

function nodeName(content: Content, id: string): string {
  return findNode(content, id)?.name ?? id;
}

function joined(names: readonly string[], mode: RequireMode): string {
  return names.join(mode === 'all' ? ' and ' : ' or ');
}

export function treeNodeStatus(content: Content, allocated: readonly string[], skillPoints: number, node: SkillTreeNodeDef): TreeNodeStatus {
  if (allocated.includes(node.id)) return { kind: 'allocated' };
  if (!requirementsMet(node, allocated)) {
    const missing: string[] = node.requires.filter((id: string): boolean => !allocated.includes(id)).map((id: string): string => nodeName(content, id));
    return { kind: 'locked', missing, mode: node.requireMode };
  }
  return canAllocate(content, allocated, skillPoints, node.id) ? { kind: 'available' } : { kind: 'no_points' };
}

export function requirementLine(content: Content, node: SkillTreeNodeDef): string | null {
  if (node.requires.length === 0) return null;
  return `Requires ${joined(node.requires.map((id: string): string => nodeName(content, id)), node.requireMode)}`;
}

export function costLine(): string {
  return `Cost ${TREE_NODE_COST} skill point`;
}

const SETTLED_LINES: Readonly<Record<Exclude<TreeNodeStatus['kind'], 'locked'>, string>> = {
  allocated: 'Allocated',
  available: 'Click to allocate',
  no_points: 'No skill points to spend',
};

export function statusLine(status: TreeNodeStatus): string {
  if (status.kind === 'locked') return `Locked: allocate ${joined(status.missing, status.mode)} first`;
  return SETTLED_LINES[status.kind];
}

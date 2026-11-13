import type { SkillTreeNodeDef } from '../../sim/content/types.ts';

export const TREE_NODES = {
  unit: 46,
  minor: 26,
  notable: 28,
  keystone: 30,
  ability: 28,
  abilityRim: 3,
  variantRim: 2,
  keystoneInset: 3,
  gap: 6,
} as const;

export interface NodeSpot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export function nodeFace(node: SkillTreeNodeDef): number {
  if (node.unlock !== null) return TREE_NODES.ability;
  if (node.kind === 'keystone') return TREE_NODES.keystone;
  return node.kind === 'notable' ? TREE_NODES.notable : TREE_NODES.minor;
}

export function nodeDiameter(node: SkillTreeNodeDef): number {
  if (node.unlock !== null) return TREE_NODES.ability + TREE_NODES.abilityRim * 2;
  const face: number = nodeFace(node);
  const diamond: number = node.kind === 'keystone' ? (face - TREE_NODES.keystoneInset * 2) * Math.SQRT2 : 0;
  const ring: number = node.variant === null ? 0 : face + TREE_NODES.variantRim * 2;
  return Math.max(face, diamond, ring);
}

export function nodeAt(spots: readonly NodeSpot[], x: number, y: number): string | null {
  let best: NodeSpot | null = null;
  let bestDistance: number = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    const distance: number = Math.hypot(spot.x - x, spot.y - y);
    if (distance > spot.radius || distance > bestDistance) continue;
    best = spot;
    bestDistance = distance;
  }
  return best === null ? null : best.id;
}

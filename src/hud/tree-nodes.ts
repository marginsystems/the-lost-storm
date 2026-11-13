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
  neighbourReach: 3.5,
} as const;

export interface NodeSpot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface CardSize {
  readonly width: number;
  readonly height: number;
}

export interface CardRoom {
  readonly width: number;
  readonly height: number;
  readonly edge: number;
  readonly gap: number;
}

export interface CardSpot {
  readonly x: number;
  readonly y: number;
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
  const ring: number = node.variants.length === 0 ? 0 : face + TREE_NODES.variantRim * 2;
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

function covers(spot: CardSpot, size: CardSize, circle: NodeSpot, gap: number): boolean {
  const nearX: number = Math.max(spot.x, Math.min(circle.x, spot.x + size.width));
  const nearY: number = Math.max(spot.y, Math.min(circle.y, spot.y + size.height));
  return Math.hypot(circle.x - nearX, circle.y - nearY) < circle.radius + gap;
}

function inside(value: number, size: number, room: number, edge: number): number {
  return Math.max(edge, Math.min(value, room - size - edge));
}

export function cardSpot(node: NodeSpot, size: CardSize, keep: readonly NodeSpot[], room: CardRoom): CardSpot {
  const reach: number = node.radius + room.gap;
  const wanted: readonly CardSpot[] = [
    { x: node.x + reach, y: node.y - size.height / 2 },
    { x: node.x - reach - size.width, y: node.y - size.height / 2 },
    { x: node.x - size.width / 2, y: node.y + reach },
    { x: node.x - size.width / 2, y: node.y - reach - size.height },
  ];
  const placed: CardSpot[] = wanted.map((spot: CardSpot): CardSpot => ({ x: inside(spot.x, size.width, room.width, room.edge), y: inside(spot.y, size.height, room.height, room.edge) }));
  const hits = (spot: CardSpot): number => [node, ...keep].filter((circle: NodeSpot): boolean => covers(spot, size, circle, room.gap)).length;
  let best: CardSpot = placed[0] ?? { x: room.edge, y: room.edge };
  let fewest: number = hits(best);
  for (const spot of placed) {
    const count: number = hits(spot);
    if (count < fewest) {
      best = spot;
      fewest = count;
    }
  }
  return best;
}

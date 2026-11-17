import type { Fields } from './read.ts';
import { ContentError, each, fields, nonNegative, positive, share, text } from './read.ts';
import type { TailwindBurst, TailwindDef, TailwindDrain, TailwindTier, TailwindWeights } from './tailwind-types.ts';
import type { Content } from './types.ts';

function tier(value: unknown, where: string): TailwindTier {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    at: positive(source, 'at', where),
    fuse: positive(source, 'fuse', where),
    xp: nonNegative(source, 'xp', where),
    loot: nonNegative(source, 'loot', where),
    speed: share(source, 'speed', where),
    windfallXp: share(source, 'windfallXp', where),
    windfallGold: share(source, 'windfallGold', where),
  };
}

function weights(value: unknown, where: string): TailwindWeights {
  const source: Fields = fields(value, where);
  const ranks: Fields = fields(source['ranks'], `${where}.ranks`);
  const read: Record<string, number> = {};
  for (const id of Object.keys(ranks)) read[id] = nonNegative(ranks, id, `${where}.ranks`);
  return { plain: nonNegative(source, 'plain', where), ranks: read, leader: nonNegative(source, 'leader', where), boss: nonNegative(source, 'boss', where) };
}

function burst(value: unknown, where: string): TailwindBurst {
  const source: Fields = fields(value, where);
  const most: number = positive(source, 'most', where);
  if (most < 1) throw new ContentError(`${where}.most`, 'the fuse cannot cap below its own length');
  return { window: nonNegative(source, 'window', where), seconds: nonNegative(source, 'seconds', where), most };
}

function drain(value: unknown, where: string): TailwindDrain {
  const source: Fields = fields(value, where);
  return { drain: positive(source, 'drain', where), reach: nonNegative(source, 'reach', where) };
}

export function tailwind(value: unknown, where: string): TailwindDef {
  const source: Fields = fields(value, where);
  const tiers: TailwindTier[] = each(source['tiers'], `${where}.tiers`, tier);
  if (tiers.length === 0) throw new ContentError(`${where}.tiers`, 'expected at least one tier');
  tiers.forEach((entry: TailwindTier, index: number): void => {
    const before: TailwindTier | undefined = tiers[index - 1];
    if (before !== undefined && entry.at <= before.at) throw new ContentError(`${where}.tiers[${index}].at`, 'each tier must need more than the one before');
  });
  return {
    name: text(source, 'name', where),
    fuse: positive(source, 'fuse', where),
    weights: weights(source['weights'], `${where}.weights`),
    burst: burst(source['burst'], `${where}.burst`),
    idle: drain(source['idle'], `${where}.idle`),
    fight: drain(source['fight'], `${where}.fight`),
    tiers,
  };
}

export function tailwindProblems(content: Content): string[] {
  const problems: string[] = [];
  const known: readonly string[] = content.packRanks.ranks.map((rank): string => rank.id);
  for (const id of Object.keys(content.tailwind.weights.ranks)) if (!known.includes(id)) problems.push(`tailwind weighs unknown rank ${id}`);
  for (const id of known) if (content.tailwind.weights.ranks[id] === undefined) problems.push(`tailwind has no weight for rank ${id}`);
  return problems;
}

import type { ChartGroup, Content, EmpoweredMod, ModOp, SkillMod, SkillModField, SkillTarget, StatId, StatMod } from './content/types.ts';

const RATIO_STATS: ReadonlySet<StatId> = new Set<StatId>(['damagePercent', 'attackSpeed', 'critChance', 'critMultiplier', 'goldFind', 'stormResist', 'frostResist']);
const DECIMAL_STATS: ReadonlySet<StatId> = new Set<StatId>(['lifeRegen', 'manaRegen']);

const STAT_LABELS: Readonly<Record<StatId, string>> = {
  maxLife: 'Maximum Life',
  maxMana: 'Maximum Mana',
  lifeRegen: 'Life Regenerated per Second',
  manaRegen: 'Mana Regenerated per Second',
  damageMin: 'Minimum Damage',
  damageMax: 'Maximum Damage',
  damagePercent: 'Damage',
  attackSpeed: 'Attack Speed',
  critChance: 'Critical Strike Chance',
  critMultiplier: 'Critical Strike Damage',
  moveSpeed: 'Movement Speed',
  armour: 'Armour',
  goldFind: 'Gold Found',
  stormResist: 'Storm Resistance',
  frostResist: 'Frost Resistance',
};

export function statLabel(stat: StatId): string {
  return STAT_LABELS[stat];
}

export function isRatio(stat: StatId, op: ModOp): boolean {
  return op === 'percent' || RATIO_STATS.has(stat);
}

export function roundStat(stat: StatId, op: ModOp, value: number): number {
  if (isRatio(stat, op)) return Math.round(value * 100) / 100;
  if (DECIMAL_STATS.has(stat)) return Math.round(value * 10) / 10;
  return Math.round(value);
}

export function describeMod(mod: StatMod): string {
  const sign: string = mod.value < 0 ? '−' : '+';
  const size: number = Math.abs(mod.value);
  if (isRatio(mod.stat, mod.op)) return `${sign}${Math.round(size * 100)}% ${statLabel(mod.stat)}`;
  return `${sign}${size} ${statLabel(mod.stat)}`;
}

export function describeExactMod(mod: StatMod): string {
  if (!isRatio(mod.stat, mod.op)) return describeMod(mod);
  const sign: string = mod.value < 0 ? '−' : '+';
  return `${sign}${Number((Math.abs(mod.value) * 100).toFixed(1))}% ${statLabel(mod.stat)}`;
}

function targetName(content: Content, target: SkillTarget): string {
  if (target.type === 'skill') return content.skills.get(target.skill)?.name ?? target.skill;
  return content.chart.groups.find((group: ChartGroup): boolean => group.id === target.group)?.name ?? target.group;
}

interface FieldWords {
  readonly word: string;
  readonly count: boolean;
}

const FIELD_WORDS: Readonly<Record<SkillModField, FieldWords>> = {
  damagePercent: { word: 'damage', count: false },
  areaPercent: { word: 'area', count: false },
  rangePercent: { word: 'range', count: false },
  durationPercent: { word: 'duration', count: false },
  cooldownPercent: { word: 'cooldown', count: false },
  manaCostPercent: { word: 'mana cost', count: false },
  knockbackPercent: { word: 'knockback', count: false },
  staggerPercent: { word: 'stagger', count: false },
  projectiles: { word: 'projectiles', count: true },
  pierce: { word: 'pierce', count: true },
  chains: { word: 'chains', count: true },
  chainFalloff: { word: 'chain falloff', count: false },
  momentumCapPercent: { word: 'momentum cap', count: false },
  momentumGracePercent: { word: 'momentum grace', count: false },
  momentumSteadyPercent: { word: 'momentum to stand steady', count: false },
  lifePerHit: { word: 'life per hit', count: true },
  lifeOnHit: { word: 'life on hit', count: true },
  leech: { word: 'life leech', count: false },
  echo: { word: 'echo', count: false },
  pull: { word: 'pull', count: true },
  spread: { word: 'degrees of spread', count: true },
};

export function describeEmpoweredMod(mod: EmpoweredMod): string {
  const sign: string = mod.value < 0 ? '-' : '+';
  const size: number = Math.abs(mod.value);
  const words: FieldWords = FIELD_WORDS[mod.field];
  const amount: string = words.count ? String(size) : `${Math.round(size * 100)}%`;
  return `${sign}${amount} ${words.word}`;
}

export function describeSkillMod(content: Content, mod: SkillMod): string {
  return `${describeEmpoweredMod(mod)} (${targetName(content, mod.target)})`;
}

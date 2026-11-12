import type { Content, ModOp, SkillMod, StatId, StatMod } from './content/types.ts';

const RATIO_STATS: ReadonlySet<StatId> = new Set<StatId>([
  'damagePercent',
  'attackSpeed',
  'critChance',
  'critMultiplier',
  'goldFind',
  'itemFind',
  'lightningDamage',
  'thunderDamage',
  'meleeDamage',
  'flaskCharges',
  'dodgeCooldown',
  'skillRepeat',
]);
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
  itemFind: 'Item Rarity',
  lightningDamage: 'Lightning Skill Damage',
  thunderDamage: 'Thunder Skill Damage',
  meleeDamage: 'Melee Skill Damage',
  flaskCharges: 'Flask Charges Gained',
  dodgeCooldown: 'Dodge Roll Cooldown',
  lifeOnKill: 'Life Gained on Kill',
  manaOnKill: 'Mana Gained on Kill',
  skillRepeat: 'Chance to Repeat Skills',
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
  const sign: string = mod.value < 0 ? '-' : '+';
  const size: number = Math.abs(mod.value);
  if (isRatio(mod.stat, mod.op)) return `${sign}${Math.round(size * 100)}% ${statLabel(mod.stat)}`;
  return `${sign}${size} ${statLabel(mod.stat)}`;
}

export function describeSkillMod(content: Content, mod: SkillMod): string {
  const name: string = content.skills.get(mod.skill)?.name ?? mod.skill;
  const sign: string = mod.value < 0 ? '-' : '+';
  const size: number = Math.abs(mod.value);
  const amount: string = mod.field === 'projectiles' || mod.field === 'pierce' ? String(size) : `${Math.round(size * 100)}%`;
  return `${sign}${amount} ${mod.field.replace(/Percent$/, '')} (${name})`;
}

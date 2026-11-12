import type { ChartGroup, Content, SkillDef, SkillMod, SkillTarget, StatBlock, StatId, StatMod } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { emptyEquipment, itemMods } from './items.ts';
import { describeMod } from './stat-text.ts';
import { armourReduction, computeStats, damagePerSecond, skillCycle } from './stats.ts';
import { xpToNextLevel } from './progression.ts';
import type { Equipment, PlayerState } from './world/types.ts';

export interface Figure {
  readonly total: number;
  readonly base: number;
  readonly gear: number;
  readonly tree: number;
}

export interface SkillOffence {
  readonly id: string;
  readonly name: string;
  readonly hitMin: number;
  readonly hitMax: number;
  readonly cycle: number;
  readonly manaCost: number;
  readonly perSecond: number;
  readonly weaponPercent: number;
}

export type BonusSource = 'gear' | 'tree';

export interface SheetBonus {
  readonly source: BonusSource;
  readonly text: string;
}

export interface CharacterSheet {
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly atMaxLevel: boolean;
  readonly figures: Readonly<Record<StatId, Figure>>;
  readonly armourReduction: number;
  readonly skills: readonly SkillOffence[];
  readonly bonuses: readonly SheetBonus[];
}

export type SheetSubject = Pick<PlayerState, 'level' | 'xp' | 'equipped' | 'allocated' | 'skills'>;

function figures(total: StatBlock, base: StatBlock, treeOnly: StatBlock): Record<StatId, Figure> {
  const figure = (stat: StatId): Figure => ({ total: total[stat], base: base[stat], gear: total[stat] - treeOnly[stat], tree: treeOnly[stat] - base[stat] });
  return {
    maxLife: figure('maxLife'),
    maxMana: figure('maxMana'),
    lifeRegen: figure('lifeRegen'),
    manaRegen: figure('manaRegen'),
    damageMin: figure('damageMin'),
    damageMax: figure('damageMax'),
    damagePercent: figure('damagePercent'),
    attackSpeed: figure('attackSpeed'),
    critChance: figure('critChance'),
    critMultiplier: figure('critMultiplier'),
    moveSpeed: figure('moveSpeed'),
    armour: figure('armour'),
    goldFind: figure('goldFind'),
    stormResist: figure('stormResist'),
    frostResist: figure('frostResist'),
  };
}

function gearBonuses(content: Content, equipped: Equipment): SheetBonus[] {
  const sums: Map<string, StatMod> = new Map<string, StatMod>();
  for (const slot of ITEM_SLOTS) {
    const item = equipped[slot];
    if (item === null) continue;
    for (const mod of itemMods(content, item)) {
      const key: string = `${mod.stat}:${mod.op}`;
      const seen: StatMod | undefined = sums.get(key);
      sums.set(key, seen === undefined ? mod : { ...mod, value: seen.value + mod.value });
    }
  }
  return [...sums.values()].filter((mod: StatMod): boolean => mod.value !== 0).map((mod: StatMod): SheetBonus => ({ source: 'gear', text: describeMod(mod) }));
}

function targetName(content: Content, target: SkillTarget): string {
  if (target.type === 'skill') return content.skills.get(target.skill)?.name ?? target.skill;
  return content.chart.groups.find((group: ChartGroup): boolean => group.id === target.group)?.name ?? target.group;
}

function skillModText(content: Content, mod: SkillMod): string {
  const name: string = targetName(content, mod.target);
  const sign: string = mod.value < 0 ? '-' : '+';
  const size: number = Math.abs(mod.value);
  const amount: string = mod.field === 'projectiles' || mod.field === 'pierce' || mod.field === 'chains' ? String(size) : `${Math.round(size * 100)}%`;
  return `${sign}${amount} ${mod.field.replace(/Percent$/, '')} (${name})`;
}

function treeBonuses(content: Content, allocated: readonly string[]): SheetBonus[] {
  const bonuses: SheetBonus[] = [];
  for (const node of content.skillTree) {
    if (!allocated.includes(node.id)) continue;
    const parts: string[] = [...node.statMods.map(describeMod), ...node.skillMods.map((mod: SkillMod): string => skillModText(content, mod))];
    bonuses.push({ source: 'tree', text: parts.length === 0 ? node.name : `${node.name}: ${parts.join(', ')}` });
  }
  return bonuses;
}

export function skillOffence(stats: StatBlock, skill: SkillDef): SkillOffence {
  const scale: number = 1 + stats.damagePercent;
  return {
    id: skill.id,
    name: skill.name,
    hitMin: stats.damageMin * scale * skill.damage.weaponPercent + skill.damage.flatMin,
    hitMax: stats.damageMax * scale * skill.damage.weaponPercent + skill.damage.flatMax,
    cycle: skillCycle(stats, skill),
    manaCost: skill.manaCost,
    perSecond: damagePerSecond(stats, skill),
    weaponPercent: skill.damage.weaponPercent,
  };
}

export function characterSheet(content: Content, subject: SheetSubject): CharacterSheet {
  const bare: Equipment = emptyEquipment();
  const total: StatBlock = computeStats(content, subject.level, subject.equipped, subject.allocated);
  const base: StatBlock = computeStats(content, subject.level, bare, []);
  const treeOnly: StatBlock = computeStats(content, subject.level, bare, subject.allocated);
  const curve = content.player.xp;
  return {
    level: subject.level,
    xp: subject.xp,
    xpToNext: xpToNextLevel(curve, subject.level),
    atMaxLevel: subject.level >= curve.maxLevel,
    figures: figures(total, base, treeOnly),
    armourReduction: armourReduction(total.armour),
    skills: subject.skills.filter((skill: SkillDef | null): skill is SkillDef => skill !== null && skill.delivery.type !== 'dash').map((skill: SkillDef): SkillOffence => skillOffence(total, skill)),
    bonuses: [...gearBonuses(content, subject.equipped), ...treeBonuses(content, subject.allocated)],
  };
}

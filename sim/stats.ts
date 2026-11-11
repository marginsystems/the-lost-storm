import type { Content, SkillDef, SkillMod, SkillTreeNodeDef, StatBlock, StatId, StatMod } from './content/types.ts';
import { ITEM_SLOTS, STAT_IDS } from './content/types.ts';
import { itemMods } from './items.ts';
import type { Equipment } from './world/types.ts';

const ARMOUR_HALF_POINT: number = 100;

export function applyMods(base: StatBlock, mods: readonly StatMod[]): StatBlock {
  const flat: StatBlock = { ...base };
  const percent: Partial<Record<StatId, number>> = {};
  for (const mod of mods) {
    if (mod.op === 'add') flat[mod.stat] += mod.value;
    else percent[mod.stat] = (percent[mod.stat] ?? 0) + mod.value;
  }
  for (const stat of STAT_IDS) flat[stat] *= 1 + (percent[stat] ?? 0);
  return flat;
}

export function allocatedNodes(content: Content, allocated: readonly string[]): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => allocated.includes(node.id));
}

export function computeStats(content: Content, level: number, equipped: Equipment, allocated: readonly string[]): StatBlock {
  const mods: StatMod[] = [];
  for (const mod of content.player.perLevel) mods.push({ ...mod, value: mod.value * (level - 1) });
  for (const slot of ITEM_SLOTS) {
    const item = equipped[slot];
    if (item !== null) mods.push(...itemMods(content, item));
  }
  for (const node of allocatedNodes(content, allocated)) mods.push(...node.statMods);
  const stats: StatBlock = applyMods(content.player.baseStats, mods);
  stats.damageMax = Math.max(stats.damageMax, stats.damageMin);
  return stats;
}

function sumSkillMod(mods: readonly SkillMod[], field: SkillMod['field']): number {
  return mods.filter((mod: SkillMod): boolean => mod.field === field).reduce((sum: number, mod: SkillMod): number => sum + mod.value, 0);
}

export function resolveSkill(content: Content, skill: SkillDef, allocated: readonly string[]): SkillDef {
  const mods: SkillMod[] = allocatedNodes(content, allocated)
    .flatMap((node: SkillTreeNodeDef): readonly SkillMod[] => node.skillMods)
    .filter((mod: SkillMod): boolean => mod.skill === skill.id);
  if (mods.length === 0) return skill;
  const area: number = 1 + sumSkillMod(mods, 'areaPercent');
  const delivery: SkillDef['delivery'] =
    skill.delivery.type === 'arc'
      ? { ...skill.delivery, reach: skill.delivery.reach * area }
      : skill.delivery.type === 'nova'
        ? { ...skill.delivery, radius: skill.delivery.radius * area }
        : { ...skill.delivery, count: skill.delivery.count + sumSkillMod(mods, 'projectiles'), pierce: skill.delivery.pierce + sumSkillMod(mods, 'pierce') };
  const damageScale: number = 1 + sumSkillMod(mods, 'damagePercent');
  return {
    ...skill,
    delivery,
    damage: { weaponPercent: skill.damage.weaponPercent * damageScale, flatMin: skill.damage.flatMin * damageScale, flatMax: skill.damage.flatMax * damageScale },
    cooldown: Math.max(0, skill.cooldown * (1 + sumSkillMod(mods, 'cooldownPercent'))),
    manaCost: Math.max(0, Math.round(skill.manaCost * (1 + sumSkillMod(mods, 'manaCostPercent')))),
    knockback: skill.knockback * (1 + sumSkillMod(mods, 'knockbackPercent')),
  };
}

export function resolveSkillBar(content: Content, allocated: readonly string[]): SkillDef[] {
  const skills: SkillDef[] = [];
  for (const binding of content.player.skillBar) {
    const skill: SkillDef | undefined = content.skills.get(binding.skill);
    if (skill !== undefined) skills.push(resolveSkill(content, skill, allocated));
  }
  return skills;
}

export function armourReduction(armour: number): number {
  const effective: number = Math.max(0, armour);
  return effective / (effective + ARMOUR_HALF_POINT);
}

export function averageHit(stats: StatBlock): number {
  const base: number = ((stats.damageMin + stats.damageMax) / 2) * (1 + stats.damagePercent);
  return base * (1 + Math.min(1, stats.critChance) * (stats.critMultiplier - 1));
}

export function damagePerSecond(stats: StatBlock, skill: SkillDef): number {
  const speed: number = skill.scalesWithAttackSpeed ? stats.attackSpeed : 1;
  const cycle: number = Math.max((skill.windup + skill.recovery) / speed, skill.cooldown, 0.05);
  return (averageHit(stats) * skill.damage.weaponPercent + (skill.damage.flatMin + skill.damage.flatMax) / 2) / cycle;
}

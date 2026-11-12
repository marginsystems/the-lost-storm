import type { ChartGroup, Content, DamageType, Delivery, PowerDef, ResistanceRules, ResistedType, SkillTarget, SkillDef, SkillMod, SkillTreeNodeDef, SkillVariant, StatBlock, StatId, StatMod } from './content/types.ts';
import { ITEM_SLOTS, STAT_IDS } from './content/types.ts';
import { itemMods } from './items.ts';
import type { Equipment } from './world/types.ts';

export const ARMOUR_HALF_POINT: number = 100;
export const MIN_ATTACK_SPEED: number = 0.2;
const MIN_CYCLE: number = 0.05;

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

export function computeStats(content: Content, level: number, equipped: Equipment, allocated: readonly string[], extra: readonly StatMod[] = []): StatBlock {
  const mods: StatMod[] = [];
  for (const mod of content.player.perLevel) mods.push({ ...mod, value: mod.value * (level - 1) });
  for (const slot of ITEM_SLOTS) {
    const item = equipped[slot];
    if (item !== null) mods.push(...itemMods(content, item));
  }
  for (const node of allocatedNodes(content, allocated)) mods.push(...node.statMods);
  mods.push(...extra);
  const stats: StatBlock = applyMods(content.player.baseStats, mods);
  stats.damageMax = Math.max(stats.damageMax, stats.damageMin);
  for (const cap of content.player.caps) stats[cap.stat] = Math.min(stats[cap.stat], cap.max);
  return stats;
}

function sumSkillMod(mods: readonly SkillMod[], field: SkillMod['field']): number {
  return mods.filter((mod: SkillMod): boolean => mod.field === field).reduce((sum: number, mod: SkillMod): number => sum + mod.value, 0);
}

interface DeliveryScale {
  readonly area: number;
  readonly range: number;
  readonly duration: number;
  readonly projectiles: number;
  readonly pierce: number;
  readonly chains: number;
  readonly falloff: number;
}

function scaledDelivery(delivery: Delivery, scale: DeliveryScale): Delivery {
  const { area, range, duration } = scale;
  let scaled: Delivery;
  switch (delivery.type) {
    case 'arc':
      scaled = { ...delivery, reach: delivery.reach * area };
      break;
    case 'nova':
      scaled = { ...delivery, radius: delivery.radius * area };
      break;
    case 'mark':
      scaled = { ...delivery, radius: delivery.radius * area, range: delivery.range * range };
      break;
    case 'projectile':
      scaled = { ...delivery, range: delivery.range * range, count: delivery.count + scale.projectiles, pierce: delivery.pierce + scale.pierce };
      break;
    case 'dash':
      scaled = { ...delivery, distance: delivery.distance * range };
      break;
    case 'revive':
      scaled = { ...delivery, range: delivery.range * range };
      break;
    case 'field':
      scaled = { ...delivery, radius: delivery.radius * area, range: delivery.range * range, duration: delivery.duration * duration };
      break;
    case 'chain':
      scaled = { ...delivery, jumpRange: delivery.jumpRange * area, range: delivery.range * range, jumps: Math.max(0, delivery.jumps + scale.chains), falloff: Math.max(0, delivery.falloff + scale.falloff) };
      break;
    case 'area':
      scaled = { ...delivery, radius: delivery.radius * area, range: delivery.range * range, duration: delivery.duration * duration };
      break;
    case 'blink':
      scaled = { ...delivery, radius: delivery.radius * area, range: delivery.range * range };
      break;
    case 'beam':
      scaled = { ...delivery, width: delivery.width * area, range: delivery.range * range };
      break;
  }
  return scaled;
}

export function inGroup(content: Content, group: string, skill: string): boolean {
  return content.chart.groups.some((entry: ChartGroup): boolean => entry.id === group && entry.skills.includes(skill));
}

export function modTargets(content: Content, mod: SkillMod, skill: string): boolean {
  const target: SkillTarget = mod.target;
  return target.type === 'skill' ? target.skill === skill : inGroup(content, target.group, skill);
}

export function chosenVariant(content: Content, skill: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = []): SkillDef {
  const fromTree: SkillVariant[] = allocatedNodes(content, allocated).flatMap((node: SkillTreeNodeDef): SkillVariant[] => (node.variant === null ? [] : [node.variant]));
  const fromPowers: SkillVariant[] = powers.flatMap((power: PowerDef): readonly SkillVariant[] => power.variants);
  for (const chosen of [...fromPowers, ...fromTree]) {
    if (chosen.skill !== skill.id) continue;
    const variant: SkillDef | undefined = content.skills.get(chosen.becomes);
    if (variant !== undefined) return { ...variant, id: skill.id };
  }
  return skill;
}

function scaleOf(mods: readonly SkillMod[], field: SkillMod['field']): number {
  return Math.max(0, 1 + sumSkillMod(mods, field));
}

export function resolveSkill(content: Content, base: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = []): SkillDef {
  const skill: SkillDef = chosenVariant(content, base, allocated, powers);
  const mods: SkillMod[] = [...allocatedNodes(content, allocated).flatMap((node: SkillTreeNodeDef): readonly SkillMod[] => node.skillMods), ...powers.flatMap((power: PowerDef): readonly SkillMod[] => power.skillMods)].filter((mod: SkillMod): boolean => modTargets(content, mod, skill.id));
  if (mods.length === 0) return skill;
  const delivery: Delivery = scaledDelivery(skill.delivery, {
    area: scaleOf(mods, 'areaPercent'),
    range: scaleOf(mods, 'rangePercent'),
    duration: scaleOf(mods, 'durationPercent'),
    projectiles: sumSkillMod(mods, 'projectiles'),
    pierce: sumSkillMod(mods, 'pierce'),
    chains: sumSkillMod(mods, 'chains'),
    falloff: sumSkillMod(mods, 'chainFalloff'),
  });
  const damageScale: number = scaleOf(mods, 'damagePercent');
  return {
    ...skill,
    delivery,
    damage: { type: skill.damage.type, weaponPercent: skill.damage.weaponPercent * damageScale, flatMin: skill.damage.flatMin * damageScale, flatMax: skill.damage.flatMax * damageScale },
    cooldown: skill.cooldown * scaleOf(mods, 'cooldownPercent'),
    manaCost: Math.round(skill.manaCost * scaleOf(mods, 'manaCostPercent')),
    knockback: skill.knockback * (1 + sumSkillMod(mods, 'knockbackPercent')),
    stagger: skill.stagger * scaleOf(mods, 'staggerPercent'),
  };
}

export function resolveSkillBar(content: Content, bar: readonly (string | null)[], allocated: readonly string[], powers: readonly PowerDef[] = []): (SkillDef | null)[] {
  return bar.map((id: string | null): SkillDef | null => {
    const skill: SkillDef | undefined = id === null ? undefined : content.skills.get(id);
    return skill === undefined ? null : resolveSkill(content, skill, allocated, powers);
  });
}

export function armourReduction(armour: number, cap: number): number {
  const effective: number = Math.max(0, armour);
  return Math.min(cap, effective / (effective + ARMOUR_HALF_POINT));
}

export function resistanceOf(stats: StatBlock, type: ResistedType, rules: ResistanceRules, stormTier: number): number {
  const raw: number = type === 'storm' ? stats.stormResist : stats.frostResist;
  return Math.min(rules.cap, Math.max(rules.floor, raw - rules.tierPenalty * stormTier));
}

export function damageTakenScale(stats: StatBlock, type: DamageType, rules: ResistanceRules, stormTier: number): number {
  const armour: number = 1 - armourReduction(stats.armour, rules.armourCap);
  switch (type) {
    case 'physical':
      return armour;
    case 'storm':
    case 'frost':
      return armour * (1 - resistanceOf(stats, type, rules, stormTier));
  }
  return armour;
}

export function averageHit(stats: StatBlock): number {
  const base: number = ((stats.damageMin + stats.damageMax) / 2) * (1 + stats.damagePercent);
  return base * (1 + Math.min(1, stats.critChance) * (stats.critMultiplier - 1));
}

export function effectiveAttackSpeed(stats: StatBlock): number {
  return Math.max(MIN_ATTACK_SPEED, stats.attackSpeed);
}

export function skillCycle(stats: StatBlock, skill: SkillDef): number {
  const speed: number = skill.scalesWithAttackSpeed ? effectiveAttackSpeed(stats) : 1;
  return Math.max((skill.windup + skill.recovery) / speed, skill.cooldown, MIN_CYCLE);
}

export function damagePerSecond(stats: StatBlock, skill: SkillDef): number {
  const weapon: number = ((stats.damageMin + stats.damageMax) / 2) * (1 + stats.damagePercent) * skill.damage.weaponPercent;
  const flat: number = (skill.damage.flatMin + skill.damage.flatMax) / 2;
  const crit: number = 1 + Math.min(1, stats.critChance) * (stats.critMultiplier - 1);
  return ((weapon + flat) * crit) / skillCycle(stats, skill);
}

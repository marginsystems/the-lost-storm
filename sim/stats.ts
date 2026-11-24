import type { ChartGroup, Content, DamageType, Delivery, EmpoweredMod, PowerDef, ResistanceRules, ResistedType, SkillCap, SkillTarget, SkillDef, SkillMod, SkillModField, SkillTreeNodeDef, SkillVariant, StatBlock, StatId, StatMod } from './content/types.ts';
import { ITEM_SLOTS, STAT_IDS } from './content/types.ts';
import { itemMods } from './items.ts';
import type { Equipment } from './world/types.ts';
import { ANY_WEAPON, empoweredBy, empoweredMods, heldGroup, heldPlace } from './weapons.ts';
import { widerWave } from './widen.ts';

export const ARMOUR_HALF_POINT: number = 100;
export const MIN_ATTACK_SPEED: number = 0.2;
const MIN_CYCLE: number = 0.05;
export const ADDED_ECHO = { delay: 0.35, heldDamage: 0.5 } as const;

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

export function allocatedNodes(content: Content, allocated: readonly string[], held: string | null): SkillTreeNodeDef[] {
  const taken: ReadonlySet<string> = new Set<string>(allocated);
  const placed: SkillTreeNodeDef[] = [];
  for (const node of content.skillTree) if (taken.has(node.id)) placed.push(heldPlace(node, held));
  return placed;
}

function inAllocationOrder(placed: readonly SkillTreeNodeDef[], allocated: readonly string[]): SkillTreeNodeDef[] {
  const rank: Map<string, number> = new Map<string, number>();
  allocated.forEach((id: string, index: number): void => {
    if (!rank.has(id)) rank.set(id, index);
  });
  return placed.toSorted((a: SkillTreeNodeDef, b: SkillTreeNodeDef): number => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
}

export function computeStats(content: Content, level: number, equipped: Equipment, allocated: readonly string[], extra: readonly StatMod[] = [], held: string | null = heldGroup(content, equipped)): StatBlock {
  const mods: StatMod[] = [];
  for (const mod of content.player.perLevel) mods.push({ ...mod, value: mod.value * (level - 1) });
  for (const slot of ITEM_SLOTS) {
    const item = equipped[slot];
    if (item !== null) mods.push(...itemMods(content, item));
  }
  for (const node of allocatedNodes(content, allocated, held)) mods.push(...node.statMods);
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
  readonly spread: number;
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
      scaled = { ...delivery, radius: delivery.radius * area, range: delivery.range * range, count: delivery.count + scale.projectiles, pierce: delivery.pierce + scale.pierce, spreadDegrees: Math.max(0, delivery.spreadDegrees + scale.spread) };
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
      scaled = { ...delivery, radius: delivery.radius * area, length: delivery.length * area, range: delivery.range * range, duration: delivery.duration * duration };
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

export function modTargets(content: Content, mod: SkillMod, through: readonly string[]): boolean {
  const target: SkillTarget = mod.target;
  return target.type === 'skill' ? through.includes(target.skill) : through.some((skill: string): boolean => inGroup(content, target.group, skill));
}

export interface ChosenSkill {
  readonly skill: SkillDef;
  readonly through: readonly string[];
}

function varied(content: Content, chosen: ChosenSkill, variants: readonly SkillVariant[]): ChosenSkill {
  const current: string = chosen.through[chosen.through.length - 1] ?? chosen.skill.id;
  for (const entry of variants) {
    if (entry.skill !== current) continue;
    const variant: SkillDef | undefined = content.skills.get(entry.becomes);
    if (variant !== undefined) return { skill: { ...variant, id: chosen.skill.id }, through: [...chosen.through, entry.becomes] };
  }
  return chosen;
}

function chained(content: Content, chosen: ChosenSkill, variants: readonly SkillVariant[]): ChosenSkill {
  let current: ChosenSkill = chosen;
  for (let step: number = 0; step < variants.length; step += 1) {
    const next: ChosenSkill = varied(content, current, variants);
    const reached: string | undefined = next.through[next.through.length - 1];
    if (next === current || reached === undefined || current.through.includes(reached)) return current;
    current = next;
  }
  return current;
}

export type ChangeChoice = Readonly<Record<string, string>>;

export function activeChanges(variants: readonly SkillVariant[], chosen: ChangeChoice): SkillVariant[] {
  return variants.filter((entry: SkillVariant): boolean => {
    const rivals: readonly SkillVariant[] = variants.filter((other: SkillVariant): boolean => other.skill === entry.skill);
    const kept: SkillVariant | undefined = rivals.find((other: SkillVariant): boolean => other.becomes === chosen[entry.skill]) ?? rivals[0];
    return kept === entry;
  });
}

function chainFrom(content: Content, skill: SkillDef, placed: readonly SkillTreeNodeDef[], allocated: readonly string[], powers: readonly PowerDef[], worn: readonly SkillVariant[], chosen: ChangeChoice): ChosenSkill {
  const taken: readonly SkillTreeNodeDef[] = inAllocationOrder(placed, allocated);
  const fromTree: readonly SkillVariant[] = activeChanges(taken.flatMap((node: SkillTreeNodeDef): readonly SkillVariant[] => node.variants), chosen);
  const fromPowers: readonly SkillVariant[] = powers.flatMap((power: PowerDef): readonly SkillVariant[] => power.variants);
  return chained(content, varied(content, { skill, through: [skill.id] }, worn), [...fromPowers, ...fromTree]);
}

export function variantChain(content: Content, skill: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = [], worn: readonly SkillVariant[] = [], held: string | null = ANY_WEAPON, chosen: ChangeChoice = {}): ChosenSkill {
  return chainFrom(content, skill, allocatedNodes(content, allocated, held), allocated, powers, worn, chosen);
}

export function chosenVariant(content: Content, skill: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = [], worn: readonly SkillVariant[] = [], held: string | null = ANY_WEAPON, chosen: ChangeChoice = {}): SkillDef {
  return variantChain(content, skill, allocated, powers, worn, held, chosen).skill;
}

interface SkillEcho {
  readonly echo: number;
  readonly echoShare: number;
}

function echoOf(skill: SkillDef, share: number): SkillEcho {
  const kept: SkillEcho = { echo: skill.echo, echoShare: skill.echoShare };
  if (skill.echo > 0 || share <= 0 || skill.momentum !== null) return kept;
  if (skill.delivery.type === 'dash' || skill.delivery.type === 'revive') return kept;
  return { echo: ADDED_ECHO.delay, echoShare: Math.min(1, share) };
}

function heldEchoScale(skill: SkillDef, share: number): number {
  if (skill.momentum === null || skill.echo > 0 || share <= 0) return 1;
  return 1 + Math.min(1, share) * ADDED_ECHO.heldDamage;
}

export function cappedSkillMod(caps: readonly SkillCap[], field: SkillModField, total: number): number {
  let held: number = total;
  for (const cap of caps) {
    if (cap.field !== field) continue;
    if (cap.min !== null) held = Math.max(held, cap.min);
    if (cap.max !== null) held = Math.min(held, cap.max);
  }
  return held;
}

type FieldTotal = (field: SkillModField) => number;

function scaleOf(total: number): number {
  return Math.max(0, 1 + total);
}

function pulled(skill: SkillDef, sum: FieldTotal): number {
  const pull: number = sum('pull');
  return pull > 0 ? -pull : skill.knockback * (1 + sum('knockbackPercent'));
}

export function resolveSkill(content: Content, base: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = [], worn: readonly SkillVariant[] = [], held: string | null = ANY_WEAPON, chosen: ChangeChoice = {}): SkillDef {
  const placed: readonly SkillTreeNodeDef[] = allocatedNodes(content, allocated, held);
  return modded(content, chainFrom(content, base, placed, allocated, powers, worn, chosen), base, placed, powers, held);
}

export function resolveLeft(content: Content, parent: SkillDef, left: SkillDef, allocated: readonly string[], powers: readonly PowerDef[] = [], held: string | null = ANY_WEAPON): SkillDef {
  return modded(content, { skill: left, through: [parent.id, left.id] }, left, allocatedNodes(content, allocated, held), powers, held);
}

function modded(content: Content, { skill, through }: ChosenSkill, base: SkillDef, placed: readonly SkillTreeNodeDef[], powers: readonly PowerDef[], held: string | null): SkillDef {
  const empowered: readonly SkillMod[] = empoweredMods(empoweredBy(skill, base), held).map((mod: EmpoweredMod): SkillMod => ({ target: { type: 'skill', skill: skill.id }, field: mod.field, value: mod.value }));
  const mods: SkillMod[] = [...placed.flatMap((node: SkillTreeNodeDef): readonly SkillMod[] => node.skillMods), ...powers.flatMap((power: PowerDef): readonly SkillMod[] => power.skillMods)].filter((mod: SkillMod): boolean => modTargets(content, mod, through));
  mods.push(...empowered);
  if (mods.length === 0) return skill;
  const sum: FieldTotal = (field: SkillModField): number => cappedSkillMod(content.player.skillCaps, field, sumSkillMod(mods, field));
  const area: number = scaleOf(sum('areaPercent'));
  const delivery: Delivery = scaledDelivery(skill.delivery, {
    area,
    range: scaleOf(sum('rangePercent')),
    duration: scaleOf(sum('durationPercent')),
    projectiles: sum('projectiles'),
    pierce: sum('pierce'),
    chains: sum('chains'),
    falloff: sum('chainFalloff'),
    spread: sum('spread'),
  });
  const damageScale: number = scaleOf(sum('damagePercent')) * heldEchoScale(skill, sum('echo'));
  return {
    ...skill,
    delivery,
    vfx: widerWave(skill.vfx, area),
    damage: { type: skill.damage.type, weaponPercent: skill.damage.weaponPercent * damageScale, flatMin: skill.damage.flatMin * damageScale, flatMax: skill.damage.flatMax * damageScale },
    cooldown: skill.cooldown * scaleOf(sum('cooldownPercent')),
    manaCost: Math.round(skill.manaCost * scaleOf(sum('manaCostPercent'))),
    knockback: pulled(skill, sum),
    stagger: skill.stagger * scaleOf(sum('staggerPercent')),
    lifeOnHit: skill.lifeOnHit + sum('lifeOnHit'),
    leech: skill.leech + sum('leech'),
    ...echoOf(skill, sum('echo')),
    momentum: skill.momentum === null ? null : { ...skill.momentum, cap: Math.max(skill.momentum.perHit, skill.momentum.cap * scaleOf(sum('momentumCapPercent'))), grace: skill.momentum.grace * scaleOf(sum('momentumGracePercent')), lifePerHit: skill.momentum.lifePerHit + sum('lifePerHit') },
  };
}

export function resolveSkillBar(content: Content, bar: readonly (string | null)[], allocated: readonly string[], powers: readonly PowerDef[] = [], worn: readonly SkillVariant[] = [], held: string | null = ANY_WEAPON, chosen: ChangeChoice = {}): (SkillDef | null)[] {
  return bar.map((id: string | null): SkillDef | null => {
    const skill: SkillDef | undefined = id === null ? undefined : content.skills.get(id);
    return skill === undefined ? null : resolveSkill(content, skill, allocated, powers, worn, held, chosen);
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

export function expectedHit(stats: StatBlock, skill: SkillDef): number {
  const weapon: number = ((stats.damageMin + stats.damageMax) / 2) * (1 + stats.damagePercent) * skill.damage.weaponPercent;
  const flat: number = (skill.damage.flatMin + skill.damage.flatMax) / 2;
  const crit: number = 1 + Math.min(1, stats.critChance) * (stats.critMultiplier - 1);
  return (weapon + flat) * crit;
}

export function damagePerSecond(stats: StatBlock, skill: SkillDef): number {
  return expectedHit(stats, skill) / skillCycle(stats, skill);
}

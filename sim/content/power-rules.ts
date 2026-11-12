import type { SkillTarget } from './chart-types.ts';
import type { ItemBaseDef, PowerDef, PowerTriggerDef } from './item-types.ts';
import type { Content } from './types.ts';

function targetProblem(content: Content, owner: string, target: SkillTarget): string | null {
  if (target.type === 'skill') return content.skills.has(target.skill) ? null : `${owner} names unknown skill ${target.skill}`;
  return content.chart.groups.some((group): boolean => group.id === target.group) ? null : `${owner} names unknown skill group ${target.group}`;
}

function triggerProblems(content: Content, owner: string, trigger: PowerTriggerDef): string[] {
  const problems: string[] = [];
  const skill: string | null = trigger.skill === null ? null : targetProblem(content, owner, trigger.skill);
  if (skill !== null) problems.push(skill);
  if (trigger.on === 'pulse' && trigger.skill === null) problems.push(`${owner} pulses without naming the held skill`);
  if (!Number.isInteger(trigger.every)) problems.push(`${owner} fires every ${trigger.every}, which is not a whole count`);
  const effect = trigger.effect;
  switch (effect.type) {
    case 'cast':
      if (!content.skills.has(effect.skill)) problems.push(`${owner} casts unknown skill ${effect.skill}`);
      break;
    case 'buff':
      if (!Number.isInteger(effect.stacks)) problems.push(`${owner} stacks ${effect.stacks} times, which is not a whole count`);
      break;
  }
  return problems;
}

function powerProblems(content: Content, base: ItemBaseDef, power: PowerDef): string[] {
  const owner: string = `item ${base.id}`;
  const problems: string[] = [];
  if (!content.families.has(power.family)) problems.push(`${owner} belongs to unknown family ${power.family}`);
  for (const mod of power.skillMods) {
    const problem: string | null = targetProblem(content, owner, mod.target);
    if (problem !== null) problems.push(problem);
  }
  for (const variant of power.variants) {
    if (!content.skills.has(variant.skill)) problems.push(`${owner} varies unknown skill ${variant.skill}`);
    if (!content.skills.has(variant.becomes)) problems.push(`${owner} turns ${variant.skill} into unknown skill ${variant.becomes}`);
  }
  for (const trigger of power.triggers) problems.push(...triggerProblems(content, owner, trigger));
  return problems;
}

export function powerRuleProblems(content: Content): string[] {
  const problems: string[] = [];
  const named: boolean = content.rarities.some((rarity): boolean => rarity.powers);
  for (const base of content.itemBases.values()) {
    if (base.power === null) continue;
    if (!named) problems.push(`item ${base.id} has a power but no rarity carries powers`);
    if (base.slot === null) problems.push(`item ${base.id} has a power but no slot to wear it in`);
    problems.push(...powerProblems(content, base, base.power));
  }
  for (const family of content.families.values()) {
    if (![...content.itemBases.values()].some((base: ItemBaseDef): boolean => base.power?.family === family.id)) problems.push(`family ${family.id} has no pieces`);
  }
  return problems;
}

export function familyPieces(content: Content, family: string): readonly ItemBaseDef[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.power?.family === family);
}

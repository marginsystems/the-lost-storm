import type { SkillTarget } from './chart-types.ts';
import { targetProblem } from './power-rules.ts';
import type { AreaAura, AreaExposure } from './shape-types.ts';
import type { Content, SkillDef, SkillMod } from './types.ts';

function auraTargets(aura: AreaAura): readonly SkillTarget[] {
  return [...aura.skillMods.map((mod: SkillMod): SkillTarget => mod.target), ...aura.exposes.map((exposure: AreaExposure): SkillTarget => exposure.target)];
}

export function auraProblems(content: Content): readonly string[] {
  const problems: string[] = [];
  for (const skill of content.skills.values()) {
    const aura: AreaAura | null = auraOf(skill);
    if (aura === null) continue;
    for (const target of auraTargets(aura)) {
      const problem: string | null = targetProblem(content, `skill ${skill.id}'s aura`, target);
      if (problem !== null) problems.push(problem);
    }
  }
  return problems;
}

export function auraOf(skill: SkillDef): AreaAura | null {
  return skill.delivery.type === 'area' ? skill.delivery.aura : null;
}

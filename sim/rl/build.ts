import type { Fields } from '../content/read.ts';
import { ContentError, fields, nullableText, text, textList } from '../content/read.ts';
import type { Content, HeroDef, SkillTreeNodeDef } from '../content/types.ts';
import type { SkillUnlock } from '../content/shape-types.ts';
import type { JoinBlock } from '../progression.ts';
import { findNode, joinBlock } from '../progression.ts';
import { specialtyClosed } from '../specialty.ts';
import { RL } from './contract.ts';
import type { DuelKit } from './kit.ts';

export const BUILD = {
  level: 12,
  basicSlot: 0,
  slots: [1, 2, 3, 4],
  rollSlot: 5,
} as const;

export interface Build {
  readonly name: string;
  readonly weapon: string;
  readonly skills: readonly string[];
  readonly route: readonly string[];
  readonly hero: string | null;
}

const BUILD_KEYS: readonly string[] = ['name', 'weapon', 'skills', 'route', 'hero'];

export function readBuild(raw: unknown, where: string): Build {
  const source: Fields = fields(raw, where);
  const unknown: string[] = Object.keys(source).filter((key: string): boolean => !BUILD_KEYS.includes(key));
  if (unknown.length > 0) throw new ContentError(where, `unknown field ${unknown.join(', ')}; a build has ${BUILD_KEYS.join(', ')}`);
  return {
    name: text(source, 'name', where).trim(),
    weapon: text(source, 'weapon', where),
    skills: textList(source, 'skills', where),
    route: textList(source, 'route', where),
    hero: source['hero'] === undefined ? null : nullableText(source, 'hero', where),
  };
}

export function buildPoints(content: Content): number {
  return (BUILD.level - 1) * content.chart.pointsPerLevel;
}

export function basicSkill(content: Content): string | null {
  return content.player.skillBook[0]?.skill ?? null;
}

export function rollSkill(content: Content): string | null {
  return content.player.skillBook[1]?.skill ?? null;
}

function routeProblems(content: Content, route: readonly string[]): string[] {
  const points: number = buildPoints(content);
  const problems: string[] = [];
  const held: string[] = [];
  if (route.length > points) problems.push(`the route takes ${route.length} points, but level ${BUILD.level} gives ${points}`);
  route.forEach((id: string, index: number): void => {
    const step: string = `route place ${index + 1} (${id})`;
    const node: SkillTreeNodeDef | null = findNode(content, id);
    if (node === null) {
      problems.push(`${step} is not in the skill tree`);
      return;
    }
    if (held.includes(id)) {
      problems.push(`${step} is already taken earlier in the route`);
      return;
    }
    const block: JoinBlock | null = joinBlock(content, held, node);
    if (block === 'begin') problems.push(`${step} is not a starting place; the route must begin at one`);
    else if (block !== null) problems.push(`${step} does not join the places taken before it`);
    else if (specialtyClosed(content, held, node)) problems.push(`${step} opens a specialty beyond the limit of ${content.chart.specialtyLimit}`);
    held.push(id);
  });
  return problems;
}

function bookSkills(content: Content): string[] {
  return content.player.skillBook.filter((unlock: SkillUnlock): boolean => unlock.level <= BUILD.level).map((unlock: SkillUnlock): string => unlock.skill);
}

function skillProblems(content: Content, build: Build): string[] {
  const problems: string[] = [];
  if (build.skills.length > BUILD.slots.length) problems.push(`the bar holds ${BUILD.slots.length} skills besides the basic attack and the roll, but the build lists ${build.skills.length}`);
  const always: ReadonlySet<string | null> = new Set<string | null>([basicSkill(content), rollSkill(content)]);
  const unlocked: ReadonlySet<string> = new Set<string>([...bookSkills(content), ...build.route.flatMap((id: string): string[] => {
    const unlock: string | null = findNode(content, id)?.unlock ?? null;
    return unlock === null ? [] : [unlock];
  })]);
  build.skills.forEach((skill: string, index: number): void => {
    if (!content.skills.has(skill)) problems.push(`skill ${skill} does not exist`);
    else if (build.skills.indexOf(skill) !== index) problems.push(`skill ${skill} is on the bar twice`);
    else if (always.has(skill)) problems.push(`skill ${skill} is always on the bar; list only the skills for slots ${BUILD.slots.join(', ')}`);
    else if (!unlocked.has(skill)) problems.push(`skill ${skill} is not unlocked by the route or the skill book`);
  });
  return problems;
}

function heroProblems(content: Content, hero: string | null): string[] {
  if (hero === null || content.player.heroes.some((def: HeroDef): boolean => def.id === hero)) return [];
  return [`hero ${hero} is not one of ${content.player.heroes.map((def: HeroDef): string => def.id).join(', ')}`];
}

export function buildProblems(content: Content, kit: DuelKit, build: Build): string[] {
  const named: string[] = build.name === '' ? ['the build needs a name'] : [];
  const armed: string[] = kit.weapons.includes(build.weapon) ? [] : [`weapon ${build.weapon} is not a standard weapon; pick one of ${kit.weapons.join(', ')}`];
  return [...named, ...armed, ...heroProblems(content, build.hero), ...routeProblems(content, build.route), ...skillProblems(content, build)];
}

export function legalBuild(content: Content, kit: DuelKit, raw: unknown, where: string): Build {
  return mustBeLegal(content, kit, readBuild(raw, where), where);
}

export function mustBeLegal(content: Content, kit: DuelKit, build: Build, where: string): Build {
  const problems: readonly string[] = buildProblems(content, kit, build);
  if (problems.length > 0) throw new Error(`${where} ${build.name === '' ? '' : `"${build.name}" `}is not a legal build:\n- ${problems.join('\n- ')}`);
  return build;
}

export function buildBar(content: Content, build: Build): (string | null)[] {
  const bar: (string | null)[] = Array.from({ length: RL.slots }, (): string | null => null);
  bar[BUILD.basicSlot] = basicSkill(content);
  bar[BUILD.rollSlot] = rollSkill(content);
  BUILD.slots.forEach((slot: number, index: number): void => {
    bar[slot] = build.skills[index] ?? null;
  });
  return bar;
}

import type { ChartDef, ChartGroup, ChartPath, PointGrant, SkillTarget, SkillVariant } from './chart-types.ts';
import { conditions } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { choice, ContentError, each, fields, isFields, nonNegative, numeric, positive, text, textList } from './read.ts';
import type { Content, SkillMod, SkillTreeNodeDef, StatMod } from './types.ts';
import { MOD_OPS, REQUIRE_MODES, SKILL_MOD_FIELDS, STAT_IDS, TREE_NODE_KINDS } from './types.ts';

const TINT: RegExp = /^#[0-9a-f]{6}$/i;

export function statMod(value: unknown, where: string): StatMod {
  const source: Fields = fields(value, where);
  return { stat: choice(source, 'stat', STAT_IDS, where), op: choice(source, 'op', MOD_OPS, where), value: numeric(source, 'value', where) };
}

export function skillTarget(source: Fields, where: string): SkillTarget {
  const skill: unknown = source['skill'];
  const group: unknown = source['group'];
  if (typeof skill === 'string' && group === undefined) return { type: 'skill', skill };
  if (typeof group === 'string' && skill === undefined) return { type: 'group', group };
  throw new ContentError(where, 'expected exactly one of skill or group');
}

export function skillMod(value: unknown, where: string): SkillMod {
  const source: Fields = fields(value, where);
  return { target: skillTarget(source, where), field: choice(source, 'field', SKILL_MOD_FIELDS, where), value: numeric(source, 'value', where) };
}

function variant(value: unknown, where: string): SkillVariant | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), becomes: text(source, 'becomes', where) };
}

export function treeNode(value: unknown, where: string): SkillTreeNodeDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    kind: choice(source, 'kind', TREE_NODE_KINDS, where),
    path: text(source, 'path', where),
    column: numeric(source, 'column', where),
    row: numeric(source, 'row', where),
    requires: textList(source, 'requires', where),
    requireMode: choice(source, 'requireMode', REQUIRE_MODES, where),
    statMods: each(source['statMods'], `${where}.statMods`, statMod),
    skillMods: each(source['skillMods'], `${where}.skillMods`, skillMod),
    variant: variant(source['variant'], `${where}.variant`),
    unlock: source['unlock'] === undefined ? null : text(source, 'unlock', where),
  };
}

function chartPath(value: unknown, where: string): ChartPath {
  const source: Fields = fields(value, where);
  const tint: string = text(source, 'tint', where);
  if (!TINT.test(tint)) throw new ContentError(`${where}.tint`, 'expected a colour like #a1b2c3');
  return { id: text(source, 'id', where), name: text(source, 'name', where), tint, description: text(source, 'description', where) };
}

function chartGroup(value: unknown, where: string): ChartGroup {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where), skills: textList(source, 'skills', where) };
}

function pointGrant(value: unknown, where: string): PointGrant {
  const source: Fields = fields(value, where);
  const points: number = positive(source, 'points', where);
  if (!Number.isInteger(points)) throw new ContentError(`${where}.points`, 'expected a whole number');
  return { id: text(source, 'id', where), when: conditions(source, 'when', where), points };
}

export function chartDef(value: unknown, where: string): ChartDef {
  const source: Fields = fields(value, where);
  const respec: unknown = source['respec'];
  if (!isFields(respec)) throw new ContentError(`${where}.respec`, 'expected an object');
  const pointsPerLevel: number = positive(source, 'pointsPerLevel', where);
  if (!Number.isInteger(pointsPerLevel)) throw new ContentError(`${where}.pointsPerLevel`, 'expected a whole number');
  return {
    title: text(source, 'title', where),
    pointsPerLevel,
    respec: { goldPerPoint: nonNegative(respec, 'goldPerPoint', `${where}.respec`), goldPerLevel: nonNegative(respec, 'goldPerLevel', `${where}.respec`) },
    paths: each(source['paths'], `${where}.paths`, chartPath),
    groups: each(source['groups'], `${where}.groups`, chartGroup),
    grants: each(source['grants'], `${where}.grants`, pointGrant),
    twist: nonNegative(source, 'twist', where),
  };
}

function unique(ids: readonly string[]): boolean {
  return new Set<string>(ids).size === ids.length;
}

function targetProblem(content: Content, groups: ReadonlySet<string>, node: SkillTreeNodeDef, mod: SkillMod): string | null {
  const target: SkillTarget = mod.target;
  if (target.type === 'skill') return content.skills.has(target.skill) ? null : `tree node ${node.id} modifies unknown skill ${target.skill}`;
  return groups.has(target.group) ? null : `tree node ${node.id} modifies unknown skill group ${target.group}`;
}

function variantProblems(content: Content, node: SkillTreeNodeDef): string[] {
  if (node.variant === null) return [];
  const { skill, becomes } = node.variant;
  const problems: string[] = [];
  if (!content.skills.has(skill)) problems.push(`tree node ${node.id} varies unknown skill ${skill}`);
  if (!content.skills.has(becomes)) problems.push(`tree node ${node.id} turns ${skill} into unknown skill ${becomes}`);
  if (skill === becomes) problems.push(`tree node ${node.id} turns ${skill} into itself`);
  return problems;
}

export function chartProblems(content: Content): string[] {
  const problems: string[] = [];
  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  const nodeIds: ReadonlySet<string> = new Set<string>(nodes.map((node: SkillTreeNodeDef): string => node.id));
  const pathIds: ReadonlySet<string> = new Set<string>(content.chart.paths.map((path: ChartPath): string => path.id));
  const groupIds: ReadonlySet<string> = new Set<string>(content.chart.groups.map((group: ChartGroup): string => group.id));
  if (!unique(nodes.map((node: SkillTreeNodeDef): string => node.id))) problems.push('skill tree has duplicate node ids');
  if (!unique(nodes.map((node: SkillTreeNodeDef): string => `${node.column},${node.row}`))) problems.push('skill tree has two nodes on the same column and row');
  if (!unique(content.chart.paths.map((path: ChartPath): string => path.id))) problems.push('chart has duplicate path ids');
  if (!unique(content.chart.groups.map((group: ChartGroup): string => group.id))) problems.push('chart has duplicate skill group ids');
  if (!unique(content.chart.grants.map((grant: PointGrant): string => grant.id))) problems.push('chart has duplicate point grant ids');
  for (const group of content.chart.groups) {
    for (const skill of group.skills) if (!content.skills.has(skill)) problems.push(`skill group ${group.id} names unknown skill ${skill}`);
  }
  for (const node of nodes) {
    for (const required of node.requires) if (!nodeIds.has(required)) problems.push(`tree node ${node.id} requires unknown node ${required}`);
    if (!pathIds.has(node.path)) problems.push(`tree node ${node.id} is on unknown path ${node.path}`);
    for (const mod of node.skillMods) {
      const problem: string | null = targetProblem(content, groupIds, node, mod);
      if (problem !== null) problems.push(problem);
    }
    problems.push(...variantProblems(content, node));
  }
  return problems;
}

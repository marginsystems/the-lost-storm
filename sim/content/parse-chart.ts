import type { ChartCommon, ChartDef, ChartGroup, ChartPath, ChartRetired, CommonPlace, PointGrant, SkillTarget, SkillVariant, SpecialtyDef, WeaponGroup } from './chart-types.ts';
import { skillMod, statMod } from './parse-mods.ts';
import { powerTrigger } from './parse-powers.ts';
import { conditions } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { choice, choiceList, ContentError, each, fields, isFields, nonNegative, numeric, positive, text, textList } from './read.ts';
import type { Content, SkillDef, SkillMod, SkillTreeNodeDef, StanceMod, WeaponKind } from './types.ts';
import { STANCES, TREE_NODE_KINDS, WEAPON_KINDS } from './types.ts';

const TINT: RegExp = /^#[0-9a-f]{6}$/i;

const CHART_DEFAULTS = {
  lowLife: 0.35,
} as const;

function variant(value: unknown, where: string): SkillVariant {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), becomes: text(source, 'becomes', where) };
}

function stanceMod(value: unknown, where: string): StanceMod {
  const source: Fields = fields(value, where);
  return { when: choice(source, 'when', STANCES, where), statMods: each(source['statMods'], `${where}.statMods`, statMod) };
}

function nodeFields(source: Fields, where: string): Pick<SkillTreeNodeDef, 'id' | 'path' | 'column' | 'row' | 'requires'> {
  return { id: text(source, 'id', where), path: text(source, 'path', where), column: numeric(source, 'column', where), row: numeric(source, 'row', where), requires: textList(source, 'requires', where) };
}

function commonNode(source: Fields, where: string, places: readonly CommonPlace[]): SkillTreeNodeDef {
  const common: string = text(source, 'common', where);
  const place: CommonPlace | undefined = places.find((entry: CommonPlace): boolean => entry.id === common);
  if (place === undefined) throw new ContentError(`${where}.common`, `unknown common place ${common}`);
  return { ...nodeFields(source, where), name: place.name, description: place.description, icon: place.icon, kind: 'minor', statMods: place.statMods, skillMods: [], variants: [], unlock: null, weapon: null, triggers: [], stances: [], cluster: null, common, specialty: null };
}

export function treeNode(value: unknown, where: string, places: readonly CommonPlace[] = []): SkillTreeNodeDef {
  const source: Fields = fields(value, where);
  if (source['common'] !== undefined) return commonNode(source, where, places);
  return {
    ...nodeFields(source, where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    kind: choice(source, 'kind', TREE_NODE_KINDS, where),
    statMods: each(source['statMods'], `${where}.statMods`, statMod),
    skillMods: each(source['skillMods'], `${where}.skillMods`, skillMod),
    variants: source['variants'] === undefined ? [] : each(source['variants'], `${where}.variants`, variant),
    unlock: source['unlock'] === undefined ? null : text(source, 'unlock', where),
    weapon: source['weapon'] === undefined ? null : text(source, 'weapon', where),
    triggers: source['triggers'] === undefined ? [] : each(source['triggers'], `${where}.triggers`, powerTrigger),
    stances: source['stances'] === undefined ? [] : each(source['stances'], `${where}.stances`, stanceMod),
    cluster: source['cluster'] === undefined ? null : text(source, 'cluster', where),
    common: null,
    specialty: source['specialty'] === undefined ? null : text(source, 'specialty', where),
  };
}

function commonPlace(value: unknown, where: string): CommonPlace {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where), description: text(source, 'description', where), icon: text(source, 'icon', where), statMods: each(source['statMods'], `${where}.statMods`, statMod) };
}

function chartCommon(value: unknown, where: string): ChartCommon {
  if (value === undefined) return { name: 'Common', tint: '#c8ccd2', places: [] };
  const source: Fields = fields(value, where);
  const tint: string = text(source, 'tint', where);
  if (!TINT.test(tint)) throw new ContentError(`${where}.tint`, 'expected a colour like #a1b2c3');
  return { name: text(source, 'name', where), tint, places: each(source['places'], `${where}.places`, commonPlace) };
}

function specialtyDef(value: unknown, where: string): SpecialtyDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where), path: text(source, 'path', where), description: text(source, 'description', where) };
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

function weaponGroup(value: unknown, where: string): WeaponGroup {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where), kinds: choiceList(source, 'kinds', WEAPON_KINDS, where), starter: text(source, 'starter', where), needs: text(source, 'needs', where), icon: text(source, 'icon', where), holds: text(source, 'holds', where), path: text(source, 'path', where) };
}

function pointGrant(value: unknown, where: string): PointGrant {
  const source: Fields = fields(value, where);
  const points: number = positive(source, 'points', where);
  if (!Number.isInteger(points)) throw new ContentError(`${where}.points`, 'expected a whole number');
  return { id: text(source, 'id', where), when: conditions(source, 'when', where), points };
}

function renames(value: unknown, where: string): ReadonlyMap<string, string> {
  if (value === undefined) return new Map<string, string>();
  const source: Fields = fields(value, where);
  return new Map<string, string>(Object.keys(source).map((old: string): [string, string] => [old, text(source, old, where)]));
}

function retired(value: unknown, where: string): ChartRetired {
  if (value === undefined) return { places: new Map<string, string>(), skills: new Map<string, string>() };
  const source: Fields = fields(value, where);
  return { places: renames(source['places'], `${where}.places`), skills: renames(source['skills'], `${where}.skills`) };
}

function lowLife(source: Fields, where: string): number {
  if (source['lowLife'] === undefined) return CHART_DEFAULTS.lowLife;
  const share: number = positive(source, 'lowLife', where);
  if (share >= 1) throw new ContentError(`${where}.lowLife`, 'expected a share of life below 1');
  return share;
}

function specialtyLimit(source: Fields, where: string): number {
  if (source['specialtyLimit'] === undefined) return 1;
  const limit: number = positive(source, 'specialtyLimit', where);
  if (!Number.isInteger(limit)) throw new ContentError(`${where}.specialtyLimit`, 'expected a whole number');
  return limit;
}

export function chartDef(value: unknown, where: string): ChartDef {
  const source: Fields = fields(value, where);
  const respec: unknown = source['respec'];
  if (!isFields(respec)) throw new ContentError(`${where}.respec`, 'expected an object');
  const pointsPerLevel: number = positive(source, 'pointsPerLevel', where);
  if (!Number.isInteger(pointsPerLevel)) throw new ContentError(`${where}.pointsPerLevel`, 'expected a whole number');
  const revision: number = nonNegative(source, 'revision', where);
  if (!Number.isInteger(revision)) throw new ContentError(`${where}.revision`, 'expected a whole number');
  return {
    title: text(source, 'title', where),
    pointsPerLevel,
    revision,
    respec: { goldPerPoint: nonNegative(respec, 'goldPerPoint', `${where}.respec`), goldPerLevel: nonNegative(respec, 'goldPerLevel', `${where}.respec`) },
    paths: each(source['paths'], `${where}.paths`, chartPath),
    groups: each(source['groups'], `${where}.groups`, chartGroup),
    weaponGroups: each(source['weaponGroups'], `${where}.weaponGroups`, weaponGroup),
    grants: each(source['grants'], `${where}.grants`, pointGrant),
    twist: nonNegative(source, 'twist', where),
    retired: retired(source['retired'], `${where}.retired`),
    common: chartCommon(source['common'], `${where}.common`),
    specialties: source['specialties'] === undefined ? [] : each(source['specialties'], `${where}.specialties`, specialtyDef),
    specialtyLimit: specialtyLimit(source, where),
    lowLife: lowLife(source, where),
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
  const problems: string[] = [];
  for (const { skill, becomes } of node.variants) {
    if (!content.skills.has(skill)) problems.push(`tree node ${node.id} varies unknown skill ${skill}`);
    if (!content.skills.has(becomes)) problems.push(`tree node ${node.id} turns ${skill} into unknown skill ${becomes}`);
    if (skill === becomes) problems.push(`tree node ${node.id} turns ${skill} into itself`);
    if (node.variants.filter((other: SkillVariant): boolean => other.skill === skill).length > 1) problems.push(`tree node ${node.id} turns ${skill} two ways`);
  }
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
  for (const [old, now] of content.chart.retired.places) {
    if (nodeIds.has(old)) problems.push(`retired place ${old} is still on the chart`);
    if (!nodeIds.has(now)) problems.push(`retired place ${old} becomes unknown place ${now}`);
  }
  for (const [old, now] of content.chart.retired.skills) {
    if (content.player.skillBook.some((entry): boolean => entry.skill === old) || nodes.some((node: SkillTreeNodeDef): boolean => node.unlock === old)) problems.push(`retired skill ${old} can still be learned`);
    if (!content.skills.has(now)) problems.push(`retired skill ${old} becomes unknown skill ${now}`);
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
  problems.push(...rivalProblems(nodes));
  problems.push(...weaponProblems(content));
  problems.push(...specialtyProblems(content));
  return problems;
}

function specialtyProblems(content: Content): string[] {
  const problems: string[] = [];
  const specialties: readonly SpecialtyDef[] = content.chart.specialties;
  if (!unique(specialties.map((entry: SpecialtyDef): string => entry.id))) problems.push('chart has duplicate specialty ids');
  if (!unique(content.chart.common.places.map((place: CommonPlace): string => place.id))) problems.push('chart has duplicate common place ids');
  for (const specialty of specialties) {
    if (!content.chart.paths.some((path: ChartPath): boolean => path.id === specialty.path)) problems.push(`specialty ${specialty.id} belongs to unknown path ${specialty.path}`);
    const own: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.specialty === specialty.id);
    if (!own.some((node: SkillTreeNodeDef): boolean => node.kind === 'keystone')) problems.push(`specialty ${specialty.id} has no keystone`);
    for (const node of own) {
      if (node.path !== specialty.path) problems.push(`tree node ${node.id} of specialty ${specialty.id} is on path ${node.path}`);
      if (node.requires.length === 0) problems.push(`tree node ${node.id} of specialty ${specialty.id} is a starting place`);
    }
  }
  for (const node of content.skillTree) {
    if (node.specialty !== null && !specialties.some((entry: SpecialtyDef): boolean => entry.id === node.specialty)) problems.push(`tree node ${node.id} belongs to unknown specialty ${node.specialty}`);
  }
  return problems;
}

function weaponProblems(content: Content): string[] {
  const problems: string[] = [];
  const groups: readonly WeaponGroup[] = content.chart.weaponGroups;
  const groupIds: ReadonlySet<string> = new Set<string>(groups.map((group: WeaponGroup): string => group.id));
  if (!unique(groups.map((group: WeaponGroup): string => group.id))) problems.push('chart has duplicate weapon group ids');
  for (const kind of WEAPON_KINDS) {
    const holders: number = groups.filter((group: WeaponGroup): boolean => group.kinds.includes(kind)).length;
    if (holders === 0) problems.push(`weapon kind ${kind} is in no weapon group`);
    if (holders > 1) problems.push(`weapon kind ${kind} is in more than one weapon group`);
  }
  for (const group of groups) {
    if (group.kinds.length === 0) problems.push(`weapon group ${group.id} names no weapon kind`);
    if (!unique(group.kinds.map((kind: WeaponKind): string => kind))) problems.push(`weapon group ${group.id} names a weapon kind twice`);
    const starter = content.itemBases.get(group.starter);
    if (starter === undefined) problems.push(`weapon group ${group.id} starts with unknown item ${group.starter}`);
    else if (starter.weaponKind === null || !group.kinds.includes(starter.weaponKind)) problems.push(`weapon group ${group.id} starts with ${group.starter}, which is not one of its weapons`);
    if (!content.chart.paths.some((path: ChartPath): boolean => path.id === group.path)) problems.push(`weapon group ${group.id} belongs to unknown path ${group.path}`);
  }
  for (const skill of content.skills.values()) problems.push(...skillWeaponProblems(groupIds, skill));
  for (const node of content.skillTree) {
    if (node.weapon !== null && !groupIds.has(node.weapon)) problems.push(`tree node ${node.id} leans on unknown weapon group ${node.weapon}`);
  }
  return problems;
}

function skillWeaponProblems(groupIds: ReadonlySet<string>, skill: SkillDef): string[] {
  const weapon: string | undefined = skill.empowered?.weapon;
  return weapon === undefined || groupIds.has(weapon) ? [] : [`skill ${skill.id} is empowered by unknown weapon group ${weapon}`];
}

function rivalProblems(nodes: readonly SkillTreeNodeDef[]): string[] {
  const made: ReadonlySet<string> = new Set<string>(nodes.flatMap((node: SkillTreeNodeDef): string[] => node.variants.map((change: SkillVariant): string => change.becomes)));
  const turners: Map<string, string[]> = new Map<string, string[]>();
  for (const node of nodes) {
    for (const { skill } of node.variants) if (made.has(skill)) turners.set(skill, [...(turners.get(skill) ?? []), node.id]);
  }
  return [...turners].filter(([, places]: [string, string[]]): boolean => places.length > 1).map(([skill, places]: [string, string[]]): string => `${skill} is made on the tree and turned again by more than one place: ${places.join(', ')}`);
}

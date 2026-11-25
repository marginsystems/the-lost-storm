import type { Fields } from './content/read.ts';
import { ContentError, each, fields, numeric } from './content/read.ts';
import type { Content, PointGrant, SkillMod, SkillModField, SkillTreeNodeDef, Stance, StatMod, WeaponGroup } from './content/types.ts';
import { SKILL_MOD_FIELDS, STAT_IDS } from './content/types.ts';
import { isStartingPlace, placeLinks } from './progression.ts';
import { earnedPoints } from './save.ts';
import { inGroup, modTargets } from './stats.ts';
import { heldPlace } from './weapons.ts';

export const STACK = {
  beam: 6,
  branch: 6,
  slack: 1e-9,
} as const;

export const LOWER_IS_STRONGER: ReadonlySet<SkillModField> = new Set<SkillModField>(['cooldownPercent', 'manaCostPercent', 'momentumSteadyPercent']);

export type PlaceWeight = (node: SkillTreeNodeDef) => number;

export interface FoundStack {
  readonly total: number;
  readonly route: readonly string[];
}

export interface Situation {
  readonly moving: boolean;
  readonly life: 'low' | 'full' | 'between';
}

export const SITUATIONS: readonly Situation[] = [
  { moving: false, life: 'between' },
  { moving: true, life: 'between' },
  { moving: false, life: 'low' },
  { moving: true, life: 'low' },
  { moving: false, life: 'full' },
  { moving: true, life: 'full' },
];

export interface StatStack extends FoundStack {
  readonly key: string;
  readonly held: string;
  readonly situation: Situation;
  readonly skill: string | null;
}

export function heroPoints(content: Content, level: number): number {
  return earnedPoints(content, level, content.chart.grants.map((grant: PointGrant): string => grant.id));
}

interface TreeGraph {
  readonly nodes: readonly SkillTreeNodeDef[];
  readonly near: readonly (readonly number[])[];
  readonly starts: readonly number[];
  readonly specialty: readonly (string | null)[];
}

const GRAPHS: WeakMap<Content, TreeGraph> = new WeakMap<Content, TreeGraph>();

function treeGraph(content: Content): TreeGraph {
  const cached: TreeGraph | undefined = GRAPHS.get(content);
  if (cached !== undefined) return cached;
  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  const index: Map<string, number> = new Map<string, number>(nodes.map((node: SkillTreeNodeDef, at: number): [string, number] => [node.id, at]));
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const near: number[][] = nodes.map((node: SkillTreeNodeDef): number[] => (links.get(node.id) ?? []).flatMap((id: string): number[] => {
    const at: number | undefined = index.get(id);
    return at === undefined ? [] : [at];
  }));
  const starts: number[] = nodes.flatMap((node: SkillTreeNodeDef, at: number): number[] => (isStartingPlace(node) ? [at] : []));
  const graph: TreeGraph = { nodes, near, starts, specialty: nodes.map((node: SkillTreeNodeDef): string | null => node.specialty) };
  GRAPHS.set(content, graph);
  return graph;
}

interface State {
  readonly held: readonly boolean[];
  readonly order: readonly number[];
  readonly total: number;
  readonly specialties: readonly string[];
}

interface Reach {
  readonly dist: Int32Array;
  readonly gain: Float64Array;
  readonly from: Int32Array;
}

function freshOn(graph: TreeGraph, state: State, before: readonly string[], to: number): readonly string[] {
  const specialty: string | null = graph.specialty[to] ?? null;
  if (specialty === null || state.specialties.includes(specialty) || before.includes(specialty)) return before;
  return [...before, specialty];
}

function reach(graph: TreeGraph, state: State, weights: Float64Array, limit: number): Reach {
  const size: number = graph.nodes.length;
  const dist: Int32Array = new Int32Array(size).fill(-1);
  const gain: Float64Array = new Float64Array(size);
  const from: Int32Array = new Int32Array(size).fill(-1);
  const fresh: (readonly string[])[] = Array.from({ length: size }, (): readonly string[] => []);
  const room: number = limit - state.specialties.length;
  let layer: number[] = [];
  for (const at of state.order) {
    dist[at] = 0;
    layer.push(at);
  }
  let depth: number = 0;
  while (layer.length > 0) {
    depth += 1;
    const next: number[] = [];
    for (const at of layer) {
      for (const to of graph.near[at] ?? []) {
        const seen: number = dist[to] ?? -1;
        if (seen !== -1 && seen !== depth) continue;
        const crossed: readonly string[] = freshOn(graph, state, fresh[at] ?? [], to);
        if (crossed.length > room) continue;
        const offered: number = (gain[at] ?? 0) + (weights[to] ?? 0);
        if (seen === -1) next.push(to);
        else if (offered <= (gain[to] ?? 0)) continue;
        dist[to] = depth;
        gain[to] = offered;
        from[to] = at;
        fresh[to] = crossed;
      }
    }
    layer = next;
  }
  return { dist, gain, from };
}

function pathTo(state: State, found: Reach, target: number): number[] {
  const path: number[] = [];
  let at: number = target;
  while (at >= 0 && state.held[at] !== true) {
    path.push(at);
    at = found.from[at] ?? -1;
  }
  return path.toReversed();
}

function extend(graph: TreeGraph, state: State, path: readonly number[], weights: Float64Array, limit: number): State | null {
  const held: boolean[] = [...state.held];
  const specialties: string[] = [...state.specialties];
  let total: number = state.total;
  for (const at of path) {
    held[at] = true;
    total += weights[at] ?? 0;
    const specialty: string | null = graph.specialty[at] ?? null;
    if (specialty !== null && !specialties.includes(specialty)) specialties.push(specialty);
  }
  if (specialties.length > limit) return null;
  return { held, order: [...state.order, ...path], total, specialties };
}

interface Offer {
  readonly target: number;
  readonly cost: number;
  readonly gain: number;
}

function offers(graph: TreeGraph, state: State, found: Reach, weights: Float64Array, left: number): Offer[] {
  const list: Offer[] = [];
  for (let at: number = 0; at < graph.nodes.length; at += 1) {
    const cost: number = found.dist[at] ?? -1;
    const gain: number = found.gain[at] ?? 0;
    if (cost <= 0 || cost > left || (weights[at] ?? 0) <= 0 || gain <= 0) continue;
    list.push({ target: at, cost, gain });
  }
  return list.toSorted((a: Offer, b: Offer): number => {
    const ratio: number = b.gain / b.cost - a.gain / a.cost;
    return ratio !== 0 ? ratio : b.gain - a.gain;
  }).slice(0, STACK.branch);
}

function stateKey(state: State): string {
  return state.order.toSorted((a: number, b: number): number => a - b).join(',');
}

function better(a: State, b: State): number {
  const gained: number = b.total - a.total;
  return gained !== 0 ? gained : a.order.length - b.order.length;
}

function placeIndex(graph: TreeGraph, route: readonly string[]): number[] {
  return route.flatMap((id: string): number[] => {
    const at: number = graph.nodes.findIndex((node: SkillTreeNodeDef): boolean => node.id === id);
    return at < 0 ? [] : [at];
  });
}

function firstBeam(graph: TreeGraph, weights: Float64Array, limit: number, points: number, from: readonly string[]): State[] {
  if (points <= 0) return [];
  const empty: State = { held: graph.nodes.map((): boolean => false), order: [], total: 0, specialties: [] };
  if (from.length > 0) {
    const state: State | null = extend(graph, empty, placeIndex(graph, from).slice(0, points), weights, Number.POSITIVE_INFINITY);
    return state === null ? [] : [state];
  }
  return graph.starts.flatMap((start: number): State[] => {
    const state: State | null = extend(graph, empty, [start], weights, limit);
    return state === null ? [] : [state];
  });
}

export function bestStack(content: Content, weight: PlaceWeight, points: number, from: readonly string[] = []): FoundStack {
  const graph: TreeGraph = treeGraph(content);
  const weights: Float64Array = Float64Array.from(graph.nodes.map(weight));
  const limit: number = content.chart.specialtyLimit;
  let beam: State[] = firstBeam(graph, weights, limit, points, from);
  let best: State | null = beam.toSorted(better)[0] ?? null;
  while (beam.length > 0) {
    const next: Map<string, State> = new Map<string, State>();
    for (const state of beam) {
      const found: Reach = reach(graph, state, weights, limit);
      for (const offer of offers(graph, state, found, weights, points - state.order.length)) {
        const grown: State | null = extend(graph, state, pathTo(state, found, offer.target), weights, limit);
        if (grown !== null) next.set(stateKey(grown), grown);
      }
    }
    beam = [...next.values()].toSorted(better).slice(0, STACK.beam);
    const top: State | undefined = beam[0];
    if (top !== undefined && (best === null || better(top, best) < 0)) best = top;
  }
  return { total: best?.total ?? 0, route: (best?.order ?? []).flatMap((at: number): string[] => {
    const node: SkillTreeNodeDef | undefined = graph.nodes[at];
    return node === undefined ? [] : [node.id];
  }) };
}

function stanceHolds(stance: Stance, situation: Situation): boolean {
  switch (stance) {
    case 'moving':
      return situation.moving;
    case 'still':
      return !situation.moving;
    case 'low_life':
      return situation.life === 'low';
    case 'full_life':
      return situation.life === 'full';
  }
  return false;
}

export function liveStatMods(node: SkillTreeNodeDef, held: string, situation: Situation): StatMod[] {
  const live: SkillTreeNodeDef = heldPlace(node, held);
  return [...live.statMods, ...live.stances.filter((mod): boolean => stanceHolds(mod.when, situation)).flatMap((mod): readonly StatMod[] => mod.statMods)];
}

export function statKey(mod: Pick<StatMod, 'stat' | 'op'>): string {
  return `${mod.stat} ${mod.op}`;
}

function statWeight(key: string, held: string, situation: Situation): PlaceWeight {
  return (node: SkillTreeNodeDef): number => liveStatMods(node, held, situation).filter((mod: StatMod): boolean => statKey(mod) === key).reduce((sum: number, mod: StatMod): number => sum + mod.value, 0);
}

export function skillModValue(content: Content, node: SkillTreeNodeDef, skill: string, field: SkillModField): number {
  const sign: number = LOWER_IS_STRONGER.has(field) ? -1 : 1;
  return node.skillMods.filter((mod: SkillMod): boolean => mod.field === field && modTargets(content, mod, [skill])).reduce((sum: number, mod: SkillMod): number => sum + sign * mod.value, 0);
}

export function treeStatKeys(content: Content): string[] {
  const keys: Set<string> = new Set<string>();
  for (const node of content.skillTree) {
    for (const mod of node.statMods) keys.add(statKey(mod));
    for (const stance of node.stances) for (const mod of stance.statMods) keys.add(statKey(mod));
  }
  return [...keys].toSorted();
}

export function treeSkillFields(content: Content): SkillModField[] {
  const granted: Set<SkillModField> = new Set<SkillModField>();
  for (const node of content.skillTree) for (const mod of node.skillMods) granted.add(mod.field);
  return [...granted].toSorted();
}

export function treeTargetSkills(content: Content): string[] {
  const skills: Set<string> = new Set<string>();
  for (const node of content.skillTree) {
    for (const mod of node.skillMods) {
      const target = mod.target;
      if (target.type === 'skill') skills.add(target.skill);
      else for (const skill of content.skills.keys()) if (inGroup(content, target.group, skill)) skills.add(skill);
    }
  }
  return [...skills].toSorted();
}

function weaponIds(content: Content): string[] {
  return content.chart.weaponGroups.map((group: WeaponGroup): string => group.id);
}

function stanceStat(content: Content, key: string): boolean {
  return content.skillTree.some((node: SkillTreeNodeDef): boolean => node.stances.some((stance): boolean => stance.statMods.some((mod: StatMod): boolean => statKey(mod) === key)));
}

function weaponStat(content: Content, key: string): boolean {
  return content.skillTree.some((node: SkillTreeNodeDef): boolean => node.weapon !== null && [...node.statMods, ...node.stances.flatMap((stance): readonly StatMod[] => stance.statMods)].some((mod: StatMod): boolean => statKey(mod) === key));
}

function topOf(list: readonly StatStack[]): StatStack | null {
  return list.reduce<StatStack | null>((best: StatStack | null, entry: StatStack): StatStack => (best === null || entry.total > best.total ? entry : best), null);
}

export function statStack(content: Content, key: string, points: number): StatStack | null {
  const helds: readonly string[] = weaponStat(content, key) ? weaponIds(content) : weaponIds(content).slice(0, 1);
  const situations: readonly Situation[] = stanceStat(content, key) ? SITUATIONS : SITUATIONS.slice(0, 1);
  const found: StatStack[] = helds.flatMap((held: string): StatStack[] => situations.map((situation: Situation): StatStack => {
    const stack: FoundStack = bestStack(content, statWeight(key, held, situation), points);
    return { key, held, situation, skill: null, total: stack.total, route: stack.route };
  }));
  return topOf(found);
}

export function skillStack(content: Content, field: SkillModField, points: number): StatStack | null {
  const held: string = weaponIds(content)[0] ?? '';
  const found: StatStack[] = treeTargetSkills(content).flatMap((skill: string): StatStack[] => {
    if (!content.skillTree.some((node: SkillTreeNodeDef): boolean => skillModValue(content, node, skill, field) > 0)) return [];
    const stack: FoundStack = bestStack(content, (node: SkillTreeNodeDef): number => skillModValue(content, node, skill, field), points);
    return [{ key: `skill ${field}`, held, situation: SITUATIONS[0] ?? { moving: false, life: 'between' }, skill, total: stack.total, route: stack.route }];
  });
  return topOf(found);
}

export function treeStacks(content: Content, points: number): StatStack[] {
  const stats: StatStack[] = treeStatKeys(content).flatMap((key: string): StatStack[] => {
    const found: StatStack | null = statStack(content, key, points);
    return found === null ? [] : [found];
  });
  const skills: StatStack[] = treeSkillFields(content).flatMap((field: SkillModField): StatStack[] => {
    const found: StatStack | null = skillStack(content, field, points);
    return found === null ? [] : [found];
  });
  return [...stats, ...skills];
}

export interface TreeBudgets {
  readonly level: number;
  readonly limits: ReadonlyMap<string, number>;
}

const STAT_OPS: ReadonlySet<string> = new Set<string>(['add', 'percent']);

function statBudgetKey(key: string, where: string): string {
  const [stat = '', op = ''] = key.split(' ');
  if (!STAT_IDS.some((id: string): boolean => id === stat) || !STAT_OPS.has(op)) throw new ContentError(where, `${key} is not a stat and an op such as "maxLife add"`);
  return key;
}

function skillBudgetKey(key: string, where: string): string {
  if (!SKILL_MOD_FIELDS.some((field: string): boolean => field === key)) throw new ContentError(where, `${key} is not a skill field`);
  return `skill ${key}`;
}

function limitsOf(raw: unknown, where: string, keyOf: (key: string, at: string) => string): [string, number][] {
  const source: Fields = fields(raw, where);
  return Object.keys(source).map((key: string): [string, number] => [keyOf(key, `${where}.${key}`), numeric(source, key, where)]);
}

export function readBudgets(raw: unknown, where: string): TreeBudgets {
  const source: Fields = fields(raw, where);
  const level: number = numeric(source, 'level', where);
  return { level, limits: new Map<string, number>([...limitsOf(source['stats'], `${where}.stats`, statBudgetKey), ...limitsOf(source['skills'], `${where}.skills`, skillBudgetKey)]) };
}

export function readBudgetLevels(raw: unknown, where: string): TreeBudgets[] {
  const levels: TreeBudgets[] = each(fields(raw, where)['levels'], `${where}.levels`, readBudgets);
  if (levels.length === 0) throw new ContentError(`${where}.levels`, 'expected at least one level');
  levels.forEach((budgets: TreeBudgets, at: number): void => {
    const before: TreeBudgets | undefined = levels[at - 1];
    if (before !== undefined && budgets.level <= before.level) throw new ContentError(`${where}.levels[${at}]`, 'expected levels in rising order');
  });
  return levels;
}

export interface BudgetMiss {
  readonly stack: StatStack;
  readonly budget: number;
}

export function overBudget(stacks: readonly StatStack[], budgets: TreeBudgets): BudgetMiss[] {
  return stacks.flatMap((stack: StatStack): BudgetMiss[] => {
    const budget: number | undefined = budgets.limits.get(stack.key);
    return budget !== undefined && stack.total > budget + STACK.slack ? [{ stack, budget }] : [];
  });
}

export function unbudgeted(stacks: readonly StatStack[], budgets: TreeBudgets): string[] {
  return stacks.filter((stack: StatStack): boolean => !budgets.limits.has(stack.key)).map((stack: StatStack): string => stack.key);
}

export function describeMiss(miss: BudgetMiss): string {
  const { stack } = miss;
  const target: string = stack.skill === null ? '' : ` for ${stack.skill}`;
  return `${stack.key}${target} stacks to ${Math.round(stack.total * 1000) / 1000}, over its budget of ${miss.budget}, holding ${stack.held}${stack.situation.moving ? ' while moving' : ''}${stack.situation.life === 'between' ? '' : ` at ${stack.situation.life} life`}, through ${stack.route.join(', ')}`;
}

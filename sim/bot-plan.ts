import type { Content, ItemSlot, SkillDef, SkillTreeNodeDef, StatBlock } from './content/types.ts';
import { emptyEquipment, slotOf } from './items.ts';
import type { ReadonlyVec2 } from './math.ts';
import { distance } from './math.ts';
import { canAllocate, placeLinks, startingPlaces } from './progression.ts';
import { wornPowers, wornVariants } from './powers.ts';
import { armourReduction, computeStats, damagePerSecond, resolveSkill } from './stats.ts';
import type { ChangeChoice } from './stats.ts';
import { heldGroup } from './weapons.ts';
import { heldAtLine, strikeWaiting } from './world/count.ts';
import { canDash } from './world/dash.ts';
import { playerMayStrike } from './world/factions.ts';
import { blockedFlask } from './world/flasks.ts';
import { upgradeReady } from './world/flask-tiers.ts';
import { glidesWith, MOMENTUM, momentumShare } from './world/momentum.ts';
import { chargeOf, spunSkill } from './world/skills.ts';
import type { Command, Equipment, FlaskState, ItemInstance, MonsterState, PlayerState, World } from './world/types.ts';

export const BOT_PLAN = {
  channelSeconds: 1.6,
  chargeRelease: 0.95,
  crowdReach: 4,
  crowd: 2,
  stormLead: 6,
  manaFloor: 0.25,
  upgradeMargin: 1.02,
  spinSight: 14,
  spinGapCost: 0.15,
  spendShare: 0.6,
} as const;

export type PlayStyle = 'stand' | 'range' | 'kite';

export type WeaponKind = 'any' | 'plain' | 'varied';

export interface GearWeights {
  readonly dps: number;
  readonly toughness: number;
  readonly mobility: number;
}

export const STAND_WEIGHTS: GearWeights = { dps: 1, toughness: 1, mobility: 0 };

export interface BotPlan {
  readonly name: string;
  readonly flaskAt: number | null;
  readonly manaFlaskAt: number | null;
  readonly rolls: boolean;
  readonly loot: boolean;
  readonly lineSeconds: number;
  readonly readSeconds: number;
  readonly paths: readonly string[];
  readonly skills: readonly string[];
  readonly route: readonly string[];
  readonly weights: GearWeights;
  readonly focus: string | null;
  readonly style: PlayStyle;
  readonly keepGap: number;
  readonly weapons: WeaponKind;
  readonly avoid: readonly string[];
}

export interface Power {
  readonly dps: number;
  readonly toughness: number;
  readonly itemLevels: number;
  readonly mobility: number;
}

function preference(plan: BotPlan, skill: string): number {
  const rank: number = plan.skills.indexOf(skill);
  return rank < 0 ? plan.skills.length : rank;
}

function abilityRank(plan: BotPlan, node: SkillTreeNodeDef): number {
  return node.unlock === null ? plan.skills.length : preference(plan, node.unlock);
}

const DEPTHS: WeakMap<Content, ReadonlyMap<string, number>> = new WeakMap<Content, ReadonlyMap<string, number>>();

function depthsOf(content: Content): ReadonlyMap<string, number> {
  const cached: ReadonlyMap<string, number> | undefined = DEPTHS.get(content);
  if (cached !== undefined) return cached;
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const queue: string[] = startingPlaces(content);
  const depths: Map<string, number> = new Map<string, number>(queue.map((id: string): [string, number] => [id, 0]));
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string | undefined = queue[index];
    if (at === undefined) continue;
    const here: number = depths.get(at) ?? 0;
    for (const next of links.get(at) ?? []) {
      if (depths.has(next)) continue;
      depths.set(next, here + 1);
      queue.push(next);
    }
  }
  DEPTHS.set(content, depths);
  return depths;
}

function depthOf(content: Content, node: SkillTreeNodeDef): number {
  return depthsOf(content).get(node.id) ?? content.skillTree.length;
}

function weightOf(node: SkillTreeNodeDef): number {
  switch (node.kind) {
    case 'keystone':
      return 0;
    case 'notable':
      return 1;
    case 'minor':
      return 2;
  }
  return 2;
}

function byKeys(a: readonly number[], b: readonly number[]): number {
  for (const [index, value] of a.entries()) {
    const other: number = b[index] ?? 0;
    if (value !== other) return value - other;
  }
  return 0;
}

function placeOf(content: Content, id: string): SkillTreeNodeDef | undefined {
  return content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
}

function sideBranch(node: SkillTreeNodeDef): boolean {
  return node.common !== null || node.specialty !== null || node.cluster !== null;
}

function passable(node: SkillTreeNodeDef | undefined, goal: SkillTreeNodeDef | undefined): boolean {
  if (node === undefined || goal === undefined) return true;
  if (node.common !== null && goal.common === null && goal.cluster === null) return false;
  if (node.cluster !== null && goal.cluster === null) return false;
  return node.specialty === null || node.specialty === goal.specialty;
}

function stepToward(content: Content, allocated: readonly string[], points: number, target: string): string | null {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const goal: SkillTreeNodeDef | undefined = placeOf(content, target);
  const sources: readonly string[] = allocated.length > 0 ? allocated : startingPlaces(content);
  const before: Map<string, string | null> = new Map<string, string | null>(sources.map((id: string): [string, string | null] => [id, null]));
  const queue: string[] = [...sources];
  for (let index: number = 0; index < queue.length && !before.has(target); index += 1) {
    const at: string | undefined = queue[index];
    if (at === undefined) continue;
    for (const next of links.get(at) ?? []) {
      if (before.has(next) || !passable(placeOf(content, next), goal)) continue;
      before.set(next, at);
      queue.push(next);
    }
  }
  if (!before.has(target)) return null;
  let step: string = target;
  for (let parent: string | null | undefined = before.get(step); parent !== null && parent !== undefined && (allocated.length === 0 || !allocated.includes(parent)); parent = before.get(step)) step = parent;
  return canAllocate(content, allocated, points, step) ? step : null;
}

function routeStep(content: Content, allocated: readonly string[], points: number, route: readonly string[]): string | null {
  for (const target of route) {
    if (allocated.includes(target)) continue;
    const step: string | null = stepToward(content, allocated, points, target);
    if (step !== null) return step;
  }
  return null;
}

function pathsHeld(content: Content, allocated: readonly string[]): string[] {
  const counts: Map<string, number> = new Map<string, number>();
  for (const node of content.skillTree) if (allocated.includes(node.id)) counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
  return [...counts].toSorted((a: [string, number], b: [string, number]): number => b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]).map(([path]: [string, number]): string => path);
}

export function nextPlace(content: Content, plan: BotPlan, allocated: readonly string[], points: number): string | null {
  if (points <= 0) return null;
  const routed: string | null = routeStep(content, allocated, points, plan.route);
  if (routed !== null) return routed;
  const paths: readonly string[] = plan.paths.length > 0 ? plan.paths : pathsHeld(content, allocated);
  if (paths.length === 0) return null;
  const counts: Map<string, number> = new Map<string, number>(paths.map((path: string): [string, number] => [path, 0]));
  for (const id of allocated) {
    const node: SkillTreeNodeDef | undefined = content.skillTree.find((candidate: SkillTreeNodeDef): boolean => candidate.id === id);
    if (node !== undefined && counts.has(node.path)) counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
  }
  const open: SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => counts.has(node.path) && !sideBranch(node) && (node.kind !== 'keystone' || plan.route.includes(node.id)) && canAllocate(content, allocated, points, node.id));
  const key = (node: SkillTreeNodeDef): number[] => [abilityRank(plan, node), counts.get(node.path) ?? 0, paths.indexOf(node.path), depthOf(content, node), weightOf(node)];
  const ranked: SkillTreeNodeDef[] = open.toSorted((a: SkillTreeNodeDef, b: SkillTreeNodeDef): number => byKeys([...key(a), a.id.localeCompare(b.id)], [...key(b), 0]));
  return ranked[0]?.id ?? null;
}

function toughnessOf(content: Content, stats: StatBlock): number {
  return stats.maxLife / Math.max(0.05, 1 - armourReduction(stats.armour, content.player.resistance.armourCap));
}

export function powerOf(content: Content, level: number, equipped: Equipment, allocated: readonly string[], focus: string | null = null, changes: ChangeChoice = {}): Power {
  const stats: StatBlock = computeStats(content, level, equipped, allocated);
  const base: SkillDef | undefined = content.skills.get(focus ?? content.player.skillBar[0]?.skill ?? '');
  const skill: SkillDef | undefined = base === undefined ? undefined : resolveSkill(content, base, allocated, wornPowers(content, equipped), wornVariants(content, equipped), heldGroup(content, equipped), changes);
  const items: number = Object.values(equipped).reduce((sum: number, item: ItemInstance | null): number => sum + (item?.level ?? 0), 0);
  return { dps: skill === undefined ? 0 : damagePerSecond(stats, skill), toughness: toughnessOf(content, stats), itemLevels: items, mobility: stats.moveSpeed };
}

export function scoreOf(power: Power, weights: GearWeights): number {
  return Math.pow(Math.max(power.dps, 1e-6), weights.dps) * Math.pow(Math.max(power.toughness, 1e-6), weights.toughness) * Math.pow(Math.max(power.mobility, 1e-6), weights.mobility);
}

function wanted(content: Content, plan: BotPlan, item: ItemInstance, slot: ItemSlot): boolean {
  if (slot !== 'weapon' || plan.weapons === 'any') return true;
  const varied: boolean = wornVariants(content, { ...emptyEquipment(), weapon: item }).length > 0;
  return plan.weapons === 'varied' ? varied : !varied;
}

export function upgradeIndex(world: World, plan: BotPlan): number | null {
  const player: PlayerState = world.player;
  const now: number = scoreOf(powerOf(world.content, player.level, player.equipped, player.allocated, plan.focus, player.changes), plan.weights);
  let best: number | null = null;
  let bestScore: number = now * BOT_PLAN.upgradeMargin;
  for (const [index, item] of player.inventory.entries()) {
    if (item === null) continue;
    const slot: ItemSlot | null = slotOf(world.content, item);
    if (slot === null || !wanted(world.content, plan, item, slot)) continue;
    const score: number = scoreOf(powerOf(world.content, player.level, { ...player.equipped, [slot]: item }, player.allocated, plan.focus, player.changes), plan.weights);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return best;
}

export function junkIndex(world: World, plan: BotPlan): number | null {
  const player: PlayerState = world.player;
  if (player.inventory.includes(null)) return null;
  let worst: number | null = null;
  let worstScore: number = Infinity;
  for (const [index, item] of player.inventory.entries()) {
    const slot: ItemSlot | null = item === null ? null : slotOf(world.content, item);
    if (item === null || slot === null) continue;
    const score: number = wanted(world.content, plan, item, slot) ? scoreOf(powerOf(world.content, player.level, { ...player.equipped, [slot]: item }, player.allocated, plan.focus, player.changes), plan.weights) : 0;
    if (score < worstScore) {
      worst = index;
      worstScore = score;
    }
  }
  return worst;
}

function wantsFlask(player: PlayerState, flask: FlaskState, plan: BotPlan): boolean {
  if (blockedFlask(player, flask) !== null || flask.doses.length > 0) return false;
  switch (flask.def.resource) {
    case 'life':
      return plan.flaskAt !== null && player.life < player.maxLife * plan.flaskAt;
    case 'mana':
      return plan.manaFlaskAt !== null && player.mana < player.stats.maxMana * plan.manaFlaskAt;
  }
  return false;
}

export function flaskCommands(world: World, plan: BotPlan): Command[] {
  const player: PlayerState = world.player;
  if (!player.alive) return [];
  return player.flasks.flatMap((flask: FlaskState, slot: number): Command[] => (wantsFlask(player, flask, plan) ? [{ type: 'flask', slot }] : []));
}

function reachOf(skill: SkillDef): number {
  const delivery = skill.delivery;
  return delivery.type === 'nova' ? delivery.radius : BOT_PLAN.crowdReach;
}

export function shopCommands(world: World): Command[] {
  if (world.service?.kind !== 'vendor') return [];
  const buyable: FlaskState | undefined = world.player.flasks.find((flask: FlaskState): boolean => upgradeReady(world.content, world.player, flask));
  return buyable === undefined ? [] : [{ type: 'trade', action: { type: 'upgrade_flask', flask: buyable.def.id } }];
}

export function spinAim(world: World, skill: SkillDef): ReadonlyVec2 | null {
  const player: PlayerState = world.player;
  const reach: number = reachOf(spunSkill(player, skill));
  const foes: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && playerMayStrike(world, monster) && !heldAtLine(world, monster) && !strikeWaiting(world, monster) && distance(monster.pos, player.pos) <= BOT_PLAN.spinSight);
  let best: MonsterState | null = null;
  let bestScore: number = -Infinity;
  for (const foe of foes) {
    const score: number = crowdNear(foes, foe.pos, reach) - distance(foe.pos, player.pos) * BOT_PLAN.spinGapCost;
    if (score > bestScore) {
      best = foe;
      bestScore = score;
    }
  }
  return best === null ? null : { x: best.pos.x, z: best.pos.z };
}

export function letGoCommands(world: World): Command[] {
  const player: PlayerState = world.player;
  const action = player.action;
  if (action === null || action.slot === null || action.skill.press?.type !== 'charge' || !player.held.includes(action.slot)) return [];
  return [{ type: 'hold', slot: action.slot, down: false }];
}

export function releaseCommands(world: World, focus: number | null = null, keepGap: number = 0): Command[] {
  const player: PlayerState = world.player;
  const action = player.action;
  const press = action?.skill.press ?? null;
  if (action === null || action.slot === null || press === null || !player.held.includes(action.slot)) return [];
  const up: Command = { type: 'hold', slot: action.slot, down: false };
  switch (press.type) {
    case 'travel': {
      const foe = world.monsters.find((monster: MonsterState): boolean => monster.id === focus && playerMayStrike(world, monster));
      const aim: ReadonlyVec2 | null = foe?.pos ?? action.goal;
      const reach: number = foe === undefined ? MOMENTUM.arrive : foe.radius + Math.max(keepGap, player.radius + MOMENTUM.arrive);
      return aim === null || distance(player.pos, aim) <= reach ? [up] : [{ type: 'steer', aim }];
    }
    case 'charge':
      return chargeOf(action) >= BOT_PLAN.chargeRelease ? [up] : [];
    case 'channel': {
      if (!glidesWith(press)) return action.elapsed >= BOT_PLAN.channelSeconds ? [up] : [];
      const aim: ReadonlyVec2 | null = spinAim(world, action.skill);
      return aim === null || spendReady(player, aim) ? [up] : [{ type: 'steer', aim }];
    }
  }
  return [];
}

function spends(skill: SkillDef | null): skill is SkillDef {
  return skill !== null && skill.spend !== null;
}

function spendReady(player: PlayerState, aim: ReadonlyVec2): boolean {
  if (momentumShare(player) < BOT_PLAN.spendShare) return false;
  return player.skills.some((skill: SkillDef | null): boolean => spends(skill) && ready(player, skill) && distance(aim, player.pos) <= skill.engageRange);
}

function deals(skill: SkillDef): boolean {
  return skill.damage.weaponPercent > 0 || skill.damage.flatMax > 0;
}

function ready(player: PlayerState, skill: SkillDef): boolean {
  return (player.cooldowns[skill.id] ?? 0) <= 0 && player.mana >= skill.manaCost;
}

function crowdNear(foes: readonly MonsterState[], at: ReadonlyVec2, reach: number): number {
  return foes.filter((foe: MonsterState): boolean => distance(foe.pos, at) <= reach + foe.radius).length;
}

function formsUnderfoot(skill: SkillDef): boolean {
  return skill.delivery.type === 'area' && skill.delivery.anchor === 'ground' && skill.delivery.range === 0;
}

function worthCasting(plan: BotPlan, player: PlayerState, skill: SkillDef, target: MonsterState, foes: readonly MonsterState[]): boolean {
  if (spends(skill) && momentumShare(player) < BOT_PLAN.spendShare) return false;
  const gap: number = distance(target.pos, player.pos) - target.radius;
  if (skill.press?.type === 'travel') return gap > Math.max(plan.keepGap, player.stats.moveSpeed);
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'nova':
      return crowdNear(foes, player.pos, delivery.radius) >= Math.min(BOT_PLAN.crowd, foes.length);
    case 'area':
      if (delivery.anchor === 'caster') return crowdNear(foes, player.pos, delivery.radius) >= Math.min(BOT_PLAN.crowd, foes.length);
      if (formsUnderfoot(skill)) return crowdNear(foes, player.pos, delivery.radius + BOT_PLAN.stormLead) >= Math.min(BOT_PLAN.crowd, foes.length);
      return gap <= delivery.range + delivery.length;
    case 'arc':
    case 'projectile':
    case 'chain':
    case 'beam':
    case 'mark':
    case 'field':
      return gap <= skill.engageRange;
    case 'blink':
      return plan.style === 'stand' && gap > BOT_PLAN.crowdReach && gap <= delivery.range;
    case 'dash':
    case 'revive':
      return false;
  }
  return false;
}

export function planAttack(world: World, plan: BotPlan, target: MonsterState, foes: readonly MonsterState[]): Command[] {
  const player: PlayerState = world.player;
  const spare: boolean = player.mana >= player.stats.maxMana * BOT_PLAN.manaFloor;
  const order: number[] = player.skills
    .map((_skill: SkillDef | null, slot: number): number => slot)
    .filter((slot: number): boolean => slot > 0)
    .toSorted((a: number, b: number): number => preference(plan, player.skills[a]?.id ?? '') - preference(plan, player.skills[b]?.id ?? ''));
  for (const slot of order) {
    const skill: SkillDef | null = player.skills[slot] ?? null;
    if (skill === null || plan.avoid.includes(skill.id) || (!deals(skill) && skill.press?.type !== 'travel') || !ready(player, skill) || (!spare && skill.manaCost > 0 && foes.length < BOT_PLAN.crowd)) continue;
    if (!worthCasting(plan, player, skill, target, foes)) continue;
    const press: Command[] = skill.press === null ? [] : [{ type: 'hold', slot, down: true }];
    return [...press, { type: 'skill', slot, aim: target.pos, targetId: target.id }];
  }
  const first: SkillDef | null = player.skills[0] ?? null;
  const basic: Command[] = first === null || first.press === null ? [] : [{ type: 'hold', slot: 0, down: true }];
  return [...basic, { type: 'skill', slot: 0, aim: target.pos, targetId: target.id }];
}

export function rollCommand(world: World, refuge: ReadonlyVec2): Command | null {
  const player: PlayerState = world.player;
  if (!canDash(player)) return null;
  const slot: number = player.skills.findIndex((skill: SkillDef | null): boolean => skill !== null && skill.delivery.type === 'dash' && ready(player, skill));
  return slot < 0 ? null : { type: 'skill', slot, aim: refuge, targetId: null };
}

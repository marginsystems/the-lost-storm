import type { Content, ItemSlot, SkillDef, SkillTreeNodeDef, StatBlock } from './content/types.ts';
import { slotOf } from './items.ts';
import type { ReadonlyVec2 } from './math.ts';
import { distance } from './math.ts';
import { canAllocate } from './progression.ts';
import { armourReduction, computeStats, damagePerSecond } from './stats.ts';
import { canDash } from './world/dash.ts';
import { blockedFlask } from './world/flasks.ts';
import { chargeOf } from './world/skills.ts';
import type { Command, Equipment, FlaskState, ItemInstance, MonsterState, PlayerState, World } from './world/types.ts';

export const BOT_PLAN = {
  channelSeconds: 1.6,
  chargeRelease: 0.95,
  crowdReach: 4,
  crowd: 2,
  manaFloor: 0.25,
  upgradeMargin: 1.02,
} as const;

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
}

export interface Power {
  readonly dps: number;
  readonly toughness: number;
  readonly itemLevels: number;
}

function preference(plan: BotPlan, skill: string): number {
  const rank: number = plan.skills.indexOf(skill);
  return rank < 0 ? plan.skills.length : rank;
}

function abilityRank(plan: BotPlan, node: SkillTreeNodeDef): number {
  return node.unlock === null ? plan.skills.length : preference(plan, node.unlock);
}

function depthOf(content: Content, node: SkillTreeNodeDef, seen: ReadonlySet<string>): number {
  if (node.requires.length === 0 || seen.has(node.id)) return 0;
  const next: Set<string> = new Set<string>([...seen, node.id]);
  const depths: number[] = node.requires.flatMap((id: string): number[] => {
    const parent: SkillTreeNodeDef | undefined = content.skillTree.find((candidate: SkillTreeNodeDef): boolean => candidate.id === id);
    return parent === undefined ? [] : [depthOf(content, parent, next)];
  });
  return 1 + Math.min(...depths);
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

export function nextPlace(content: Content, plan: BotPlan, allocated: readonly string[], points: number): string | null {
  if (points <= 0 || plan.paths.length === 0) return null;
  const counts: Map<string, number> = new Map<string, number>(plan.paths.map((path: string): [string, number] => [path, 0]));
  for (const id of allocated) {
    const node: SkillTreeNodeDef | undefined = content.skillTree.find((candidate: SkillTreeNodeDef): boolean => candidate.id === id);
    if (node !== undefined && counts.has(node.path)) counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
  }
  const open: SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => counts.has(node.path) && canAllocate(content, allocated, points, node.id));
  const key = (node: SkillTreeNodeDef): number[] => [abilityRank(plan, node), counts.get(node.path) ?? 0, plan.paths.indexOf(node.path), depthOf(content, node, new Set<string>()), weightOf(node)];
  const ranked: SkillTreeNodeDef[] = open.toSorted((a: SkillTreeNodeDef, b: SkillTreeNodeDef): number => byKeys([...key(a), a.id.localeCompare(b.id)], [...key(b), 0]));
  return ranked[0]?.id ?? null;
}

function toughnessOf(content: Content, stats: StatBlock): number {
  return stats.maxLife / Math.max(0.05, 1 - armourReduction(stats.armour, content.player.resistance.armourCap));
}

export function powerOf(content: Content, level: number, equipped: Equipment, allocated: readonly string[]): Power {
  const stats: StatBlock = computeStats(content, level, equipped, allocated);
  const basic: SkillDef | undefined = content.skills.get(content.player.skillBar[0]?.skill ?? '');
  const items: number = Object.values(equipped).reduce((sum: number, item: ItemInstance | null): number => sum + (item?.level ?? 0), 0);
  return { dps: basic === undefined ? 0 : damagePerSecond(stats, basic), toughness: toughnessOf(content, stats), itemLevels: items };
}

function scoreOf(power: Power): number {
  return power.dps * power.toughness;
}

export function upgradeIndex(world: World): number | null {
  const player: PlayerState = world.player;
  const now: number = scoreOf(powerOf(world.content, player.level, player.equipped, player.allocated));
  let best: number | null = null;
  let bestScore: number = now * BOT_PLAN.upgradeMargin;
  for (const [index, item] of player.inventory.entries()) {
    if (item === null) continue;
    const slot: ItemSlot | null = slotOf(world.content, item);
    if (slot === null) continue;
    const score: number = scoreOf(powerOf(world.content, player.level, { ...player.equipped, [slot]: item }, player.allocated));
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return best;
}

export function junkIndex(world: World): number | null {
  const player: PlayerState = world.player;
  if (player.inventory.includes(null)) return null;
  let worst: number | null = null;
  let worstScore: number = Infinity;
  for (const [index, item] of player.inventory.entries()) {
    const slot: ItemSlot | null = item === null ? null : slotOf(world.content, item);
    if (item === null || slot === null) continue;
    const score: number = scoreOf(powerOf(world.content, player.level, { ...player.equipped, [slot]: item }, player.allocated));
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

export function releaseCommands(world: World): Command[] {
  const player: PlayerState = world.player;
  const action = player.action;
  if (action === null || action.slot === null || action.skill.press === null || !player.held.includes(action.slot)) return [];
  const done: boolean = action.skill.press.type === 'charge' ? chargeOf(action) >= BOT_PLAN.chargeRelease : action.elapsed >= BOT_PLAN.channelSeconds;
  return done ? [{ type: 'hold', slot: action.slot, down: false }] : [];
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

function worthCasting(player: PlayerState, skill: SkillDef, target: MonsterState, foes: readonly MonsterState[]): boolean {
  const gap: number = distance(target.pos, player.pos) - target.radius;
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'nova':
      return crowdNear(foes, player.pos, delivery.radius) >= Math.min(BOT_PLAN.crowd, foes.length);
    case 'area':
      return delivery.anchor === 'caster' ? crowdNear(foes, player.pos, delivery.radius) >= Math.min(BOT_PLAN.crowd, foes.length) : gap <= delivery.range;
    case 'arc':
    case 'projectile':
    case 'chain':
    case 'beam':
    case 'mark':
    case 'field':
      return gap <= skill.engageRange;
    case 'blink':
      return gap > BOT_PLAN.crowdReach && gap <= delivery.range;
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
    if (skill === null || !deals(skill) || !ready(player, skill) || (!spare && skill.manaCost > 0 && foes.length < BOT_PLAN.crowd)) continue;
    if (!worthCasting(player, skill, target, foes)) continue;
    const press: Command[] = skill.press === null ? [] : [{ type: 'hold', slot, down: true }];
    return [...press, { type: 'skill', slot, aim: target.pos, targetId: target.id }];
  }
  return [{ type: 'skill', slot: 0, aim: target.pos, targetId: target.id }];
}

export function rollCommand(world: World, refuge: ReadonlyVec2): Command | null {
  const player: PlayerState = world.player;
  if (!canDash(player)) return null;
  const slot: number = player.skills.findIndex((skill: SkillDef | null): boolean => skill !== null && skill.delivery.type === 'dash' && ready(player, skill));
  return slot < 0 ? null : { type: 'skill', slot, aim: refuge, targetId: null };
}

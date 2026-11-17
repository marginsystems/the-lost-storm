import type { RunCondition, RunReward } from '../../sim/content/run-table-types.ts';
import type { Content, MonsterDef, ZoneDef } from '../../sim/content/types.ts';
import { levelKinds, pinPrices, reachedLevels, runPrice } from '../../sim/world/run-table.ts';
import { clashIn, dangerOf, pinned, rewardOf } from '../../sim/world/run-state.ts';
import type { PinnedCondition } from '../../sim/world/run-state.ts';
import type { RunPin, RunSetup } from '../../sim/world/run-types.ts';
import type { Command, World } from '../../sim/world/types.ts';

export interface TablePick {
  readonly zone: string | null;
  readonly pins: readonly RunPin[];
}

export interface LevelRow {
  readonly id: string;
  readonly name: string;
  readonly range: string;
  readonly holds: string;
  readonly chosen: boolean;
}

export interface KindChip {
  readonly id: string;
  readonly name: string;
  readonly chosen: boolean;
}

export interface ConditionRow {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly price: number;
  readonly reward: string;
  readonly danger: string;
  readonly pinned: boolean;
  readonly open: boolean;
  readonly kinds: readonly KindChip[];
}

export interface TableAction {
  readonly command: Command | null;
  readonly label: string;
  readonly note: string;
  readonly short: boolean;
}

export interface TableView {
  readonly levels: readonly LevelRow[];
  readonly conditions: readonly ConditionRow[];
  readonly pinsLeft: number;
  readonly price: number;
  readonly danger: string;
  readonly reward: string;
  readonly setOut: TableAction;
  readonly again: TableAction;
}

const TABLE_WORDS = {
  noLevels: 'No level to set out to yet',
  pickKind: 'Pick a kind for One kind',
  short: 'Not enough gold',
  plain: 'No conditions: an ordinary descent',
  noLast: 'Nothing set out from here yet',
  clash: 'Cannot be pinned with',
  lastGone: 'That level cannot be reached',
} as const;

function percent(share: number): string {
  return `+${Math.round(share * 100)}%`;
}

export function rewardText(reward: RunReward): string {
  if (reward.xp === 0 && reward.gold === 0 && reward.items === 0 && reward.rarity === 0) return '';
  const same: boolean = reward.xp === reward.gold && reward.gold === reward.items;
  const gains: string = same ? `${percent(reward.xp)} experience, gold and items` : `${percent(reward.xp)} experience, ${percent(reward.gold)} gold, ${percent(reward.items)} items`;
  return reward.rarity > 0 ? `${gains}, ${Math.round(reward.rarity * 100)}% of drops at least magic` : gains;
}

export function dangerText(danger: number): string {
  return danger <= 0 ? 'No added danger' : `Danger ${percent(danger)}`;
}

function rangeText(zone: ZoneDef): string {
  const levels: number[] = zone.packs.map((pack): number => pack.level ?? zone.level);
  const least: number = Math.min(zone.level, ...levels);
  const most: number = Math.max(zone.levelUpTo, ...levels);
  return least === most ? `Level ${least}` : `Level ${least}–${most}`;
}

function holdsText(kinds: readonly MonsterDef[]): string {
  return kinds.map((kind: MonsterDef): string => kind.name).join(', ');
}

function conditionOf(content: Content, id: string): RunCondition | null {
  return content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === id) ?? null;
}

export function shapedLine(world: World, zoneId: string): string | null {
  const active: RunSetup | null = world.run.active;
  if (active === null || active.zone !== zoneId || active.pins.length === 0) return null;
  const names: string[] = pinned(world.content, active.pins).map((entry: PinnedCondition): string => {
    const kind: string | null = entry.pick === null ? null : (world.content.monsters.get(entry.pick)?.name ?? null);
    return kind === null ? entry.condition.name : `${entry.condition.name}: ${kind}`;
  });
  return `Shaped · ${names.join(' · ')}`;
}

export function firstPick(world: World): TablePick {
  const reached: ZoneDef[] = reachedLevels(world);
  const last: RunSetup | null = world.run.last;
  if (last !== null && reached.some((zone: ZoneDef): boolean => zone.id === last.zone)) return { zone: last.zone, pins: last.pins };
  return { zone: reached[reached.length - 1]?.id ?? null, pins: [] };
}

export function chooseLevel(world: World, pick: TablePick, zoneId: string): TablePick {
  const zone: ZoneDef | undefined = reachedLevels(world).find((entry: ZoneDef): boolean => entry.id === zoneId);
  if (zone === undefined) return pick;
  const kinds: ReadonlySet<string> = new Set<string>(levelKinds(world.content, zone).map((kind: MonsterDef): string => kind.id));
  return { zone: zone.id, pins: pick.pins.map((pin: RunPin): RunPin => (pin.pick === null || kinds.has(pin.pick) ? pin : { condition: pin.condition, pick: null })) };
}

export function togglePin(world: World, pick: TablePick, conditionId: string): TablePick {
  if (pick.pins.some((pin: RunPin): boolean => pin.condition === conditionId)) return { zone: pick.zone, pins: pick.pins.filter((pin: RunPin): boolean => pin.condition !== conditionId) };
  const condition: RunCondition | null = conditionOf(world.content, conditionId);
  if (condition === null || pick.pins.length >= world.content.runTable.pins || clashIn(world.content, pick.pins, conditionId) !== null) return pick;
  const zone: ZoneDef | undefined = pick.zone === null ? undefined : world.content.zones.get(pick.zone);
  const first: string | null = condition.pick === 'monster' && zone !== undefined ? (levelKinds(world.content, zone)[0]?.id ?? null) : null;
  return { zone: pick.zone, pins: [...pick.pins, { condition: conditionId, pick: first }] };
}

export function choosePick(pick: TablePick, conditionId: string, value: string): TablePick {
  return { zone: pick.zone, pins: pick.pins.map((pin: RunPin): RunPin => (pin.condition === conditionId ? { condition: pin.condition, pick: value } : pin)) };
}

function ready(content: Content, pins: readonly RunPin[]): boolean {
  return pinned(content, pins).every((entry: PinnedCondition): boolean => entry.condition.pick === 'none' || entry.pick !== null);
}

function setOutAction(world: World, zone: ZoneDef | null, pins: readonly RunPin[]): TableAction {
  if (zone === null) return { command: null, label: 'Set out', note: TABLE_WORDS.noLevels, short: false };
  const price: number = runPrice(world.content, zone, pins);
  const short: boolean = price > world.player.gold;
  const label: string = price > 0 ? `Set out · ${price} gold` : 'Set out';
  if (!ready(world.content, pins)) return { command: null, label, note: TABLE_WORDS.pickKind, short: false };
  const note: string = short ? TABLE_WORDS.short : pins.length === 0 ? TABLE_WORDS.plain : '';
  return { command: short ? null : { type: 'set_out', setup: { zone: zone.id, pins } }, label, note, short };
}

function againAction(world: World): TableAction {
  const last: RunSetup | null = world.run.last;
  if (last === null) return { command: null, label: 'Again', note: TABLE_WORDS.noLast, short: false };
  const zone: ZoneDef | undefined = reachedLevels(world).find((entry: ZoneDef): boolean => entry.id === last.zone);
  if (zone === undefined) return { command: null, label: 'Again', note: TABLE_WORDS.lastGone, short: false };
  const price: number = runPrice(world.content, zone, last.pins);
  const short: boolean = price > world.player.gold;
  const names: string = pinned(world.content, last.pins).map((entry: PinnedCondition): string => entry.condition.name).join(', ');
  const note: string = short ? TABLE_WORDS.short : names === '' ? zone.name : `${zone.name}: ${names}`;
  return { command: short ? null : { type: 'set_out', setup: last }, label: price > 0 ? `Again · ${price} gold` : 'Again', note, short };
}

export function tableView(world: World, pick: TablePick): TableView {
  const content: Content = world.content;
  const reached: ZoneDef[] = reachedLevels(world);
  const zone: ZoneDef | null = reached.find((entry: ZoneDef): boolean => entry.id === pick.zone) ?? null;
  const kinds: MonsterDef[] = zone === null ? [] : levelKinds(content, zone);
  const full: boolean = pick.pins.length >= content.runTable.pins;
  const conditions: ConditionRow[] = content.runTable.conditions.map((condition: RunCondition): ConditionRow => {
    const at: number = pick.pins.findIndex((pin: RunPin): boolean => pin.condition === condition.id);
    const trial: readonly RunPin[] = at >= 0 ? pick.pins : [...pick.pins, { condition: condition.id, pick: null }];
    const index: number = at >= 0 ? at : trial.length - 1;
    const price: number = zone === null ? 0 : (pinPrices(content, zone, trial)[index] ?? 0);
    const chosen: string | null = at >= 0 ? (pick.pins[at]?.pick ?? null) : null;
    const clash: string | null = at >= 0 ? null : clashIn(content, pick.pins, condition.id);
    const clashName: string = clash === null ? '' : (conditionOf(content, clash)?.name ?? clash);
    return {
      id: condition.id,
      name: condition.name,
      text: condition.text,
      price,
      reward: rewardText(condition.reward),
      danger: clash === null ? dangerText(condition.danger) : `${TABLE_WORDS.clash} ${clashName}`,
      pinned: at >= 0,
      open: at >= 0 || (!full && zone !== null && clash === null),
      kinds: at >= 0 && condition.pick === 'monster' ? kinds.map((kind: MonsterDef): KindChip => ({ id: kind.id, name: kind.name, chosen: kind.id === chosen })) : [],
    };
  });
  return {
    levels: reached.map((entry: ZoneDef): LevelRow => ({ id: entry.id, name: entry.name, range: rangeText(entry), holds: holdsText(levelKinds(content, entry)), chosen: entry.id === zone?.id })),
    conditions,
    pinsLeft: content.runTable.pins - pick.pins.length,
    price: zone === null ? 0 : runPrice(content, zone, pick.pins),
    danger: dangerText(dangerOf(content, pick.pins)),
    reward: rewardText(rewardOf(content, pick.pins)),
    setOut: setOutAction(world, zone, pick.pins),
    again: againAction(world),
  };
}

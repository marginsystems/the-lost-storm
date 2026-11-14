import type { Power } from './bot-plan.ts';
import { powerOf } from './bot-plan.ts';
import type { Fields } from './content/read.ts';
import { isFields } from './content/read.ts';
import type { PackRankDef } from './content/rank-types.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { slotOf } from './items.ts';
import { momentOfEcho } from './world/moments.ts';
import type { ItemInstance, MomentOutcome, MonsterState, World, WorldEvent } from './world/types.ts';

export const MEASURE_VERSION = 1;

export type MeasureSource = 'sim' | 'game';

export type MilestoneRule = { readonly kind: 'flag'; readonly name: string; readonly flag: string; readonly is: string | null } | { readonly kind: 'zone'; readonly name: string; readonly zone: string };

export interface SessionHeader {
  readonly kind: 'session';
  readonly t: number;
  readonly version: number;
  readonly source: MeasureSource;
  readonly scenario: string;
  readonly policy: string;
  readonly seed: number | null;
}

export type Measurement =
  | SessionHeader
  | { readonly kind: 'milestone'; readonly t: number; readonly name: string }
  | { readonly kind: 'zone'; readonly t: number; readonly zone: string }
  | { readonly kind: 'level'; readonly t: number; readonly level: number }
  | { readonly kind: 'xp'; readonly t: number; readonly amount: number }
  | { readonly kind: 'gold'; readonly t: number; readonly amount: number }
  | { readonly kind: 'drop'; readonly t: number; readonly base: string; readonly slot: string; readonly rarity: string; readonly level: number }
  | { readonly kind: 'hit'; readonly t: number; readonly taken: boolean; readonly amount: number; readonly foe: string; readonly skill: string; readonly zone: string; readonly fight: number | null }
  | { readonly kind: 'kill'; readonly t: number; readonly foe: string }
  | { readonly kind: 'death'; readonly t: number; readonly zone: string; readonly foe: string; readonly skill: string; readonly xpLost: number }
  | { readonly kind: 'low'; readonly t: number; readonly seconds: number }
  | { readonly kind: 'flask'; readonly t: number; readonly flask: string }
  | { readonly kind: 'fight'; readonly t: number; readonly id: number; readonly moment: string; readonly level: number; readonly foes: number; readonly rank: string }
  | { readonly kind: 'moment'; readonly t: number; readonly id: number; readonly moment: string; readonly outcome: MomentOutcome }
  | { readonly kind: 'skill'; readonly t: number; readonly skill: string }
  | { readonly kind: 'chart'; readonly t: number; readonly place: string; readonly path: string; readonly points: number }
  | { readonly kind: 'power'; readonly t: number; readonly dps: number; readonly toughness: number; readonly itemLevels: number }
  | { readonly kind: 'end'; readonly t: number; readonly reason: string };

export type MeasureKind = Measurement['kind'];

export interface Meter {
  readonly rules: readonly MilestoneRule[];
  readonly origin: number;
  readonly reached: Set<string>;
  readonly names: Map<number, string>;
  readonly learned: Set<string>;
  readonly allocated: Set<string>;
  readonly dropped: Set<number>;
  readonly owned: Set<number>;
  zone: string;
  level: number;
  power: Power | null;
  lowSince: number | null;
}

export const LOW_LIFE: number = 1 / 3;

export function createMeter(world: World, rules: readonly MilestoneRule[]): Meter {
  return {
    rules,
    origin: world.time,
    reached: new Set<string>(rules.filter((rule: MilestoneRule): boolean => holds(world, rule)).map((rule: MilestoneRule): string => rule.name)),
    names: new Map<number, string>(),
    learned: new Set<string>(world.player.learned),
    allocated: new Set<string>(world.player.allocated),
    dropped: new Set<number>(),
    owned: new Set<number>([...world.player.inventory, ...Object.values(world.player.equipped)].flatMap((item: ItemInstance | null): number[] => (item === null ? [] : [item.uid]))),
    zone: world.zone.id,
    level: world.player.level,
    power: null,
    lowSince: null,
  };
}

function holds(world: World, rule: MilestoneRule): boolean {
  switch (rule.kind) {
    case 'flag':
      return rule.is === null ? world.flags[rule.flag] !== undefined : world.flags[rule.flag] === rule.is;
    case 'zone':
      return world.zone.id === rule.zone;
  }
  return false;
}

function nameOf(world: World, meter: Meter, id: number): string {
  if (id === world.player.id) return 'hero';
  const known: string | undefined = meter.names.get(id);
  if (known !== undefined) return known;
  const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === id);
  if (monster === undefined) return 'unknown';
  meter.names.set(id, monster.def.id);
  return monster.def.id;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function hitMeasures(world: World, meter: Meter, event: Extract<WorldEvent, { readonly type: 'damage' }>, t: number): Measurement[] {
  if (event.targetTeam === 'player') return [{ kind: 'hit', t, taken: true, amount: round(event.amount), foe: nameOf(world, meter, event.sourceId), skill: event.skill.id, zone: world.zone.id, fight: momentOfEcho(world, event.sourceId)?.id ?? null }];
  if (event.sourceId !== world.player.id) return [];
  const foe: string = nameOf(world, meter, event.targetId);
  const hit: Measurement = { kind: 'hit', t, taken: false, amount: round(event.amount), foe, skill: event.skill.id, zone: world.zone.id, fight: momentOfEcho(world, event.targetId)?.id ?? null };
  return event.killed ? [hit, { kind: 'kill', t, foe }] : [hit];
}

function dropMeasures(world: World, meter: Meter, event: Extract<WorldEvent, { readonly type: 'drop' }>, t: number): Measurement[] {
  const content = event.ground.content;
  if (content.kind !== 'item' || event.ground.find !== null || meter.dropped.has(content.item.uid) || meter.owned.has(content.item.uid)) return [];
  meter.dropped.add(content.item.uid);
  return [{ kind: 'drop', t, base: content.item.base, slot: slotOf(world.content, content.item) ?? 'none', rarity: content.item.rarity, level: content.item.level }];
}

export function topRank(world: World, ids: readonly number[]): string {
  const ranks: readonly PackRankDef[] = world.content.packRanks.ranks;
  let best: number = 0;
  for (const monster of world.monsters) {
    const rank: string | undefined = ids.includes(monster.id) ? monster.def.rank?.id : undefined;
    const index: number = rank === undefined ? 0 : ranks.findIndex((entry: PackRankDef): boolean => entry.id === rank);
    if (index > best) best = index;
  }
  return ranks[best]?.id ?? 'normal';
}

function eventMeasures(world: World, meter: Meter, event: WorldEvent, t: number): Measurement[] {
  if (event.type === 'monster_spawn') nameOf(world, meter, event.monsterId);
  if (event.type === 'damage') return hitMeasures(world, meter, event, t);
  if (event.type === 'death' && event.team === 'player') return [{ kind: 'death', t, zone: world.zone.id, foe: world.death?.killer ?? 'unknown', skill: world.death?.skill ?? 'unknown', xpLost: world.death?.xpLost ?? 0 }];
  if (event.type === 'xp') return [{ kind: 'xp', t, amount: event.amount }];
  if (event.type === 'pickup' && event.ground.content.kind === 'item') meter.owned.add(event.ground.content.item.uid);
  if (event.type === 'pickup' && event.ground.content.kind === 'gold') return [{ kind: 'gold', t, amount: event.ground.content.amount }];
  if (event.type === 'drop') return dropMeasures(world, meter, event, t);
  if (event.type === 'flask_used') return [{ kind: 'flask', t, flask: event.flask }];
  if (event.type === 'moment_woke' && event.turned.length > 0) return [{ kind: 'fight', t, id: event.moment.id, moment: event.moment.def.id, level: event.moment.level, foes: event.turned.length, rank: topRank(world, event.turned) }];
  if (event.type === 'moment_ended') return [{ kind: 'moment', t, id: event.moment.id, moment: event.moment.def.id, outcome: event.outcome }];
  return [];
}

function pathOf(content: Content, place: string): string {
  return content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === place)?.path ?? 'none';
}

function samePower(a: Power | null, b: Power): boolean {
  return a !== null && Math.abs(a.dps - b.dps) < 1e-6 && Math.abs(a.toughness - b.toughness) < 1e-6 && a.itemLevels === b.itemLevels;
}

function stateMeasures(world: World, meter: Meter, t: number): Measurement[] {
  const out: Measurement[] = [];
  if (world.zone.id !== meter.zone) {
    meter.zone = world.zone.id;
    out.push({ kind: 'zone', t, zone: world.zone.id });
  }
  if (world.player.level !== meter.level) {
    meter.level = world.player.level;
    out.push({ kind: 'level', t, level: world.player.level });
  }
  for (const rule of meter.rules) {
    if (meter.reached.has(rule.name) || !holds(world, rule)) continue;
    meter.reached.add(rule.name);
    out.push({ kind: 'milestone', t, name: rule.name });
  }
  for (const skill of world.player.learned) {
    if (meter.learned.has(skill)) continue;
    meter.learned.add(skill);
    out.push({ kind: 'skill', t, skill });
  }
  for (const place of world.player.allocated) {
    if (meter.allocated.has(place)) continue;
    meter.allocated.add(place);
    out.push({ kind: 'chart', t, place, path: pathOf(world.content, place), points: world.player.allocated.length });
  }
  const power: Power = powerOf(world.content, world.player.level, world.player.equipped, world.player.allocated);
  if (!samePower(meter.power, power)) {
    meter.power = power;
    out.push({ kind: 'power', t, dps: round(power.dps), toughness: round(power.toughness), itemLevels: power.itemLevels });
  }
  return out;
}

function changesState(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'character_changed' || event.type === 'level_up' || event.type === 'zone_changed' || event.type === 'skill_unlocked');
}

function lowMeasures(world: World, meter: Meter, t: number, close: boolean): Measurement[] {
  const player = world.player;
  const low: boolean = !close && player.alive && player.life < player.maxLife * LOW_LIFE;
  if (low && meter.lowSince === null) meter.lowSince = world.time;
  if (low || meter.lowSince === null) return [];
  const seconds: number = round(world.time - meter.lowSince);
  meter.lowSince = null;
  return seconds > 0 ? [{ kind: 'low', t, seconds }] : [];
}

export function closeMeter(world: World, meter: Meter): Measurement[] {
  return lowMeasures(world, meter, round(world.time - meter.origin), true);
}

export function readMeter(world: World, meter: Meter, events: readonly WorldEvent[], full: boolean = false): Measurement[] {
  const t: number = round(world.time - meter.origin);
  const fromEvents: Measurement[] = [...events.flatMap((event: WorldEvent): Measurement[] => eventMeasures(world, meter, event, t)), ...lowMeasures(world, meter, t, false)];
  const fromState: Measurement[] = full || changesState(events) || meter.power === null || world.time === meter.origin ? stateMeasures(world, meter, t) : flagMeasures(world, meter, t);
  return [...fromState, ...fromEvents];
}

function flagMeasures(world: World, meter: Meter, t: number): Measurement[] {
  const out: Measurement[] = [];
  for (const rule of meter.rules) {
    if (meter.reached.has(rule.name) || !holds(world, rule)) continue;
    meter.reached.add(rule.name);
    out.push({ kind: 'milestone', t, name: rule.name });
  }
  return out;
}

export function sessionHeader(source: MeasureSource, scenario: string, policy: string, seed: number | null): SessionHeader {
  return { kind: 'session', t: 0, version: MEASURE_VERSION, source, scenario, policy, seed };
}

export function toLine(measurement: Measurement): string {
  return JSON.stringify(measurement);
}

function num(fields: Fields, key: string): number {
  const value: unknown = fields[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`measurement.${key} must be a number`);
  return value;
}

function str(fields: Fields, key: string): string {
  const value: unknown = fields[key];
  if (typeof value !== 'string') throw new Error(`measurement.${key} must be a string`);
  return value;
}

function bool(fields: Fields, key: string): boolean {
  const value: unknown = fields[key];
  if (typeof value !== 'boolean') throw new Error(`measurement.${key} must be a boolean`);
  return value;
}

function outcome(fields: Fields): MomentOutcome {
  const value: string = str(fields, 'outcome');
  switch (value) {
    case 'faded':
    case 'played':
    case 'resolved':
    case 'expired':
    case 'left':
    case 'opened':
      return value;
    default:
      throw new Error(`measurement.outcome ${value} is not a moment outcome`);
  }
}

function sourceOf(fields: Fields): MeasureSource {
  const value: string = str(fields, 'source');
  if (value !== 'sim' && value !== 'game') throw new Error(`measurement.source ${value} is not sim or game`);
  return value;
}

export function readMeasurement(value: unknown): Measurement {
  if (!isFields(value)) throw new Error('a measurement must be an object');
  const t: number = num(value, 't');
  const kind: string = str(value, 'kind');
  switch (kind) {
    case 'session': {
      const version: number = num(value, 'version');
      if (version !== MEASURE_VERSION) throw new Error(`measurement stream version ${version} is not ${MEASURE_VERSION}`);
      const seed: unknown = value['seed'];
      return { kind, t, version, source: sourceOf(value), scenario: str(value, 'scenario'), policy: str(value, 'policy'), seed: typeof seed === 'number' ? seed : null };
    }
    case 'milestone':
      return { kind, t, name: str(value, 'name') };
    case 'zone':
      return { kind, t, zone: str(value, 'zone') };
    case 'level':
      return { kind, t, level: num(value, 'level') };
    case 'xp':
      return { kind, t, amount: num(value, 'amount') };
    case 'gold':
      return { kind, t, amount: num(value, 'amount') };
    case 'drop':
      return { kind, t, base: str(value, 'base'), slot: str(value, 'slot'), rarity: str(value, 'rarity'), level: num(value, 'level') };
    case 'hit':
      return { kind, t, taken: bool(value, 'taken'), amount: num(value, 'amount'), foe: str(value, 'foe'), skill: str(value, 'skill'), zone: str(value, 'zone'), fight: typeof value['fight'] === 'number' ? value['fight'] : null };
    case 'kill':
      return { kind, t, foe: str(value, 'foe') };
    case 'death':
      return { kind, t, zone: str(value, 'zone'), foe: str(value, 'foe'), skill: str(value, 'skill'), xpLost: typeof value['xpLost'] === 'number' ? value['xpLost'] : 0 };
    case 'low':
      return { kind, t, seconds: num(value, 'seconds') };
    case 'flask':
      return { kind, t, flask: str(value, 'flask') };
    case 'fight':
      return { kind, t, id: num(value, 'id'), moment: str(value, 'moment'), level: num(value, 'level'), foes: num(value, 'foes'), rank: typeof value['rank'] === 'string' ? value['rank'] : 'normal' };
    case 'moment':
      return { kind, t, id: num(value, 'id'), moment: str(value, 'moment'), outcome: outcome(value) };
    case 'skill':
      return { kind, t, skill: str(value, 'skill') };
    case 'chart':
      return { kind, t, place: str(value, 'place'), path: str(value, 'path'), points: num(value, 'points') };
    case 'power':
      return { kind, t, dps: num(value, 'dps'), toughness: num(value, 'toughness'), itemLevels: num(value, 'itemLevels') };
    case 'end':
      return { kind, t, reason: str(value, 'reason') };
    default:
      throw new Error(`unknown measurement kind ${kind}`);
  }
}

export function readStream(text: string): Measurement[] {
  return text
    .split('\n')
    .filter((line: string): boolean => line.trim() !== '')
    .map((line: string): Measurement => {
      const parsed: unknown = JSON.parse(line);
      return readMeasurement(parsed);
    });
}

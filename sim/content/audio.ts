import audio from '../../data/audio.json' with { type: 'json' };
import type { NoticeReason } from '../world/types.ts';
import type { Fields } from './read.ts';
import { ContentError, each, fields, isFields, numeric, text } from './read.ts';
import type { Content, RarityDef } from './types.ts';

export const UI_ACTIONS = ['click', 'panel_open', 'panel_close', 'error', 'skill_point', 'equip'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];

export const WORLD_SOUND_EVENTS = ['hero_step', 'level_up', 'surge', 'surge_cleared', 'monster_spawn', 'player_respawn'] as const;
export type WorldSoundEvent = (typeof WORLD_SOUND_EVENTS)[number];

const NOTICE_KEYS: Readonly<Record<NoticeReason, true>> = { no_mana: true, on_cooldown: true, inventory_full: true };
const NOTICE_REASONS: readonly string[] = Object.keys(NOTICE_KEYS);

export const PLAYER_KEY: string = 'player';
export const GOLD_KEY: string = 'gold';

const SOUND_ID: RegExp = /^[a-z][a-z0-9_]*$/;

const LIMITS = {
  volumeMax: 2,
  voicesMax: 16,
  cooldownMax: 60,
  delayMax: 600,
} as const;

export interface CueDefaults {
  readonly volume: number;
  readonly maxVoices: number;
  readonly cooldown: number;
}

export interface CueDef {
  readonly sound: string;
  readonly volume: number;
  readonly maxVoices: number;
  readonly cooldown: number;
}

export type CueTable = ReadonlyMap<string, readonly CueDef[]>;

export interface AmbienceLoop {
  readonly sound: string;
  readonly volume: number;
}

export interface AmbienceStinger {
  readonly sound: string;
  readonly volume: number;
  readonly minDelay: number;
  readonly maxDelay: number;
}

export interface ZoneAmbience {
  readonly loops: readonly AmbienceLoop[];
  readonly stingers: readonly AmbienceStinger[];
}

export interface AudioDef {
  readonly defaults: CueDefaults;
  readonly skillStart: CueTable;
  readonly skillImpact: CueTable;
  readonly projectileSpawn: CueTable;
  readonly projectileExpire: CueTable;
  readonly skillHit: CueTable;
  readonly hit: CueTable;
  readonly critHit: CueTable;
  readonly death: CueTable;
  readonly aggro: CueTable;
  readonly drop: CueTable;
  readonly pickup: CueTable;
  readonly notice: CueTable;
  readonly world: CueTable;
  readonly ui: CueTable;
  readonly ambience: ReadonlyMap<string, ZoneAmbience>;
}

export interface KnownIds {
  readonly skills: ReadonlySet<string>;
  readonly projectileSkills: ReadonlySet<string>;
  readonly monsters: ReadonlySet<string>;
  readonly rarities: ReadonlySet<string>;
  readonly zones: ReadonlySet<string>;
}

function soundId(source: Fields, key: string, where: string): string {
  const id: string = text(source, key, where);
  if (!SOUND_ID.test(id)) throw new ContentError(`${where}.${key}`, `${id} is not a lower snake case sound id`);
  return id;
}

function ranged(source: Fields, key: string, fallback: number, min: number, max: number, where: string): number {
  if (source[key] === undefined) return fallback;
  const value: number = numeric(source, key, where);
  if (value < min || value > max) throw new ContentError(`${where}.${key}`, `expected ${min} to ${max}`);
  return value;
}

function cue(value: unknown, defaults: CueDefaults, where: string): CueDef {
  const source: Fields = fields(value, where);
  const maxVoices: number = ranged(source, 'maxVoices', defaults.maxVoices, 1, LIMITS.voicesMax, where);
  if (!Number.isInteger(maxVoices)) throw new ContentError(`${where}.maxVoices`, 'expected a whole number');
  return {
    sound: soundId(source, 'sound', where),
    volume: ranged(source, 'volume', defaults.volume, 0.01, LIMITS.volumeMax, where),
    maxVoices,
    cooldown: ranged(source, 'cooldown', defaults.cooldown, 0, LIMITS.cooldownMax, where),
  };
}

function table(source: Fields, key: string, allowed: ReadonlySet<string>, defaults: CueDefaults, where: string): CueTable {
  const entries: unknown = source[key];
  if (!isFields(entries)) throw new ContentError(`${where}.${key}`, 'expected an object');
  const result: Map<string, readonly CueDef[]> = new Map<string, readonly CueDef[]>();
  for (const [id, list] of Object.entries(entries)) {
    if (!allowed.has(id)) throw new ContentError(`${where}.${key}.${id}`, `unknown id, expected one of ${[...allowed].join(', ')}`);
    result.set(
      id,
      each(list, `${where}.${key}.${id}`, (entry: unknown, entryWhere: string): CueDef => cue(entry, defaults, entryWhere)),
    );
  }
  return result;
}

function defaultsOf(value: unknown, where: string): CueDefaults {
  const source: Fields = fields(value, where);
  const maxVoices: number = numeric(source, 'maxVoices', where);
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > LIMITS.voicesMax) throw new ContentError(`${where}.maxVoices`, `expected a whole number from 1 to ${LIMITS.voicesMax}`);
  const volume: number = numeric(source, 'volume', where);
  const cooldown: number = numeric(source, 'cooldown', where);
  if (volume <= 0 || volume > LIMITS.volumeMax) throw new ContentError(`${where}.volume`, `expected more than 0 and at most ${LIMITS.volumeMax}`);
  if (cooldown < 0 || cooldown > LIMITS.cooldownMax) throw new ContentError(`${where}.cooldown`, `expected 0 to ${LIMITS.cooldownMax}`);
  return { volume, maxVoices, cooldown };
}

function withExtras(ids: ReadonlySet<string>, ...extras: readonly string[]): ReadonlySet<string> {
  return new Set<string>([...ids, ...extras]);
}

function zone(value: unknown, where: string): ZoneAmbience {
  const source: Fields = fields(value, where);
  return {
    loops: each(source['loops'], `${where}.loops`, (entry: unknown, entryWhere: string): AmbienceLoop => {
      const loop: Fields = fields(entry, entryWhere);
      return { sound: soundId(loop, 'sound', entryWhere), volume: ranged(loop, 'volume', 1, 0.01, LIMITS.volumeMax, entryWhere) };
    }),
    stingers: each(source['stingers'], `${where}.stingers`, (entry: unknown, entryWhere: string): AmbienceStinger => {
      const stinger: Fields = fields(entry, entryWhere);
      const minDelay: number = ranged(stinger, 'minDelay', 0, 1, LIMITS.delayMax, entryWhere);
      const maxDelay: number = ranged(stinger, 'maxDelay', 0, 1, LIMITS.delayMax, entryWhere);
      if (maxDelay < minDelay) throw new ContentError(entryWhere, 'maxDelay is below minDelay');
      return { sound: soundId(stinger, 'sound', entryWhere), volume: ranged(stinger, 'volume', 1, 0.01, LIMITS.volumeMax, entryWhere), minDelay, maxDelay };
    }),
  };
}

export function parseAudio(value: unknown, known: KnownIds): AudioDef {
  const where: string = 'audio';
  const source: Fields = fields(value, where);
  const defaults: CueDefaults = defaultsOf(source['defaults'], `${where}.defaults`);
  const read = (key: string, allowed: ReadonlySet<string>): CueTable => table(source, key, allowed, defaults, where);
  const zonesSource: unknown = source['ambience'];
  if (!isFields(zonesSource)) throw new ContentError(`${where}.ambience`, 'expected an object');
  const ambience: Map<string, ZoneAmbience> = new Map<string, ZoneAmbience>();
  for (const [id, entry] of Object.entries(zonesSource)) {
    if (!known.zones.has(id)) throw new ContentError(`${where}.ambience.${id}`, `unknown zone, expected one of ${[...known.zones].join(', ')}`);
    ambience.set(id, zone(entry, `${where}.ambience.${id}`));
  }
  const targets: ReadonlySet<string> = withExtras(known.monsters, PLAYER_KEY);
  const items: ReadonlySet<string> = withExtras(known.rarities, GOLD_KEY);
  return {
    defaults,
    skillStart: read('skillStart', known.skills),
    skillImpact: read('skillImpact', known.skills),
    projectileSpawn: read('projectileSpawn', known.projectileSkills),
    projectileExpire: read('projectileExpire', known.projectileSkills),
    skillHit: read('skillHit', known.skills),
    hit: read('hit', targets),
    critHit: read('critHit', targets),
    death: read('death', targets),
    aggro: read('aggro', known.monsters),
    drop: read('drop', items),
    pickup: read('pickup', items),
    notice: read('notice', new Set<string>(NOTICE_REASONS)),
    world: read('world', new Set<string>(WORLD_SOUND_EVENTS)),
    ui: read('ui', new Set<string>(UI_ACTIONS)),
    ambience,
  };
}

export function knownIdsOf(content: Content): KnownIds {
  const skills: string[] = [...content.skills.keys()];
  return {
    skills: new Set<string>(skills),
    projectileSkills: new Set<string>(skills.filter((id: string): boolean => content.skills.get(id)?.delivery.type === 'projectile')),
    monsters: new Set<string>(content.monsters.keys()),
    rarities: new Set<string>(content.rarities.map((rarity: RarityDef): string => rarity.id)),
    zones: new Set<string>([content.arena.id]),
  };
}

export function loadAudio(content: Content): AudioDef {
  return parseAudio(audio, knownIdsOf(content));
}

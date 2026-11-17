import { createHash } from 'node:crypto';
import policyFile from '../simulate-policies.json' with { type: 'json' };
import buildFile from './builds.json' with { type: 'json' };
import { RAW_CONTENT } from '../../sim/content/content.ts';
import type { RawContent } from '../../sim/content/parse.ts';
import { isFields } from '../../sim/content/read.ts';

export const BALANCE_PARTS: readonly (keyof RawContent)[] = ['skills', 'monsters', 'monsterMods', 'factions', 'items', 'skillTree', 'chart', 'player', 'flasks', 'packRanks', 'tailwind', 'moments', 'world', 'quests', 'trade'];

export const ZONE_BALANCE: readonly string[] = ['id', 'kind', 'level', 'levelUpTo', 'packs', 'packReturn', 'moments', 'ranks', 'surge', 'exits'];

export const PRESENTATION_KEYS: ReadonlySet<string> = new Set<string>(['name', 'description', 'title', 'text', 'label', 'icon', 'visual', 'wear', 'wornModel', 'ground', 'marker', 'color', 'tint', 'vfx']);

function zoneBalance(zone: unknown): unknown {
  if (!isFields(zone)) return zone;
  return Object.fromEntries(ZONE_BALANCE.map((key: string): [string, unknown] => [key, zone[key] ?? null]));
}

export function fightOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fightOnly);
  if (!isFields(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]: [string, unknown]): boolean => !PRESENTATION_KEYS.has(key)).map(([key, inner]: [string, unknown]): [string, unknown] => [key, fightOnly(inner)]));
}

function idsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry: unknown): entry is string => typeof entry === 'string') : [];
}

export interface StartingKit {
  readonly id: string;
  readonly worn: boolean;
  readonly pictured: boolean;
}

function kitOf(base: unknown): StartingKit | null {
  if (!isFields(base) || typeof base['id'] !== 'string') return null;
  const wear: unknown = base['wear'];
  return { id: base['id'], worn: Array.isArray(wear) && wear.length > 0, pictured: (base['visual'] ?? null) !== null };
}

export function startingKit(raw: RawContent): readonly StartingKit[] {
  const starting: readonly string[] = isFields(raw.player) ? idsOf(raw.player['startingItems']) : [];
  const bases: unknown = isFields(raw.items) ? raw.items['bases'] : null;
  const kits: readonly StartingKit[] = Array.isArray(bases) ? bases.flatMap((base: unknown): StartingKit[] => { const kit: StartingKit | null = kitOf(base); return kit === null ? [] : [kit]; }) : [];
  return starting.flatMap((id: string): StartingKit[] => kits.filter((kit: StartingKit): boolean => kit.id === id));
}

export function balanceFingerprint(raw: RawContent, policies: unknown, builds: unknown): string {
  const hash = createHash('sha256');
  for (const part of BALANCE_PARTS) hash.update(`${part}:${JSON.stringify(fightOnly(raw[part]))}\n`);
  hash.update(`start:${JSON.stringify(startingKit(raw))}\n`);
  hash.update(`zones:${JSON.stringify(raw.zones.map(zoneBalance))}\n`);
  hash.update(`policies:${JSON.stringify(policies)}\n`);
  hash.update(`guide:${JSON.stringify(builds)}\n`);
  return hash.digest('hex').slice(0, 16);
}

export function currentFingerprint(): string {
  return balanceFingerprint(RAW_CONTENT, policyFile, buildFile);
}

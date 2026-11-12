import { characterSheet } from '../../sim/character-sheet.ts';
import type { CharacterSheet, SheetSubject } from '../../sim/character-sheet.ts';
import type { Content } from '../../sim/content/types.ts';
import { DEFENCE_ROWS, OFFENCE_ROWS } from '../hud/character-rows.ts';
import type { SheetRow } from '../hud/character-rows.ts';

export const LOBBY_SHEET = {
  shown: ['Life', 'Mana', 'Armour', 'Weapon damage', 'Attack speed', 'Critical chance'],
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;

export interface LobbyStat {
  readonly name: string;
  readonly value: string;
}

export interface FreshHero {
  readonly kind: 'fresh';
}

export interface KnownHero {
  readonly kind: 'known';
  readonly level: number;
  readonly progress: number;
  readonly stats: readonly LobbyStat[];
  readonly played: string | null;
  readonly seen: string;
}

export type LobbyHero = FreshHero | KnownHero;

const ROWS: readonly SheetRow[] = [...DEFENCE_ROWS, ...OFFENCE_ROWS];

export function playedText(seconds: number): string | null {
  const minutes: number = Math.floor(seconds / LOBBY_SHEET.secondsPerMinute);
  if (minutes < 1) return null;
  const hours: number = Math.floor(minutes / LOBBY_SHEET.minutesPerHour);
  const rest: number = minutes % LOBBY_SHEET.minutesPerHour;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function lobbyStats(sheet: CharacterSheet): LobbyStat[] {
  return LOBBY_SHEET.shown.flatMap((name: string): LobbyStat[] => {
    const row: SheetRow | undefined = ROWS.find((candidate: SheetRow): boolean => candidate.name === name);
    return row === undefined ? [] : [{ name, value: row.format(row.read(sheet, 'total')) }];
  });
}

export function lobbyHero(content: Content, subject: SheetSubject, seen: string, playedSeconds: number): LobbyHero {
  if (subject.level <= 1 && subject.xp <= 0) return { kind: 'fresh' };
  const sheet: CharacterSheet = characterSheet(content, subject);
  const progress: number = sheet.atMaxLevel || sheet.xpToNext <= 0 ? 1 : Math.min(1, Math.max(0, sheet.xp / sheet.xpToNext));
  return { kind: 'known', level: sheet.level, progress, stats: lobbyStats(sheet), played: playedText(playedSeconds), seen };
}

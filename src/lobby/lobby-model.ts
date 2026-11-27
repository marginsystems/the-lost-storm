import type { BoardRow, Leaderboard, LevelUpNote, NameRefusal, OnlineCharacter, PresentList, Ranking } from '../backend/api.ts';
import { DAMAGE_EXPLAINED } from '../../sim/ladder.ts';

export interface RankingTab {
  readonly by: Ranking;
  readonly label: string;
  readonly caption: string;
}

export const RANKING_TABS: readonly RankingTab[] = [
  { by: 'level', label: 'Level', caption: 'Highest level reached, then experience' },
  { by: 'damage', label: 'Damage', caption: DAMAGE_EXPLAINED },
  { by: 'life', label: 'Life', caption: 'Maximum life' },
  { by: 'played', label: 'Time', caption: 'Time played, counted while in the storm' },
  { by: 'kills', label: 'Kills', caption: 'Monsters slain' },
  { by: 'deaths', label: 'Deaths', caption: 'Times fallen' },
];

const GROUPED: Intl.NumberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function wholeText(value: number): string {
  return GROUPED.format(Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
}

export function rankValue(row: BoardRow, by: Ranking): number {
  switch (by) {
    case 'level':
      return row.level;
    case 'damage':
      return row.damage;
    case 'life':
      return row.life;
    case 'played':
      return row.playedMs;
    case 'kills':
      return row.kills;
    case 'deaths':
      return row.deaths;
  }
  return row.level;
}

export const PLAYED: { readonly msPerMinute: number; readonly minutesPerHour: number; readonly minutesShownBelowHours: number } = { msPerMinute: 60_000, minutesPerHour: 60, minutesShownBelowHours: 10 };

export function playedShort(ms: number): string {
  const minutes: number = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / PLAYED.msPerMinute) : 0;
  const hours: number = Math.floor(minutes / PLAYED.minutesPerHour);
  if (hours === 0) return `${String(minutes)}m`;
  if (hours >= PLAYED.minutesShownBelowHours) return `${wholeText(hours)}h`;
  return `${String(hours)}h ${String(minutes % PLAYED.minutesPerHour).padStart(2, '0')}m`;
}

export function rankValueText(row: BoardRow, by: Ranking): string {
  return by === 'played' ? playedShort(row.playedMs) : wholeText(rankValue(row, by));
}

export function tabOf(by: Ranking): RankingTab {
  return RANKING_TABS.find((tab: RankingTab): boolean => tab.by === by) ?? { by, label: by, caption: '' };
}

export type NameProblem = NameRefusal | 'limited' | 'unavailable' | 'unreached';

export const NAME_RULES: { readonly min: number; readonly max: number } = { min: 3, max: 16 };

export const NAME_MESSAGES: Readonly<Record<NameProblem, string>> = {
  name_length: `Use ${NAME_RULES.min} to ${NAME_RULES.max} characters.`,
  name_characters: 'Letters, digits and single spaces only.',
  name_blocked: 'That name is not allowed.',
  name_taken: 'Someone already has that name.',
  limited: 'Too many name changes for now. Try again in an hour.',
  unavailable: 'The ladder is out of reach. Try again in a moment.',
  unreached: 'The server is out of reach. Press Enter again to keep this name on this device.',
};

const ALLOWED: RegExp = /^[A-Za-z0-9 ]+$/;
const LETTER: RegExp = /[A-Za-z]/;
const SPACES: RegExp = /\s+/g;
const MINUTES_PER_HOUR: number = 60;
const HOURS_PER_DAY: number = 24;

export function tidyName(raw: string): string {
  return raw.trim().replaceAll(SPACES, ' ');
}

export function nameProblem(raw: string): NameRefusal | null {
  const name: string = tidyName(raw);
  if (name.length < NAME_RULES.min || name.length > NAME_RULES.max) return 'name_length';
  if (!ALLOWED.test(name) || !LETTER.test(name)) return 'name_characters';
  return null;
}

export function agoText(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`;
  const hours: number = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;
  return `${Math.floor(hours / HOURS_PER_DAY)}d ago`;
}

export function levelUpText(note: LevelUpNote): string {
  return `${note.name} reached level ${note.level}`;
}

export function onlineText(count: number): string {
  return `${count} online`;
}

export interface PresentRow extends OnlineCharacter {
  readonly own: boolean;
}

export interface PresentView {
  readonly rows: readonly PresentRow[];
  readonly more: number;
  readonly visitors: number;
}

export function presentView(board: Leaderboard): PresentView | null {
  const present: PresentList | null = board.present;
  if (present === null) return null;
  const you: string | null = board.you !== null && board.you.chosen && board.you.online ? board.you.name : null;
  const key: string | null = you === null ? null : you.toLowerCase();
  const others: readonly PresentRow[] = present.characters
    .filter((entry: OnlineCharacter): boolean => entry.name.toLowerCase() !== key)
    .map((entry: OnlineCharacter): PresentRow => ({ name: entry.name, level: entry.level, furthest: entry.furthest, own: false }));
  const listed: boolean = others.length < present.characters.length;
  if (board.you === null || you === null) return { rows: others, more: present.more, visitors: present.visitors };
  const own: PresentRow = { name: you, level: board.you.level, furthest: board.you.furthest, own: true };
  return { rows: [own, ...others], more: listed ? present.more : Math.max(0, present.more - 1), visitors: present.visitors };
}

export function onlineTotal(board: Leaderboard): number {
  const view: PresentView | null = presentView(board);
  return view === null ? board.online : view.rows.length + view.more + view.visitors;
}

export function presentLevelText(level: number): string {
  return `Lv ${level}`;
}

export function moreText(count: number): string {
  return count === 1 ? '1 more' : `${count} more`;
}

export function arrivalsText(count: number): string {
  return count === 1 ? '1 new arrival, not named yet' : `${count} new arrivals, not named yet`;
}

export function presentKey(view: PresentView | null): string {
  if (view === null) return '';
  return JSON.stringify([view.rows.map((row: PresentRow): (string | number | boolean)[] => [row.name, row.level, row.furthest, row.own]), view.more, view.visitors]);
}

export function charactersText(count: number): string {
  return count === 1 ? '1 character' : `${count} characters`;
}

export function rankText(rank: number): string {
  return `#${rank}`;
}

function rankIn(board: Leaderboard, name: string): number | null {
  return board.top.find((row: BoardRow): boolean => row.name === name)?.rank ?? null;
}

export function passedNames(previous: Leaderboard | null, next: Leaderboard): readonly string[] {
  if (previous === null || previous.you === null || next.you === null) return [];
  if (previous.you.name !== next.you.name || next.you.rank >= previous.you.rank) return [];
  const before: number = previous.you.rank;
  const after: number = next.you.rank;
  const lowest: number = next.top.reduce((most: number, row: BoardRow): number => Math.max(most, row.rank), 0);
  return previous.top
    .filter((row: BoardRow): boolean => row.name !== next.you?.name && row.rank < before)
    .filter((row: BoardRow): boolean => {
      const now: number | null = rankIn(next, row.name);
      return now === null ? after <= lowest : now > after;
    })
    .map((row: BoardRow): string => row.name);
}

export function shownKey(board: Leaderboard, slots: number): string {
  const rows: readonly (string | number | boolean | null)[][] = board.top.slice(0, slots).map((row: BoardRow): (string | number | boolean | null)[] => [row.rank, row.name, row.furthest, rankValueText(row, board.by), row.online, row.account]);
  const you: readonly (string | number | boolean)[] | null = board.you === null ? null : [board.you.rank, board.you.name, board.you.furthest, rankValueText(board.you, board.by), board.you.chosen];
  const notes: readonly string[] = board.levelUps.map((note: LevelUpNote): string => `${levelUpText(note)} ${agoText(note.minutesAgo)}`);
  return JSON.stringify([board.by, rows, you, onlineText(onlineTotal(board)), presentKey(presentView(board)), notes]);
}

export function asksForName(board: Leaderboard): boolean {
  return board.you === null || !board.you.chosen;
}

export function spokenName(board: Leaderboard | null): string | null {
  if (board === null || board.you === null || !board.you.chosen) return null;
  return board.you.name;
}

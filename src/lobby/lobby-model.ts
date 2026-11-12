import type { BoardRow, Leaderboard, LevelUpNote, NameRefusal } from '../backend/api.ts';

export type NameProblem = NameRefusal | 'limited' | 'unavailable';

export const NAME_RULES: { readonly min: number; readonly max: number } = { min: 3, max: 16 };

export const NAME_MESSAGES: Readonly<Record<NameProblem, string>> = {
  name_length: `Use ${NAME_RULES.min} to ${NAME_RULES.max} characters.`,
  name_characters: 'Letters, digits and single spaces only.',
  name_blocked: 'That name is not allowed.',
  name_taken: 'Someone already has that name.',
  limited: 'Too many name changes for now. Try again in an hour.',
  unavailable: 'The ladder is out of reach. Try again in a moment.',
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

export function asksForName(board: Leaderboard): boolean {
  return board.you === null || !board.you.chosen;
}

export type NameBody = 'man' | 'woman';

const EITHER_NAMES: readonly string[] = ['Wynn', 'Rook', 'Osk', 'Ash', 'Sorrel'];

export const CHOSEN_NAMES: Readonly<Record<NameBody, readonly string[]>> = {
  man: ['Tavin', 'Orrin', 'Bram', 'Calder', 'Joren', 'Teodor', 'Halden', 'Corvin', 'Edrik', 'Tobin', ...EITHER_NAMES],
  woman: ['Sefa', 'Edda', 'Liesl', 'Ilse', 'Anwen', 'Mirel', 'Maren', 'Tilde', 'Ysolde', 'Brenna', ...EITHER_NAMES],
};

export function chooseName(body: NameBody, random: () => number, refused: ReadonlySet<string>): string | null {
  const open: readonly string[] = CHOSEN_NAMES[body].filter((name: string): boolean => !refused.has(name));
  if (open.length === 0) return null;
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))] ?? null;
}

export function spokenName(board: Leaderboard | null): string | null {
  if (board === null || board.you === null || !board.you.chosen) return null;
  return board.you.name;
}

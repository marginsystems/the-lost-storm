import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import { errorCodeOf, exchange, failureOf, headers, succeeded } from './api.ts';
import type { Answer, Failure, FetchFn } from './api.ts';
import type { ServerCharacter, ServerRoster } from './roster.ts';

export const CHARACTERS_API: { readonly path: string; readonly usernamePath: string; readonly textChars: number; readonly listed: number } = {
  path: '/v1/characters',
  usernamePath: '/v1/account/username',
  textChars: 64,
  listed: 8,
};

export type ListResult = { readonly kind: 'ok'; readonly roster: ServerRoster } | Failure;

export type CreateRefusal = 'name_length' | 'name_characters' | 'name_blocked' | 'name_taken' | 'character_limit';

export type CreateResult = { readonly kind: 'ok'; readonly character: ServerCharacter } | { readonly kind: 'invalid'; readonly reason: CreateRefusal } | Failure;

export type DeleteResult = { readonly kind: 'ok' } | { readonly kind: 'gone' } | { readonly kind: 'listed' } | Failure;

export interface CharactersApi {
  list(token: string, signal: AbortSignal): Promise<ListResult>;
  create(token: string, name: string, signal: AbortSignal): Promise<CreateResult>;
  remove(token: string, id: string, signal: AbortSignal): Promise<DeleteResult>;
}

const CREATE_REFUSALS: readonly CreateRefusal[] = ['name_length', 'name_characters', 'name_blocked', 'name_taken', 'character_limit'];

function text(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && value !== '' && value.length <= CHARACTERS_API.textChars ? value : null;
}

export function readServerCharacter(value: unknown): ServerCharacter | null {
  if (!isFields(value)) return null;
  const id: string | null = text(value, 'id');
  const name: string | null = text(value, 'name');
  const level: unknown = value['level'];
  const hero: unknown = value['hero'];
  if (id === null || name === null || typeof level !== 'number' || !Number.isSafeInteger(level) || level < 1) return null;
  if (hero !== null && typeof hero !== 'string') return null;
  return { id, name, hero, level };
}

export function readServerRoster(value: unknown): ServerRoster | null {
  if (!isFields(value) || !Array.isArray(value['characters'])) return null;
  const list: readonly unknown[] = value['characters'];
  const characters: readonly (ServerCharacter | null)[] = list.slice(0, CHARACTERS_API.listed).map(readServerCharacter);
  const max: unknown = value['max'];
  const defaultId: string | null = text(value, 'default');
  const username: unknown = value['username'];
  if (characters.some((entry: ServerCharacter | null): boolean => entry === null) || typeof max !== 'number' || !Number.isSafeInteger(max) || max < 1) return null;
  if (defaultId === null || (username !== null && typeof username !== 'string')) return null;
  return { characters: characters.filter((entry: ServerCharacter | null): entry is ServerCharacter => entry !== null), max, defaultId, username };
}

function createRefusalOf(answer: Answer): CreateRefusal | null {
  const code: string = errorCodeOf(answer.body);
  return CREATE_REFUSALS.find((refusal: CreateRefusal): boolean => refusal === code) ?? null;
}

export function createCharactersApi(baseUrl: string, fetchFn: FetchFn): CharactersApi {
  return {
    async list(token: string, signal: AbortSignal): Promise<ListResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${CHARACTERS_API.path}`, { method: 'GET', headers: headers(token), signal });
      if (!succeeded(answer)) return failureOf(answer);
      const roster: ServerRoster | null = readServerRoster(answer.body);
      return roster === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', roster };
    },
    async create(token: string, name: string, signal: AbortSignal): Promise<CreateResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${CHARACTERS_API.path}`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name }), signal });
      if (answer !== null && (answer.status === 400 || answer.status === 409)) {
        const reason: CreateRefusal | null = createRefusalOf(answer);
        if (reason !== null) return { kind: 'invalid', reason };
      }
      if (!succeeded(answer)) return failureOf(answer);
      const character: ServerCharacter | null = readServerCharacter(answer.body);
      return character === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', character };
    },
    async remove(token: string, id: string, signal: AbortSignal): Promise<DeleteResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${CHARACTERS_API.path}/${encodeURIComponent(id)}/delete`, { method: 'POST', headers: headers(token), signal });
      if (answer !== null && answer.status === 404 && errorCodeOf(answer.body) === 'no_such_character') return { kind: 'gone' };
      if (answer !== null && answer.status === 409 && errorCodeOf(answer.body) === 'character_has_listings') return { kind: 'listed' };
      return succeeded(answer) ? { kind: 'ok' } : failureOf(answer);
    },
  };
}

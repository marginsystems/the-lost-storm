import type { Content, HeroDef } from '../../sim/content/types.ts';
import type { CharactersApi, CreateResult } from '../backend/characters-api.ts';
import { activeSlot, ROSTER, sessionOf } from '../backend/roster.ts';
import type { Roster, ServerRoster, Slot } from '../backend/roster.ts';
import { addCharacter, firstOnServer, loadRoster, noteActive, reconcileWithServer, removeCharacter, switchCharacter } from '../backend/roster-store.ts';
import type { Reconciliation, RemoveOutcome, RosterPlace, Summary } from '../backend/roster-store.ts';
import { parseSyncRecord, SYNC_KEY } from '../backend/sync-record.ts';
import type { SyncRecord } from '../backend/sync-record.ts';
import { createRefusalText } from './character-strip-model.ts';
import type { HeroNames, StripFacts } from './character-strip-model.ts';
import { keepHeroName } from './hero-name.ts';
import { NAME_MESSAGES, nameProblem, tidyName } from './lobby-model.ts';
import type { NameRefusal } from '../backend/api.ts';

export const CHARACTER_DESK: { readonly requestMs: number } = { requestMs: 4000 };

export type CreateCheck = { readonly kind: 'ready'; readonly name: string; readonly id: string | null } | { readonly kind: 'refused'; readonly text: string };

export interface CharacterDesk {
  facts(activeName: string | null): StripFacts;
  refresh(): Promise<void>;
  check(raw: string): Promise<CreateCheck>;
  open(name: string, id: string | null): boolean;
  pick(key: string): boolean;
  remove(): Promise<RemoveOutcome>;
  only(): boolean;
  username(): string | null;
  note(summary: Summary): void;
}

export interface DeskParts {
  readonly content: Content;
  readonly place: RosterPlace;
  readonly api: CharactersApi | null;
  readonly random: () => number;
}

export function heroNames(content: Content): HeroNames {
  return { name: (id: string): string | null => content.player.heroes.find((hero: HeroDef): boolean => hero.id === id)?.name ?? null };
}

export function accountFull(roster: Roster, server: ServerRoster | null): boolean {
  if (server === null) return false;
  return roster.slots.filter((slot: Slot): boolean => slot.id !== null || slot.legacy).length >= server.max;
}

function signal(): AbortSignal {
  return AbortSignal.timeout(CHARACTER_DESK.requestMs);
}

export function createCharacterDesk(parts: DeskParts): CharacterDesk {
  const { place, api } = parts;
  let server: ServerRoster | null = null;
  const record = (): SyncRecord | null => (place.serverUrl === null ? null : parseSyncRecord(place.store.read(SYNC_KEY), place.serverUrl));
  return {
    facts(activeName: string | null): StripFacts {
      const roster: Roster = loadRoster(place.store);
      return { roster, heroes: heroNames(parts.content), firstOnServer: server === null || firstOnServer(server), accountFull: accountFull(roster, server), activeName };
    },
    async refresh(): Promise<void> {
      if (api === null) return;
      const settled: Reconciliation = await reconcileWithServer(place, api, signal(), 'live');
      if (settled.server !== null) server = settled.server;
    },
    async check(raw: string): Promise<CreateCheck> {
      const name: string = tidyName(raw);
      const problem: NameRefusal | null = nameProblem(name);
      if (problem !== null) return { kind: 'refused', text: NAME_MESSAGES[problem] };
      if (loadRoster(place.store).slots.length >= ROSTER.max) return { kind: 'refused', text: createRefusalText('character_limit') };
      const held: SyncRecord | null = record();
      if (api === null || held === null) return { kind: 'ready', name, id: null };
      const made: CreateResult = await api.create(sessionOf(held.token), name, signal());
      if (made.kind === 'ok') return { kind: 'ready', name: made.character.name, id: made.character.id };
      if (made.kind === 'invalid') return { kind: 'refused', text: createRefusalText(made.reason) };
      return { kind: 'ready', name, id: null };
    },
    open(name: string, id: string | null): boolean {
      if (addCharacter(place, name, id, parts.random) === null) return false;
      keepHeroName(place.store, name);
      return true;
    },
    pick(key: string): boolean {
      return switchCharacter(place, key);
    },
    remove(): Promise<RemoveOutcome> {
      const roster: Roster = loadRoster(place.store);
      return removeCharacter(place, activeSlot(roster).key, api, signal());
    },
    only(): boolean {
      return loadRoster(place.store).slots.length <= 1;
    },
    username(): string | null {
      return server?.username ?? null;
    },
    note(summary: Summary): void {
      noteActive(place, summary);
    },
  };
}

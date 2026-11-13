import type { CreateRefusal } from '../backend/characters-api.ts';
import type { RemoveOutcome } from '../backend/roster-store.ts';
import { ROSTER } from '../backend/roster.ts';
import type { Roster, Slot } from '../backend/roster.ts';
import { NAME_MESSAGES } from './lobby-model.ts';

export const STRIP_TEXT = {
  heading: 'Characters',
  unnamed: 'The one who woke',
  fresh: 'Not yet woken',
  levelLabel: 'Level',
  newCharacter: 'New character',
  newDetail: 'A name, then who wakes',
  firstFirst: 'Play or name your first character first.',
  offAccount: 'Not on your account: no free slot',
  create: 'Create',
  cancel: 'Cancel',
  choose: 'Choose for me',
  placeholder: 'Their name',
  full: 'This account already has three characters.',
  unreachable: 'The server could not be reached. Try again in a moment.',
  deleteLabel: 'Delete character',
  deleteYes: 'Delete for good',
  startOverYes: 'Erase and start over',
  keep: 'Keep this character',
  listed: 'still has auction house business. Cancel its listings and collect what is waiting first.',
  offline: 'The server could not be reached, so nothing was deleted. Try again in a moment.',
} as const;

export interface HeroNames {
  readonly name: (id: string) => string | null;
}

export type CardView =
  | { readonly kind: 'character'; readonly key: string; readonly name: string; readonly detail: string; readonly active: boolean; readonly note: string | null }
  | { readonly kind: 'empty'; readonly key: string; readonly name: string; readonly detail: string; readonly open: boolean; readonly note: string | null };

export interface StripFacts {
  readonly roster: Roster;
  readonly heroes: HeroNames;
  readonly firstOnServer: boolean;
  readonly accountFull: boolean;
  readonly activeName: string | null;
}

export const EMPTY_KEY: string = 'new';

function nameOf(slot: Slot, facts: StripFacts): string {
  if (slot.key === facts.roster.active && facts.activeName !== null) return facts.activeName;
  return slot.name ?? STRIP_TEXT.unnamed;
}

function detailOf(slot: Slot, heroes: HeroNames): string {
  const hero: string | null = slot.hero === null ? null : heroes.name(slot.hero);
  if (slot.level === null) return hero === null ? STRIP_TEXT.fresh : `${STRIP_TEXT.fresh} · ${hero}`;
  return hero === null ? `${STRIP_TEXT.levelLabel} ${slot.level}` : `${STRIP_TEXT.levelLabel} ${slot.level} · ${hero}`;
}

export function canCreate(facts: StripFacts): boolean {
  return facts.roster.slots.length < ROSTER.max && facts.firstOnServer;
}

export function stripCards(facts: StripFacts): readonly CardView[] {
  const cards: CardView[] = facts.roster.slots.map(
    (slot: Slot): CardView => ({
      kind: 'character',
      key: slot.key,
      name: nameOf(slot, facts),
      detail: detailOf(slot, facts.heroes),
      active: slot.key === facts.roster.active,
      note: slot.id === null && !slot.legacy && facts.accountFull ? STRIP_TEXT.offAccount : null,
    }),
  );
  if (facts.roster.slots.length < ROSTER.max) {
    const open: boolean = canCreate(facts);
    cards.push({ kind: 'empty', key: EMPTY_KEY, name: STRIP_TEXT.newCharacter, detail: STRIP_TEXT.newDetail, open, note: open ? null : STRIP_TEXT.firstFirst });
  }
  return cards;
}

export function createRefusalText(reason: CreateRefusal): string {
  return reason === 'character_limit' ? STRIP_TEXT.full : NAME_MESSAGES[reason];
}

export interface DeleteWording {
  readonly ask: string;
  readonly yes: string;
}

export function deleteWording(name: string, only: boolean): DeleteWording {
  if (only) return { ask: `Start over? ${name} and everything they carry is gone for good.`, yes: STRIP_TEXT.startOverYes };
  return { ask: `Delete ${name}? This character and everything they carry is gone for good.`, yes: STRIP_TEXT.deleteYes };
}

export function removeRefusalText(outcome: RemoveOutcome, name: string): string | null {
  if (outcome === 'removed') return null;
  return outcome === 'listed' ? `${name} ${STRIP_TEXT.listed}` : STRIP_TEXT.offline;
}

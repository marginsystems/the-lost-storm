import type { Content, MonsterDef } from '../sim/content/types.ts';
import type { MomentDef } from '../sim/content/moment-types.ts';
import { isFields } from '../sim/content/read.ts';
import { generateItem } from '../sim/items.ts';
import { createRng } from '../sim/rng.ts';
import type { ItemInstance } from '../sim/world/types.ts';

export interface FakeTicket {
  readonly id: number;
  readonly accountId: string;
  readonly seed: number;
  readonly issuedAt: number;
  state: 'open' | 'minted' | 'refused' | 'expired';
  itemId: string | null;
}

export interface FakeLedgerItem {
  readonly id: string;
  readonly accountId: string;
  readonly base: string;
  readonly rarity: string;
  readonly level: number;
  readonly affixes: ItemInstance['affixes'];
}

export interface FakeLedgerAnswer {
  readonly status: number;
  readonly body: unknown;
}

export interface FakeLedger {
  readonly tickets: FakeTicket[];
  readonly items: FakeLedgerItem[];
  answer(accountId: string, method: string, path: string, body: unknown, now: number): FakeLedgerAnswer | null;
}

interface Plan {
  readonly level: number;
  readonly base: string | null;
  readonly rarity: string | null;
}

export const FAKE_TICKETS: { readonly outstanding: number; readonly lifeMs: number } = { outstanding: 16, lifeMs: 900_000 };

const ID_CHARS: number = 22;

function refused(status: number, code: string): FakeLedgerAnswer {
  return { status, body: { error: { code, message: code } } };
}

function text(source: unknown, key: string): string | null {
  const value: unknown = isFields(source) ? source[key] : null;
  return typeof value === 'string' && value !== '' ? value : null;
}

function planFor(content: Content, source: unknown, level: number): Plan | null {
  const kind: string | null = text(source, 'kind');
  const common: string | null = content.rarities[0]?.id ?? null;
  const monster: MonsterDef | undefined = content.monsters.get(text(source, 'monster') ?? '');
  const moment: MomentDef | undefined = content.moments.defs.get(text(source, 'moment') ?? '');
  switch (kind ?? '') {
    case 'monster':
      return monster === undefined || monster.boss !== null || monster.loot.itemChance <= 0 ? null : { level, base: null, rarity: null };
    case 'boss':
      return monster?.boss === undefined || monster.boss === null || monster.boss.drop.items <= 0 ? null : { level, base: null, rarity: monster.boss.drop.rarity };
    case 'moment':
      return moment === undefined ? null : { level, base: null, rarity: moment.reward.rarity };
    case 'find': {
      const find: string | null = text(source, 'find');
      const zone = content.zones.get(text(source, 'zone') ?? '');
      const met = zone?.void?.encounters.find((encounter): boolean => encounter.id === find);
      return met === undefined || met.find.type !== 'item' ? null : { level: 1, base: met.find.item, rarity: common };
    }
    case 'start': {
      const base: string | null = text(source, 'base');
      return base === null || !content.player.startingItems.includes(base) ? null : { level: 1, base, rarity: common };
    }
    case 'trader':
      return { level, base: text(source, 'base'), rarity: text(source, 'rarity') };
    default:
      return null;
  }
}

export function createFakeLedger(content: Content): FakeLedger {
  const tickets: FakeTicket[] = [];
  const items: FakeLedgerItem[] = [];
  let nextTicket: number = 1;
  let nextItem: number = 1;
  const view = (item: FakeLedgerItem): unknown => ({ id: item.id, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes });
  const issue = (accountId: string, now: number): FakeLedgerAnswer => {
    for (const ticket of tickets) if (ticket.accountId === accountId && ticket.state === 'open' && ticket.issuedAt <= now - FAKE_TICKETS.lifeMs) ticket.state = 'expired';
    const open = (): FakeTicket[] => tickets.filter((ticket: FakeTicket): boolean => ticket.accountId === accountId && ticket.state === 'open');
    while (open().length < FAKE_TICKETS.outstanding) {
      tickets.push({ id: nextTicket, accountId, seed: nextTicket * 7919, issuedAt: now, state: 'open', itemId: null });
      nextTicket += 1;
    }
    return { status: 200, body: { tickets: open().map((ticket: FakeTicket): unknown => ({ id: ticket.id, seed: ticket.seed })), lifeMs: FAKE_TICKETS.lifeMs } };
  };
  const mint = (accountId: string, body: unknown, now: number): FakeLedgerAnswer => {
    const ticketId: unknown = isFields(body) ? body['ticket'] : null;
    const level: unknown = isFields(body) ? body['level'] : null;
    if (typeof ticketId !== 'number' || typeof level !== 'number' || !Number.isSafeInteger(level) || level < 1) return refused(400, 'bad_request');
    const ticket: FakeTicket | undefined = tickets.find((entry: FakeTicket): boolean => entry.id === ticketId && entry.accountId === accountId);
    const earlier: FakeLedgerItem | undefined = items.find((item: FakeLedgerItem): boolean => item.id === ticket?.itemId);
    if (ticket !== undefined && ticket.state === 'minted' && earlier !== undefined) return { status: 200, body: { item: view(earlier), ticket: ticket.id } };
    if (ticket === undefined || ticket.state !== 'open' || ticket.issuedAt <= now - FAKE_TICKETS.lifeMs) return refused(410, 'ticket_gone');
    const plan: Plan | null = planFor(content, isFields(body) ? body['source'] : null, level);
    const rolled: ItemInstance | null = plan === null ? null : generateItem(content, createRng(ticket.seed), 0, plan.level, plan.base, plan.rarity);
    if (rolled === null) {
      ticket.state = 'refused';
      return refused(422, 'implausible_source');
    }
    const item: FakeLedgerItem = { id: `itm_${String(nextItem).padStart(ID_CHARS, '0')}`, accountId, base: rolled.base, rarity: rolled.rarity, level: rolled.level, affixes: rolled.affixes };
    nextItem += 1;
    items.push(item);
    ticket.state = 'minted';
    ticket.itemId = item.id;
    return { status: 201, body: { item: view(item), ticket: ticket.id } };
  };
  return {
    tickets,
    items,
    answer: (accountId: string, method: string, path: string, body: unknown, now: number): FakeLedgerAnswer | null => {
      if (method === 'POST' && path === '/v1/items/tickets') return issue(accountId, now);
      if (method === 'POST' && path === '/v1/items/mint') return mint(accountId, body, now);
      return null;
    },
  };
}

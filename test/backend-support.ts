import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { isFields } from '../sim/content/read.ts';
import type { SaveData } from '../sim/save.ts';
import { readSave, SAVE_VERSION, toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import type { FetchFn } from '../src/backend/api.ts';
import type { Backend, KeyValueStore, Logger, Timers } from '../src/backend/backend.ts';
import { createBackend } from '../src/backend/create.ts';
import { epochOf, SAVE_EPOCH } from '../src/backend/epoch.ts';
import { localSaveText } from '../src/backend/local.ts';
import { answerCount, answerFeedback } from './fake-feedback.ts';
import { createFakeLedger } from './fake-ledger.ts';
import type { FakeLedger, FakeLedgerAnswer } from './fake-ledger.ts';
import type { FakeAnswer, StoredFeedback } from './fake-feedback.ts';

export const content: Content = loadContent();

export function makeSave(level: number, xp: number): SaveData {
  return { ...toSave(createWorld(content, { seed: 1, save: null })), level, xp };
}

export function storedLocal(save: SaveData, epoch: number = SAVE_EPOCH): string {
  return localSaveText(save, epoch);
}

export function preEpochLocal(save: SaveData): string {
  return JSON.stringify(save);
}

export function freshSave(): SaveData {
  return toSave(createWorld(content, { seed: 0, save: null }));
}

export function createMemoryStore(): KeyValueStore & { readonly entries: Map<string, string>; failWrites: boolean } {
  const entries: Map<string, string> = new Map<string, string>();
  const store = {
    entries,
    failWrites: false,
    read: (key: string): string | null => entries.get(key) ?? null,
    write(key: string, value: string): boolean {
      if (store.failWrites) return false;
      entries.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      entries.delete(key);
    },
  };
  return store;
}

export interface FakeClock {
  now: number;
  readonly read: () => number;
}

export function createFakeClock(): FakeClock {
  const clock: FakeClock = { now: Date.UTC(2026, 10, 11), read: (): number => clock.now };
  return clock;
}

interface Scheduled {
  readonly id: number;
  readonly due: number;
  readonly task: () => void;
}

export interface FakeTimers {
  readonly timers: Timers;
  readonly pending: () => number;
  readonly nextDelay: () => number | null;
  advance(ms: number): Promise<void>;
}

export function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

export function createFakeTimers(clock: FakeClock): FakeTimers {
  let scheduled: Scheduled[] = [];
  let next: number = 1;
  return {
    timers: {
      after(ms: number, task: () => void): () => void {
        const id: number = next;
        next += 1;
        scheduled.push({ id, due: clock.now + ms, task });
        return (): void => {
          scheduled = scheduled.filter((entry: Scheduled): boolean => entry.id !== id);
        };
      },
    },
    pending: (): number => scheduled.length,
    nextDelay: (): number | null => (scheduled.length === 0 ? null : Math.min(...scheduled.map((entry: Scheduled): number => entry.due)) - clock.now),
    async advance(ms: number): Promise<void> {
      clock.now += ms;
      const due: Scheduled[] = scheduled.filter((entry: Scheduled): boolean => entry.due <= clock.now);
      scheduled = scheduled.filter((entry: Scheduled): boolean => entry.due > clock.now);
      for (const entry of due) entry.task();
      await settle();
      await settle();
    },
  };
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly token: string | null;
  readonly body: unknown;
}

export interface ServerAccount {
  readonly accountId: string;
  readonly token: string;
  save: SaveData | null;
  revision: number;
  updatedAt: string | null;
  readonly sessions: string[];
  guestRetired: boolean;
  google: string | null;
  email: string | null;
  method: 'google' | 'email' | null;
  name: string | null;
  character: string | null;
  owner: string | null;
  retired: boolean;
  username: string | null;
}

export interface SentCode {
  readonly accountId: string;
  readonly email: string;
  readonly code: string;
  readonly expiresAt: number;
  attempts: number;
}

interface Planned {
  readonly method: string | null;
  readonly path: string | null;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface FakeServer {
  readonly fetch: FetchFn;
  readonly requests: RecordedRequest[];
  readonly accounts: ServerAccount[];
  goDown(): void;
  comeUp(): void;
  fallBehind(): void;
  foldNext(extra: Readonly<Record<string, unknown>>): void;
  catchUp(): void;
  plan(status: number, headers?: Readonly<Record<string, string>>, method?: string, path?: string): void;
  characterOf(name: string): ServerAccount;
  readonly auctionBusy: Set<string>;
  live(login: ServerAccount): readonly ServerAccount[];
  holdNext(): () => void;
  loseNextAnswer(method: string, path: string): void;
  plant(account: ServerAccount, save: SaveData): void;
  offerGoogle(clientId: string | null): void;
  offerEmail(siteKey: string | null): void;
  readonly codes: SentCode[];
  codeFor(email: string): string;
  count(method: string, path: string): number;
  epoch(): number;
  wipe(epoch?: number): void;
  readonly feedback: StoredFeedback[];
  readonly counted: unknown[];
  readonly ledger: FakeLedger;
}

export const BAD_TURNSTILE_TOKEN: string = 'turnstile-refused';
const EMAIL_SHAPE: RegExp = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;
const EMAIL_RESEND_MS: number = 60_000;
const EMAIL_CODE_MS: number = 600_000;
const EMAIL_ATTEMPTS: number = 5;

const FAKE_NAME: RegExp = /^[A-Za-z0-9 ]+$/;
const FAKE_ROSTER_MAX: number = 3;
const CHARACTER_PATH: string = '/v1/characters';
const LOGIN_PATHS: readonly string[] = [CHARACTER_PATH, '/v1/me', '/v1/auth/', '/v1/signout', '/v1/account/'];

function guestName(account: ServerAccount): string {
  return `Guest ${account.accountId.replace('account-', '')}`;
}

function characterKey(name: string): string {
  return name.toLowerCase().replaceAll(' ', '');
}

function ladder(accounts: readonly ServerAccount[], viewer: ServerAccount | undefined): unknown {
  const usernameOf = (account: ServerAccount): string | null => accounts.find((other: ServerAccount): boolean => other.accountId === (account.owner ?? account.accountId))?.username ?? null;
  const ranked: ServerAccount[] = accounts
    .filter((account: ServerAccount): boolean => !account.retired && (account.save !== null || account.character !== null))
    .toSorted((left: ServerAccount, right: ServerAccount): number => {
      const byLevel: number = (right.save?.level ?? 1) - (left.save?.level ?? 1);
      return byLevel === 0 ? (right.save?.xp ?? 0) - (left.save?.xp ?? 0) : byLevel;
    });
  const rankOf = (account: ServerAccount): number => 1 + ranked.filter((other: ServerAccount): boolean => (other.save?.level ?? 1) > (account.save?.level ?? 1) || ((other.save?.level ?? 1) === (account.save?.level ?? 1) && (other.save?.xp ?? 0) > (account.save?.xp ?? 0))).length;
  const row = (account: ServerAccount): Record<string, unknown> => ({ rank: rankOf(account), name: account.character ?? guestName(account), account: usernameOf(account), level: account.save?.level ?? 1, furthest: 'The Waystation', online: account === viewer });
  const you: unknown = viewer === undefined || !ranked.includes(viewer) ? null : { ...row(viewer), chosen: viewer.character !== null };
  return { top: ranked.slice(0, 25).map(row), you, online: viewer === undefined ? 0 : 1, characters: ranked.length, levelUps: [] };
}

function nameRefusal(accounts: readonly ServerAccount[], owner: ServerAccount | null, raw: unknown): string | null {
  if (typeof raw !== 'string') return 'bad_request';
  const name: string = raw.trim();
  if (name.length < 3 || name.length > 16) return 'name_length';
  if (!FAKE_NAME.test(name)) return 'name_characters';
  if (characterKey(name).includes('admin')) return 'name_blocked';
  const taken: boolean = accounts.some((account: ServerAccount): boolean => account !== owner && !account.retired && account.character !== null && characterKey(account.character) === characterKey(name));
  return taken ? 'name_taken' : null;
}

function json(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function failed(status: number, code: string, extra: Readonly<Record<string, unknown>> = {}, headers: Readonly<Record<string, string>> = {}): Response {
  return json(status, { error: { code, message: code }, ...extra }, headers);
}

function addressOf(body: unknown): string | null {
  const raw: unknown = isFields(body) ? body['email'] : null;
  if (typeof raw !== 'string') return null;
  const email: string = raw.trim().toLowerCase();
  return EMAIL_SHAPE.test(email) ? email : null;
}

export function createFakeServer(clock: FakeClock): FakeServer {
  const accounts: ServerAccount[] = [];
  const requests: RecordedRequest[] = [];
  const planned: Planned[] = [];
  const gates: Promise<void>[] = [];
  let created: number = 0;
  let issued: number = 0;
  let down: boolean = false;
  let behind: boolean = false;
  let fold: Readonly<Record<string, unknown>> | null = null;
  let googleClientId: string | null = null;
  let emailSiteKey: string | null = null;
  const codes: SentCode[] = [];
  const cooldowns: Map<string, number> = new Map();
  let lost: { readonly method: string; readonly path: string } | null = null;
  let epoch: number = SAVE_EPOCH;
  const feedback: StoredFeedback[] = [];
  const counted: unknown[] = [];
  const ledger: FakeLedger = createFakeLedger(content);
  const auctionBusy: Set<string> = new Set<string>();
  const signIn = (owner: ServerAccount, accessToken: unknown): Response => {
    const [scheme, subject, name]: readonly string[] = typeof accessToken === 'string' ? accessToken.split('|') : [];
    if (scheme !== 'google' || subject === undefined || subject === '') return json(401, { error: { code: 'invalid_google_token', message: 'no' } });
    const known: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => account.google === subject);
    if (known === undefined && owner.google !== null) return json(409, { error: { code: 'already_signed_in', message: 'no' } });
    const target: ServerAccount = known ?? owner;
    issued += 1;
    const token: string = `session-${issued}`;
    target.sessions.push(token);
    if (known === undefined) {
      owner.google = subject;
      owner.method ??= 'google';
    }
    if (target.method === 'google') target.name = name ?? null;
    return json(200, { accountId: target.accountId, token, outcome: known === undefined ? 'linked' : 'existing', name: target.name });
  };
  const startEmail = (owner: ServerAccount, body: unknown): Response => {
    const email: string | null = addressOf(body);
    if (email === null) return failed(400, 'invalid_email');
    const turnstileToken: unknown = isFields(body) ? body['turnstileToken'] : null;
    if (typeof turnstileToken !== 'string' || turnstileToken === '') return failed(400, 'bad_request');
    if (turnstileToken === BAD_TURNSTILE_TOKEN) return failed(403, 'bot_check_failed');
    const openAt: number = cooldowns.get(email) ?? 0;
    if (clock.now < openAt) return failed(429, 'rate_limited', {}, { 'Retry-After': String(Math.ceil((openAt - clock.now) / 1000)) });
    cooldowns.set(email, clock.now + EMAIL_RESEND_MS);
    issued += 1;
    const index: number = codes.findIndex((entry: SentCode): boolean => entry.accountId === owner.accountId && entry.email === email);
    if (index >= 0) codes.splice(index, 1);
    codes.push({ accountId: owner.accountId, email, code: String(100_000 + issued), expiresAt: clock.now + EMAIL_CODE_MS, attempts: 0 });
    return json(200, { sent: true, expiresInSeconds: EMAIL_CODE_MS / 1000, resendAfterSeconds: EMAIL_RESEND_MS / 1000 });
  };
  const verifyEmail = (owner: ServerAccount, body: unknown): Response => {
    const email: string | null = addressOf(body);
    const code: unknown = isFields(body) ? body['code'] : null;
    if (email === null) return failed(400, 'invalid_email');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return failed(400, 'bad_request');
    const index: number = codes.findIndex((entry: SentCode): boolean => entry.accountId === owner.accountId && entry.email === email);
    const entry: SentCode | undefined = codes[index];
    if (entry === undefined || entry.expiresAt <= clock.now) return failed(410, 'code_expired');
    if (entry.attempts >= EMAIL_ATTEMPTS) return failed(410, 'too_many_attempts');
    entry.attempts += 1;
    if (entry.code !== code) return failed(422, 'wrong_code', { attemptsLeft: EMAIL_ATTEMPTS - entry.attempts });
    codes.splice(index, 1);
    const known: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => account.email === email);
    if (known === undefined && owner.email !== null) return failed(409, 'already_signed_in');
    const target: ServerAccount = known ?? owner;
    issued += 1;
    const token: string = `session-${issued}`;
    target.sessions.push(token);
    if (known === undefined) {
      owner.email = email;
      owner.method ??= 'email';
      if (owner.method === 'email') owner.name = `${email.slice(0, 1)}•••${email.slice(email.indexOf('@'))}`;
    }
    return json(200, { accountId: target.accountId, token, outcome: known === undefined ? 'linked' : 'existing', name: target.name });
  };
  const stamp = (): string => new Date(clock.now).toISOString();
  const liveOf = (login: ServerAccount): readonly ServerAccount[] => accounts.filter((account: ServerAccount): boolean => !account.retired && (account === login || account.owner === login.accountId) && (account.character !== null || account.save !== null));
  const subAccount = (login: ServerAccount): ServerAccount => {
    const latent: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => account.owner === login.accountId && !account.retired && account.character === null && account.save === null);
    if (latent !== undefined) return latent;
    created += 1;
    const account: ServerAccount = { accountId: `account-${created}`, token: `character-${created}`, save: null, revision: 0, updatedAt: null, sessions: [], guestRetired: true, google: null, email: null, method: null, name: null, character: null, owner: login.accountId, retired: false, username: null };
    accounts.push(account);
    return account;
  };
  const defaultOf = (login: ServerAccount): ServerAccount => liveOf(login)[0] ?? (login.retired ? subAccount(login) : login);
  const seedUsername = (account: ServerAccount): void => {
    const login: ServerAccount | undefined = accounts.find((other: ServerAccount): boolean => other.accountId === (account.owner ?? account.accountId));
    if (login === undefined || login.username !== null || account.character === null) return;
    const wanted: string = account.character;
    if (accounts.some((other: ServerAccount): boolean => other.username !== null && characterKey(other.username) === characterKey(wanted))) return;
    login.username = wanted;
  };
  const listed = (account: ServerAccount): Record<string, unknown> => ({ id: account.accountId, name: account.character ?? guestName(account), chosen: account.character !== null, hero: account.save?.hero ?? null, level: account.save?.level ?? 1, furthest: 'The Waystation', createdAt: stamp(), playedAt: account.updatedAt });
  const answerCharacters = (login: ServerAccount, method: string, path: string, body: unknown): Response => {
    if (method === 'GET' && path === CHARACTER_PATH) return json(200, { characters: liveOf(login).map(listed), max: FAKE_ROSTER_MAX, default: defaultOf(login).accountId, username: login.username });
    if (method === 'POST' && path === CHARACTER_PATH) {
      const raw: unknown = isFields(body) ? body['name'] : null;
      const refusal: string | null = nameRefusal(accounts, null, raw);
      if (refusal !== null) return failed(refusal === 'name_taken' ? 409 : 400, refusal);
      if (liveOf(login).length >= FAKE_ROSTER_MAX) return failed(409, 'character_limit');
      const target: ServerAccount = login.character === null && login.save === null && !login.retired ? login : subAccount(login);
      target.character = typeof raw === 'string' ? raw.trim() : null;
      seedUsername(target);
      return json(201, listed(target));
    }
    const parts: readonly string[] = path.slice(CHARACTER_PATH.length + 1).split('/');
    const victim: ServerAccount | undefined = liveOf(login).find((account: ServerAccount): boolean => account.accountId === parts[0]);
    if (method === 'POST' && parts.length === 2 && parts[1] === 'delete') {
      if (victim === undefined) return failed(404, 'no_such_character');
      if (auctionBusy.has(victim.accountId)) return failed(409, 'character_has_listings');
      victim.retired = true;
      victim.character = null;
      return json(200, { deleted: true });
    }
    return failed(404, 'not_found');
  };
  const tallied: Set<string> = new Set<string>();
  const tally = (owner: ServerAccount | undefined): Response => json(200, { count: tallied.size, others: tallied.size - (owner !== undefined && tallied.has(owner.accountId) ? 1 : 0) });
  const handle = (url: string, init: RequestInit): Response => {
    const method: string = init.method ?? 'GET';
    const path: string = new URL(url).pathname;
    const header: string | null = new Headers(init.headers).get('authorization');
    const token: string | null = header?.startsWith('Bearer ') === true ? header.slice(7) : null;
    let body: unknown = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    requests.push({ method, path, token, body });
    const planIndex: number = planned.findIndex((entry: Planned): boolean => (entry.method === null || entry.method === method) && (entry.path === null ? !path.startsWith(CHARACTER_PATH) : entry.path === path));
    const plan: Planned | undefined = planIndex < 0 ? undefined : planned.splice(planIndex, 1)[0];
    if (plan !== undefined) return json(plan.status, { error: { code: 'planned', message: 'planned' } }, plan.headers);
    if (method === 'POST' && path === '/v1/feedback') {
      const answer: FakeAnswer = answerFeedback(body);
      if (answer.status === 201) feedback.push({ token, body });
      return json(answer.status, answer.body);
    }
    if (method === 'POST' && path === '/v1/counts') {
      const answer: FakeAnswer = answerCount(body);
      if (answer.status === 200) counted.push(body);
      return json(answer.status, answer.body);
    }
    if (method === 'POST' && path === '/v1/guest') {
      created += 1;
      const account: ServerAccount = { accountId: `account-${created}`, token: `token-${created}`, save: null, revision: 0, updatedAt: null, sessions: [], guestRetired: false, google: null, email: null, method: null, name: null, character: null, owner: null, retired: false, username: null };
      accounts.push(account);
      return json(201, { accountId: account.accountId, token: account.token });
    }
    if (method === 'GET' && path === '/v1/auth/providers') {
      return json(200, { google: googleClientId === null ? null : { clientId: googleClientId }, email: emailSiteKey === null ? null : { turnstileSiteKey: emailSiteKey } });
    }
    const dot: number = token === null ? -1 : token.indexOf('.');
    const session: string | null = token === null || dot < 0 ? token : token.slice(0, dot);
    const suffix: string | null = token === null || dot < 0 ? null : token.slice(dot + 1);
    const login: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => session !== null && account.owner === null && ((account.token === session && !account.guestRetired) || account.sessions.includes(session)));
    const loginScoped: boolean = LOGIN_PATHS.some((prefix: string): boolean => path.startsWith(prefix));
    const character: ServerAccount | null | undefined = login === undefined || loginScoped ? login : suffix === null ? defaultOf(login) : liveOf(login).find((account: ServerAccount): boolean => account.accountId === suffix) ?? null;
    if (character === null) return failed(404, 'no_such_character');
    const owner: ServerAccount | undefined = character;
    if (method === 'GET' && path === '/v1/leaderboard') return json(200, ladder(accounts, owner));
    if (method === 'GET' && path === '/v1/tallies/journal') return tally(owner);
    if (owner === undefined) return json(401, { error: { code: 'unauthorized', message: 'no' } });
    const ledgerAnswer: FakeLedgerAnswer | null = ledger.answer(owner.accountId, method, path, body, clock.now);
    if (ledgerAnswer !== null) return json(ledgerAnswer.status, ledgerAnswer.body);
    if (method === 'POST' && path === '/v1/tallies/journal') {
      tallied.add(owner.accountId);
      return tally(owner);
    }
    if (method === 'PUT' && path === '/v1/character/name') {
      const raw: unknown = isFields(body) ? body['name'] : null;
      const refusal: string | null = nameRefusal(accounts, owner, raw);
      if (refusal !== null) return json(refusal === 'name_taken' ? 409 : 400, { error: { code: refusal, message: 'no' } });
      owner.character = typeof raw === 'string' ? raw.trim() : null;
      seedUsername(owner);
      return json(200, { name: owner.character, chosen: true });
    }
    if (method === 'GET' && path === '/v1/me') return json(200, { accountId: owner.accountId, kind: owner.method ?? 'guest', name: owner.name, createdAt: stamp(), saveEpoch: epoch, username: owner.username });
    if (path === CHARACTER_PATH || path.startsWith(`${CHARACTER_PATH}/`)) return answerCharacters(owner, method, path, body);
    if (path.startsWith('/v1/auth/google') && googleClientId === null) return json(503, { error: { code: 'sign_in_unavailable', message: 'no' } });
    if (method === 'POST' && path === '/v1/auth/google') return signIn(owner, isFields(body) ? body['accessToken'] : null);
    if (path.startsWith('/v1/auth/email') && emailSiteKey === null) return failed(503, 'sign_in_unavailable');
    if (method === 'POST' && path === '/v1/auth/email/start') return startEmail(owner, body);
    if (method === 'POST' && path === '/v1/auth/email/verify') return verifyEmail(owner, body);
    if (method === 'POST' && path === '/v1/signout') {
      const index: number = token === null ? -1 : owner.sessions.indexOf(token);
      if (index >= 0) owner.sessions.splice(index, 1);
      const retiresGuest: boolean = index < 0 && owner.method !== null;
      if (retiresGuest) owner.guestRetired = true;
      return json(200, { signedOut: index >= 0 || retiresGuest });
    }
    const view = (): Readonly<Record<string, unknown>> => ({ save: owner.save, revision: owner.revision, updatedAt: owner.updatedAt, epoch });
    if (method === 'GET' && path === '/v1/save') return json(200, view());
    if (method === 'PUT' && path === '/v1/save' && isFields(body)) {
      const written: number | null = epochOf(body, 'epoch');
      if (written === null) return failed(400, 'bad_request');
      if (written < epoch) return failed(409, 'stale_epoch', { epoch });
      if (behind) return failed(409, 'server_behind', { saveVersion: SAVE_VERSION - 1, sent: SAVE_VERSION });
      const save: SaveData | null = readSave(content, body['save']);
      if (save === null) return json(422, { error: { code: 'invalid_save', message: 'no' } });
      if (body['baseRevision'] !== owner.revision) return json(409, { error: { code: 'revision_conflict', message: 'no' }, current: view() });
      owner.save = save;
      owner.revision += 1;
      owner.updatedAt = stamp();
      const extra: Readonly<Record<string, unknown>> = fold ?? {};
      fold = null;
      return json(200, { ...view(), ...extra });
    }
    return json(404, { error: { code: 'not_found', message: 'no' } });
  };
  return {
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      if (down) throw new TypeError('network down');
      const gate: Promise<void> | undefined = new URL(url).pathname.startsWith(CHARACTER_PATH) ? undefined : gates.shift();
      if (gate !== undefined) await gate;
      const answer: Response = handle(url, init);
      if (lost !== null && lost.method === (init.method ?? 'GET') && lost.path === new URL(url).pathname) {
        lost = null;
        throw new TypeError('the answer was lost');
      }
      return answer;
    },
    loseNextAnswer: (method: string, path: string): void => {
      lost = { method, path };
    },
    holdNext: (): (() => void) => {
      const gate: { release: () => void } = { release: (): void => undefined };
      gates.push(
        new Promise<void>((resolve: () => void): void => {
          gate.release = resolve;
        }),
      );
      return (): void => {
        gate.release();
      };
    },
    requests,
    accounts,
    goDown: (): void => {
      down = true;
    },
    comeUp: (): void => {
      down = false;
    },
    fallBehind: (): void => {
      behind = true;
    },
    foldNext: (extra: Readonly<Record<string, unknown>>): void => {
      fold = extra;
    },
    catchUp: (): void => {
      behind = false;
    },
    plan: (status: number, headers: Readonly<Record<string, string>> = {}, method?: string, path?: string): void => {
      planned.push({ method: method ?? null, path: path ?? null, status, headers });
    },
    characterOf: (name: string): ServerAccount => {
      const found: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => !account.retired && account.character === name);
      if (found === undefined) throw new Error(`no character named ${name}`);
      return found;
    },
    live: liveOf,
    auctionBusy,
    plant: (account: ServerAccount, save: SaveData): void => {
      account.save = save;
      account.revision += 1;
      account.updatedAt = stamp();
    },
    offerGoogle: (clientId: string | null): void => {
      googleClientId = clientId;
    },
    offerEmail: (siteKey: string | null): void => {
      emailSiteKey = siteKey;
    },
    codes,
    codeFor: (email: string): string => {
      const entry: SentCode | undefined = codes.findLast((sent: SentCode): boolean => sent.email === email);
      if (entry === undefined) throw new Error(`no code was sent to ${email}`);
      return entry.code;
    },
    count: (method: string, path: string): number => requests.filter((request: RecordedRequest): boolean => request.method === method && request.path === path).length,
    epoch: (): number => epoch,
    feedback,
    counted,
    ledger,
    wipe: (next: number = SAVE_EPOCH): void => {
      epoch = next;
      for (const account of accounts) {
        account.save = null;
        account.revision = 0;
        account.updatedAt = null;
        account.character = null;
      }
    },
  };
}

export interface Harness {
  readonly server: FakeServer;
  readonly store: ReturnType<typeof createMemoryStore>;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly logs: string[];
  readonly infos: string[];
  readonly warns: string[];
  open(url?: string): Backend;
}

export function createSecondBrowser(first: Harness): Harness {
  return createHarness(first);
}

export function createHarness(sharing: Harness | null = null): Harness {
  const clock: FakeClock = sharing?.clock ?? createFakeClock();
  const server: FakeServer = sharing?.server ?? createFakeServer(clock);
  const store = createMemoryStore();
  const timers: FakeTimers = sharing?.timers ?? createFakeTimers(clock);
  const logs: string[] = [];
  const infos: string[] = [];
  const warns: string[] = [];
  const log: Logger = {
    info: (message: string): void => {
      logs.push(message);
      infos.push(message);
    },
    warn: (message: string): void => {
      logs.push(message);
      warns.push(message);
    },
  };
  return {
    server,
    store,
    clock,
    timers,
    logs,
    infos,
    warns,
    open: (url: string = 'http://localhost:8787'): Backend => createBackend(content, url, { fetch: server.fetch, store, clock: clock.read, timers: timers.timers, log, characterKeys: [] }),
  };
}

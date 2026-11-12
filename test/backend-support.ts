import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { isFields } from '../sim/content/read.ts';
import type { SaveData } from '../sim/save.ts';
import { readSave, toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import type { FetchFn } from '../src/backend/api.ts';
import type { Backend, KeyValueStore, Logger, Timers } from '../src/backend/backend.ts';
import { createBackend } from '../src/backend/create.ts';
import { epochOf, SAVE_EPOCH } from '../src/backend/epoch.ts';
import { localSaveText } from '../src/backend/local.ts';
import type { ZoneDef } from '../sim/content/types.ts';
import { isFloorCell } from '../sim/nav/layout.ts';
import { loadMarkVocabulary } from '../src/traces/words.ts';

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
  nonce: string | null;
  character: string | null;
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
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface FakeServer {
  readonly fetch: FetchFn;
  readonly requests: RecordedRequest[];
  readonly accounts: ServerAccount[];
  goDown(): void;
  comeUp(): void;
  plan(status: number, headers?: Readonly<Record<string, string>>, method?: string): void;
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
}

export const BAD_TURNSTILE_TOKEN: string = 'turnstile-refused';
const EMAIL_SHAPE: RegExp = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;
const EMAIL_RESEND_MS: number = 60_000;
const EMAIL_CODE_MS: number = 600_000;
const EMAIL_ATTEMPTS: number = 5;

const FAKE_NAME: RegExp = /^[A-Za-z0-9 ]+$/;

export const FAKE_TRACES = {
  echoesServed: 5,
  marksServed: 6,
  runsServed: 6,
  minPoints: 4,
  maxPoints: 40,
  stepReach: 3.25,
  maxWords: 3,
  markHours: 168,
  pathKept: 48,
} as const;

interface FakeEcho {
  readonly accountId: string;
  readonly zone: string;
  readonly points: readonly (readonly number[])[];
}

interface FakeMark {
  readonly accountId: string;
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly words: readonly string[];
}

const MARK_WORDS: ReadonlySet<string> = new Set(loadMarkVocabulary().lists.flatMap((list) => list.words.map((word) => word.id)));

function onFloor(zone: ZoneDef, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && isFloorCell(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize));
}

function fakePoints(value: unknown, zone: ZoneDef): readonly (readonly number[])[] | null {
  if (!Array.isArray(value) || value.length < FAKE_TRACES.minPoints || value.length > FAKE_TRACES.maxPoints) return null;
  const list: readonly unknown[] = value;
  const points: (readonly number[])[] = [];
  for (const entry of list) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const parts: readonly unknown[] = entry;
    const [x, z, facing] = parts;
    if (typeof x !== 'number' || typeof z !== 'number' || typeof facing !== 'number' || Math.abs(facing) > Math.PI + 0.01) return null;
    if (!onFloor(zone, x, z)) return null;
    const last: readonly number[] | undefined = points.at(-1);
    if (last !== undefined && Math.hypot(x - (last[0] ?? 0), z - (last[1] ?? 0)) > FAKE_TRACES.stepReach) return null;
    points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(facing * 100) / 100]);
  }
  return points;
}

function characterKey(name: string): string {
  return name.toLowerCase().replaceAll(' ', '');
}

function ladder(accounts: readonly ServerAccount[], viewer: ServerAccount | undefined): unknown {
  const ranked: ServerAccount[] = accounts
    .filter((account: ServerAccount): boolean => account.save !== null || account.character !== null)
    .toSorted((left: ServerAccount, right: ServerAccount): number => {
      const byLevel: number = (right.save?.level ?? 1) - (left.save?.level ?? 1);
      return byLevel === 0 ? (right.save?.xp ?? 0) - (left.save?.xp ?? 0) : byLevel;
    });
  const rankOf = (account: ServerAccount): number => 1 + ranked.filter((other: ServerAccount): boolean => (other.save?.level ?? 1) > (account.save?.level ?? 1) || ((other.save?.level ?? 1) === (account.save?.level ?? 1) && (other.save?.xp ?? 0) > (account.save?.xp ?? 0))).length;
  const row = (account: ServerAccount): Record<string, unknown> => ({ rank: rankOf(account), name: account.character ?? `Guest ${account.accountId.replace('account-', '')}`, level: account.save?.level ?? 1, furthest: 'Stillhold', online: account === viewer });
  const you: unknown = viewer === undefined || !ranked.includes(viewer) ? null : { ...row(viewer), chosen: viewer.character !== null };
  return { top: ranked.slice(0, 25).map(row), you, online: viewer === undefined ? 0 : 1, characters: ranked.length, levelUps: [] };
}

function nameRefusal(accounts: readonly ServerAccount[], owner: ServerAccount, raw: unknown): string | null {
  if (typeof raw !== 'string') return 'bad_request';
  const name: string = raw.trim();
  if (name.length < 3 || name.length > 16) return 'name_length';
  if (!FAKE_NAME.test(name)) return 'name_characters';
  if (characterKey(name).includes('admin')) return 'name_blocked';
  const taken: boolean = accounts.some((account: ServerAccount): boolean => account !== owner && account.character !== null && characterKey(account.character) === characterKey(name));
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
  let googleClientId: string | null = null;
  let emailSiteKey: string | null = null;
  const codes: SentCode[] = [];
  const cooldowns: Map<string, number> = new Map();
  let lost: { readonly method: string; readonly path: string } | null = null;
  let epoch: number = SAVE_EPOCH;
  const signIn = (owner: ServerAccount, credential: unknown): Response => {
    const [scheme, subject, nonce, name]: readonly string[] = typeof credential === 'string' ? credential.split('|') : [];
    const expected: string | null = owner.nonce;
    owner.nonce = null;
    if (scheme !== 'google' || subject === undefined || subject === '' || expected === null || nonce !== expected) return json(401, { error: { code: 'invalid_google_token', message: 'no' } });
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
  const echoes: FakeEcho[] = [];
  const marks: FakeMark[] = [];
  const tallied: Set<string> = new Set<string>();
  const paths: Map<string, (readonly [string, number, number])[]> = new Map();
  const others = (owner: ServerAccount | undefined) => (entry: { readonly accountId: string }): boolean => owner === undefined || entry.accountId !== owner.accountId;
  const characterOf = (accountId: string): string | null => accounts.find((account: ServerAccount): boolean => account.accountId === accountId)?.character ?? null;
  const tally = (owner: ServerAccount | undefined): Response => json(200, { count: tallied.size, others: tallied.size - (owner !== undefined && tallied.has(owner.accountId) ? 1 : 0) });
  const traceRead = (method: string, path: string, owner: ServerAccount | undefined): Response | null => {
    if (method !== 'GET') return null;
    const [, , kind, rawZone] = path.split('/');
    if (kind === 'echoes' || kind === 'marks') {
      const zone: string = decodeURIComponent(rawZone ?? '');
      if (!content.zones.has(zone)) return failed(404, 'no_such_zone');
      if (kind === 'echoes') {
        const seen = echoes.filter((echo: FakeEcho): boolean => echo.zone === zone).filter(others(owner)).slice(0, FAKE_TRACES.echoesServed);
        return json(200, { echoes: seen.map((echo: FakeEcho) => ({ name: characterOf(echo.accountId), points: echo.points })) });
      }
      const place = (mark: FakeMark): Readonly<Record<string, unknown>> => ({ x: mark.x, z: mark.z, words: mark.words });
      const mine: FakeMark | undefined = owner === undefined ? undefined : marks.find((mark: FakeMark): boolean => mark.accountId === owner.accountId && mark.zone === zone);
      const seen = marks.filter((mark: FakeMark): boolean => mark.zone === zone).filter(others(owner)).slice(0, FAKE_TRACES.marksServed);
      return json(200, { marks: seen.map(place), yours: mine === undefined ? null : place(mine) });
    }
    if (path === '/v1/tallies/journal') return tally(owner);
    if (path.startsWith('/v1/tallies/')) return failed(404, 'no_such_tally');
    if (path === '/v1/timelines') {
      const runs = accounts
        .filter((account: ServerAccount): boolean => account.save !== null && (owner === undefined || account !== owner))
        .slice(0, FAKE_TRACES.runsServed)
        .map((account: ServerAccount) => ({
          name: account.character ?? `Guest ${account.accountId.replace('account-', '')}`,
          level: account.save?.level ?? 1,
          furthest: content.zones.get(account.save?.zone ?? '')?.name ?? 'Stillhold',
          furthestZone: account.save?.zone ?? 'stillhold',
          playedMinutes: 0,
          choices: account.save?.flags ?? {},
          path: paths.get(account.accountId) ?? [],
        }));
      return json(200, { runs });
    }
    return null;
  };
  const traceWrite = (method: string, path: string, owner: ServerAccount, body: unknown): Response | null => {
    if (method === 'POST' && path === '/v1/echoes') {
      const zone: ZoneDef | undefined = isFields(body) && typeof body['zone'] === 'string' ? content.zones.get(body['zone']) : undefined;
      const points = zone === undefined || !isFields(body) ? null : fakePoints(body['points'], zone);
      if (zone === undefined || points === null) return failed(400, 'bad_echo');
      const index: number = echoes.findIndex((echo: FakeEcho): boolean => echo.accountId === owner.accountId && echo.zone === zone.id);
      if (index >= 0) echoes.splice(index, 1);
      echoes.push({ accountId: owner.accountId, zone: zone.id, points });
      const first: readonly number[] | undefined = points[0];
      const steps = paths.get(owner.accountId) ?? [];
      if (first !== undefined) steps.push([zone.id, first[0] ?? 0, first[1] ?? 0]);
      paths.set(owner.accountId, steps.length > FAKE_TRACES.pathKept ? steps.filter((_step, at: number): boolean => at % 2 === 0) : steps);
      return json(201, { kept: true });
    }
    if (method === 'PUT' && path === '/v1/mark') {
      const zone: ZoneDef | undefined = isFields(body) && typeof body['zone'] === 'string' ? content.zones.get(body['zone']) : undefined;
      const x: unknown = isFields(body) ? body['x'] : null;
      const z: unknown = isFields(body) ? body['z'] : null;
      const words: unknown = isFields(body) ? body['words'] : null;
      const placed: boolean = zone !== undefined && typeof x === 'number' && typeof z === 'number' && onFloor(zone, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
      const list: readonly unknown[] = Array.isArray(words) ? words : [];
      const worded: boolean = list.length > 0 && list.length <= FAKE_TRACES.maxWords && list.every((word: unknown): boolean => typeof word === 'string' && MARK_WORDS.has(word));
      if (zone === undefined || !placed || !worded || typeof x !== 'number' || typeof z !== 'number') return failed(400, 'bad_mark');
      const index: number = marks.findIndex((mark: FakeMark): boolean => mark.accountId === owner.accountId);
      if (index >= 0) marks.splice(index, 1);
      const mark: FakeMark = { accountId: owner.accountId, zone: zone.id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, words: list.filter((word: unknown): word is string => typeof word === 'string') };
      marks.push(mark);
      return json(200, { mark: { x: mark.x, z: mark.z, words: mark.words }, lastsHours: FAKE_TRACES.markHours });
    }
    if (method === 'POST' && path === '/v1/tallies/journal') {
      tallied.add(owner.accountId);
      return tally(owner);
    }
    if (method === 'POST' && path.startsWith('/v1/tallies/')) return failed(404, 'no_such_tally');
    return null;
  };
  const handle = (url: string, init: RequestInit): Response => {
    const method: string = init.method ?? 'GET';
    const path: string = new URL(url).pathname;
    const header: string | null = new Headers(init.headers).get('authorization');
    const token: string | null = header?.startsWith('Bearer ') === true ? header.slice(7) : null;
    let body: unknown = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    requests.push({ method, path, token, body });
    const planIndex: number = planned.findIndex((entry: Planned): boolean => entry.method === null || entry.method === method);
    const plan: Planned | undefined = planIndex < 0 ? undefined : planned.splice(planIndex, 1)[0];
    if (plan !== undefined) return json(plan.status, { error: { code: 'planned', message: 'planned' } }, plan.headers);
    if (method === 'POST' && path === '/v1/guest') {
      created += 1;
      const account: ServerAccount = { accountId: `account-${created}`, token: `token-${created}`, save: null, revision: 0, updatedAt: null, sessions: [], guestRetired: false, google: null, email: null, method: null, name: null, nonce: null, character: null };
      accounts.push(account);
      return json(201, { accountId: account.accountId, token: account.token });
    }
    if (method === 'GET' && path === '/v1/auth/providers') {
      return json(200, { google: googleClientId === null ? null : { clientId: googleClientId }, email: emailSiteKey === null ? null : { turnstileSiteKey: emailSiteKey } });
    }
    const owner: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => token !== null && ((account.token === token && !account.guestRetired) || account.sessions.includes(token)));
    if (method === 'GET' && path === '/v1/leaderboard') return json(200, ladder(accounts, owner));
    const traced: Response | null = traceRead(method, path, owner);
    if (traced !== null) return traced;
    if (owner === undefined) return json(401, { error: { code: 'unauthorized', message: 'no' } });
    if (method === 'PUT' && path === '/v1/character/name') {
      const raw: unknown = isFields(body) ? body['name'] : null;
      const refusal: string | null = nameRefusal(accounts, owner, raw);
      if (refusal !== null) return json(refusal === 'name_taken' ? 409 : 400, { error: { code: refusal, message: 'no' } });
      owner.character = typeof raw === 'string' ? raw.trim() : null;
      return json(200, { name: owner.character, chosen: true });
    }
    const left: Response | null = traceWrite(method, path, owner, body);
    if (left !== null) return left;
    if (method === 'GET' && path === '/v1/me') return json(200, { accountId: owner.accountId, kind: owner.method ?? 'guest', name: owner.name, createdAt: stamp(), saveEpoch: epoch });
    if (path.startsWith('/v1/auth/google') && googleClientId === null) return json(503, { error: { code: 'sign_in_unavailable', message: 'no' } });
    if (method === 'POST' && path === '/v1/auth/google/nonce') {
      issued += 1;
      owner.nonce = `nonce-${issued}`;
      return json(200, { nonce: owner.nonce });
    }
    if (method === 'POST' && path === '/v1/auth/google') return signIn(owner, isFields(body) ? body['credential'] : null);
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
    const view = (): unknown => ({ save: owner.save, revision: owner.revision, updatedAt: owner.updatedAt, epoch });
    if (method === 'GET' && path === '/v1/save') return json(200, view());
    if (method === 'PUT' && path === '/v1/save' && isFields(body)) {
      const written: number | null = epochOf(body, 'epoch');
      if (written === null) return failed(400, 'bad_request');
      if (written < epoch) return failed(409, 'stale_epoch', { epoch });
      const save: SaveData | null = readSave(content, body['save']);
      if (save === null) return json(422, { error: { code: 'invalid_save', message: 'no' } });
      if (body['baseRevision'] !== owner.revision) return json(409, { error: { code: 'revision_conflict', message: 'no' }, current: view() });
      owner.save = save;
      owner.revision += 1;
      owner.updatedAt = stamp();
      return json(200, view());
    }
    return json(404, { error: { code: 'not_found', message: 'no' } });
  };
  return {
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      if (down) throw new TypeError('network down');
      const gate: Promise<void> | undefined = gates.shift();
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
    plan: (status: number, headers: Readonly<Record<string, string>> = {}, method?: string): void => {
      planned.push({ method: method ?? null, status, headers });
    },
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
    open: (url: string = 'http://localhost:8787'): Backend => createBackend(content, url, { fetch: server.fetch, store, clock: clock.read, timers: timers.timers, log }),
  };
}

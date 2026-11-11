import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { isFields } from '../sim/content/read.ts';
import type { SaveData } from '../sim/save.ts';
import { readSave, toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import type { FetchFn } from '../src/backend/api.ts';
import type { Backend, KeyValueStore, Logger, Timers } from '../src/backend/backend.ts';
import { createBackend } from '../src/backend/create.ts';

export const content: Content = loadContent();

export function makeSave(level: number, xp: number): SaveData {
  return { ...toSave(createWorld(content, { seed: 1, save: null })), level, xp };
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
  plant(account: ServerAccount, save: SaveData): void;
  count(method: string, path: string): number;
}

function json(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function createFakeServer(clock: FakeClock): FakeServer {
  const accounts: ServerAccount[] = [];
  const requests: RecordedRequest[] = [];
  const planned: Planned[] = [];
  const gates: Promise<void>[] = [];
  let created: number = 0;
  let down: boolean = false;
  const stamp = (): string => new Date(clock.now).toISOString();
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
      const account: ServerAccount = { accountId: `account-${created}`, token: `token-${created}`, save: null, revision: 0, updatedAt: null };
      accounts.push(account);
      return json(201, { accountId: account.accountId, token: account.token });
    }
    const owner: ServerAccount | undefined = accounts.find((account: ServerAccount): boolean => account.token === token);
    if (owner === undefined) return json(401, { error: { code: 'unauthorized', message: 'no' } });
    const view = (): unknown => ({ save: owner.save, revision: owner.revision, updatedAt: owner.updatedAt });
    if (method === 'GET' && path === '/v1/save') return json(200, view());
    if (method === 'PUT' && path === '/v1/save' && isFields(body)) {
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
      return handle(url, init);
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
    count: (method: string, path: string): number => requests.filter((request: RecordedRequest): boolean => request.method === method && request.path === path).length,
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

export function createHarness(): Harness {
  const clock: FakeClock = createFakeClock();
  const server: FakeServer = createFakeServer(clock);
  const store = createMemoryStore();
  const timers: FakeTimers = createFakeTimers(clock);
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

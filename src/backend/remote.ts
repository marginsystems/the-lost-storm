import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { SaveData } from '../../sim/save.ts';
import { toSave } from '../../sim/save.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { Api, CloudState, GuestResult, ReadResult, WriteResult } from './api.ts';
import type { Backend, BackendState, Clock, KeyValueStore, Logger, Timers } from './backend.ts';
import { chooseOnConflict, chooseOnLoad, describe } from './merge.ts';
import type { Decision, LoadDecision } from './merge.ts';
import { parseSyncRecord, serializeSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface RemoteOptions {
  readonly content: Content;
  readonly serverUrl: string;
  readonly local: Backend;
  readonly store: KeyValueStore;
  readonly api: Api;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly log: Logger;
}

export const TIMING: {
  readonly loadMs: number;
  readonly resetMs: number;
  readonly requestMs: number;
  readonly pushGapMs: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly maxQuickRetries: number;
} = {
  loadMs: 3000,
  resetMs: 3000,
  requestMs: 8000,
  pushGapMs: 1000,
  retryBaseMs: 2000,
  retryMaxMs: 60_000,
  maxQuickRetries: 3,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    const list: readonly unknown[] = value;
    return `[${list.map((entry: unknown): string => canonical(entry)).join(',')}]`;
  }
  if (!isFields(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .toSorted()
    .map((key: string): string => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function backoffMs(failures: number): number {
  return Math.min(TIMING.retryMaxMs, TIMING.retryBaseMs * 2 ** Math.max(0, failures - 1));
}

export function createRemoteBackend(options: RemoteOptions): Backend {
  const { content, serverUrl, local, store, api, clock, timers, log } = options;
  const listeners: ((state: BackendState) => void)[] = [];
  let record: SyncRecord | null = parseSyncRecord(store.read(SYNC_KEY), serverUrl);
  let state: BackendState = 'offline';
  let latest: SaveData | null = null;
  let pushing: boolean = false;
  let cancelTimer: (() => void) | null = null;
  let failures: number = 0;
  let announced: boolean = false;
  let quickRetries: number = 0;
  let blocked: boolean = false;
  let frozen: boolean = false;
  let epoch: number = 0;

  const now = (): string => new Date(clock()).toISOString();
  const setState = (next: BackendState): void => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(next);
  };
  const keep = (next: SyncRecord | null): void => {
    record = next;
    if (next === null) store.remove(SYNC_KEY);
    else store.write(SYNC_KEY, serializeSyncRecord(next));
  };
  const freshSave = (): SaveData => toSave(createWorld(content, { seed: 0, save: null }));

  const account = async (signal: AbortSignal): Promise<SyncRecord | null> => {
    if (record !== null) return record;
    const result: GuestResult = await api.createGuest(signal);
    if (result.kind !== 'ok') return null;
    const created: SyncRecord = { serverUrl, accountId: result.account.accountId, token: result.account.token, revision: 0, updatedAt: null, savedAt: latest === null ? null : now(), pending: latest !== null, overwriteCloud: false };
    keep(created);
    return created;
  };

  const schedule = (ms: number): void => {
    if (cancelTimer !== null || pushing || latest === null || frozen || blocked) return;
    cancelTimer = timers.after(ms, (): void => {
      cancelTimer = null;
      void push();
    });
  };

  const announceOffline = (): void => {
    if (announced) return;
    announced = true;
    log.warn('the cloud save is not reachable; the game keeps saving on this device and will retry');
  };

  const fail = (afterMs: number | null): void => {
    failures += 1;
    setState('offline');
    announceOffline();
    schedule(afterMs ?? backoffMs(failures));
  };

  const succeed = (sending: SaveData, copy: CloudState): void => {
    failures = 0;
    quickRetries = 0;
    announced = false;
    setState('cloud');
    if (record !== null) keep({ ...record, revision: copy.revision, updatedAt: copy.updatedAt, pending: latest !== sending, overwriteCloud: false });
    if (latest === sending) latest = null;
    else schedule(TIMING.pushGapMs);
  };

  const settle = (sending: SaveData, held: SyncRecord, current: CloudState): void => {
    const base: SyncRecord = record ?? held;
    const decision: Decision = chooseOnConflict({ local: sending, current, overwriteCloud: base.overwriteCloud });
    if (decision.side === 'cloud' && current.save !== null) {
      log.warn(`keeping the cloud save: ${decision.reason}. Reload to continue from it.`);
      local.save(current.save);
      keep({ ...base, revision: current.revision, updatedAt: current.updatedAt, pending: false, overwriteCloud: false });
      latest = null;
      frozen = true;
      setState('cloud');
      return;
    }
    log.info(`keeping this device's save: ${decision.reason}.`);
    keep({ ...base, revision: current.revision, updatedAt: current.updatedAt });
    quickRetries += 1;
    schedule(quickRetries > TIMING.maxQuickRetries ? backoffMs(quickRetries - TIMING.maxQuickRetries) : 0);
  };

  const handle = (sending: SaveData, held: SyncRecord, result: WriteResult): void => {
    switch (result.kind) {
      case 'ok':
        succeed(sending, result.copy);
        return;
      case 'conflict':
        setState('cloud');
        settle(sending, held, result.current);
        return;
      case 'unauthorized':
        keep(null);
        failures += 1;
        schedule(failures > TIMING.maxQuickRetries ? backoffMs(failures) : 0);
        return;
      case 'refused':
        blocked = true;
        log.warn(`the cloud save refused this save (status ${result.status}); it will try again after the next save`);
        return;
      case 'retry':
        fail(result.afterMs);
    }
  };

  const send = async (sending: SaveData): Promise<{ readonly held: SyncRecord; readonly result: WriteResult } | null> => {
    const held: SyncRecord | null = await account(timeout(TIMING.requestMs));
    if (held === null) return null;
    return { held, result: await api.writeSave(held.token, sending, held.revision, timeout(TIMING.requestMs)) };
  };

  const push = async (): Promise<void> => {
    if (pushing || latest === null || frozen || blocked) return;
    pushing = true;
    const mine: number = epoch;
    const sending: SaveData = latest;
    const sent = await send(sending);
    if (mine !== epoch) return;
    pushing = false;
    if (sent === null) fail(null);
    else handle(sending, sent.held, sent.result);
  };

  const adopt = (cloud: CloudState): void => {
    if (record !== null) keep({ ...record, revision: cloud.revision, updatedAt: cloud.updatedAt, pending: false, overwriteCloud: false });
  };

  const overwrite = async (held: SyncRecord, cloud: CloudState, localSave: SaveData | null, signal: AbortSignal): Promise<void> => {
    const result: WriteResult = await api.writeSave(held.token, localSave ?? freshSave(), cloud.revision, signal);
    if (result.kind === 'ok') {
      keep({ ...held, revision: result.copy.revision, updatedAt: result.copy.updatedAt, savedAt: now(), pending: false, overwriteCloud: false });
      setState('cloud');
      return;
    }
    keep({ ...held, revision: cloud.revision, updatedAt: cloud.updatedAt });
    latest = localSave ?? freshSave();
    if (result.kind === 'refused') {
      blocked = true;
      log.warn(`the cloud save refused the replacement for a reset (status ${result.status}); it will try again after the next save`);
      return;
    }
    fail(result.kind === 'retry' ? result.afterMs : null);
  };

  const reachCloud = async (signal: AbortSignal, retried: boolean): Promise<{ readonly held: SyncRecord; readonly cloud: CloudState } | null> => {
    const held: SyncRecord | null = await account(signal);
    if (held === null) return null;
    const read: ReadResult = await api.readSave(held.token, signal);
    if (read.kind === 'ok') return { held, cloud: read.state };
    if (read.kind === 'refused') blocked = true;
    if (read.kind !== 'unauthorized') return null;
    keep(null);
    return retried ? null : reachCloud(signal, true);
  };

  const load = async (): Promise<SaveData | null> => {
    const localSave: SaveData | null = await local.load();
    const signal: AbortSignal = timeout(TIMING.loadMs);
    const reached = await reachCloud(signal, false);
    if (reached === null) {
      setState('offline');
      announceOffline();
      if (record?.pending === true && localSave !== null) latest = localSave;
      schedule(TIMING.retryBaseMs);
      return localSave;
    }
    const { held, cloud } = reached;
    setState('cloud');
    if (held.overwriteCloud) {
      await overwrite(held, cloud, localSave, signal);
      return localSave;
    }
    const decision: LoadDecision = chooseOnLoad({ local: localSave, record: held, cloud });
    if (decision.side === 'cloud' && cloud.save !== null) {
      adopt(cloud);
      if (canonical(cloud.save) === canonical(freshSave())) {
        await local.reset();
        return null;
      }
      log.info(`loaded the cloud save (${describe(cloud.save)}): ${decision.reason}.`);
      local.save(cloud.save);
      return cloud.save;
    }
    if (decision.side === 'local' && localSave !== null) {
      const pending: boolean = cloud.save === null || cloud.revision !== held.revision || held.pending;
      if (cloud.save !== null && pending) log.info(`loaded this device's save (${describe(localSave)}): ${decision.reason}.`);
      keep({ ...held, revision: cloud.revision, updatedAt: cloud.updatedAt, pending });
      if (pending) {
        latest = localSave;
        schedule(0);
      }
    }
    return localSave;
  };

  return {
    load,
    save(save: SaveData): boolean {
      if (frozen) return true;
      const written: boolean = local.save(save);
      latest = save;
      blocked = false;
      if (record !== null) keep({ ...record, pending: true, savedAt: now() });
      schedule(TIMING.pushGapMs);
      return written;
    },
    async reset(): Promise<void> {
      epoch += 1;
      cancelTimer?.();
      cancelTimer = null;
      latest = null;
      frozen = false;
      blocked = false;
      failures = 0;
      pushing = false;
      await local.reset();
      const held: SyncRecord | null = record;
      if (held === null) return;
      const signal: AbortSignal = timeout(TIMING.resetMs);
      const read: ReadResult = await api.readSave(held.token, signal);
      if (read.kind === 'unauthorized') {
        keep(null);
        return;
      }
      if (read.kind === 'ok') {
        const written: WriteResult = await api.writeSave(held.token, freshSave(), read.state.revision, signal);
        if (written.kind === 'ok') {
          keep({ ...held, revision: written.copy.revision, updatedAt: written.copy.updatedAt, savedAt: now(), pending: false, overwriteCloud: false });
          return;
        }
      }
      keep({ ...held, pending: false, overwriteCloud: true });
      log.warn('Start over could not reach the cloud save; it will replace the cloud copy the next time the cloud is reachable');
    },
    flush(): void {
      if (failures > 0) return;
      cancelTimer?.();
      cancelTimer = null;
      void push();
    },
    state: (): BackendState => state,
    subscribe(listener: (state: BackendState) => void): void {
      listeners.push(listener);
    },
  };
}

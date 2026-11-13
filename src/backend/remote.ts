import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { SaveData } from '../../sim/save.ts';
import { toSave } from '../../sim/save.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { Api, CloudState, GuestResult, ReadResult, WriteResult } from './api.ts';
import type { Backend, BackendState, Clock, KeyValueStore, Logger, Timers } from './backend.ts';
import type { Epochs } from './epoch.ts';
import { emptyFold } from './purse-read.ts';
import type { SaveFold } from './purse-read.ts';
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
  readonly epochs: Epochs;
  readonly prepare?: (signal: AbortSignal) => Promise<void>;
}

export const TIMING: {
  readonly loadMs: number;
  readonly resetMs: number;
  readonly requestMs: number;
  readonly pushGapMs: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly maxQuickRetries: number;
  readonly maxEnrolRetries: number;
  readonly syncTries: number;
} = {
  loadMs: 3000,
  resetMs: 3000,
  requestMs: 8000,
  pushGapMs: 1000,
  retryBaseMs: 2000,
  retryMaxMs: 60_000,
  maxQuickRetries: 3,
  maxEnrolRetries: 8,
  syncTries: 2,
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
  const { content, serverUrl, local, store, api, clock, timers, log, epochs } = options;
  const listeners: ((state: BackendState) => void)[] = [];
  let record: SyncRecord | null = parseSyncRecord(store.read(SYNC_KEY), serverUrl);
  let state: BackendState = 'offline';
  let latest: SaveData | null = null;
  let pushing: boolean = false;
  let cancelTimer: (() => void) | null = null;
  let failures: number = 0;
  let announced: boolean = false;
  let behindAnnounced: boolean = false;
  let quickRetries: number = 0;
  let blocked: boolean = false;
  let frozen: boolean = false;
  let cloudUnreadable: boolean = false;
  let epoch: number = 0;
  let creating: Promise<SyncRecord | null> | null = null;
  let enrolRetries: number = 0;
  let cancelEnrol: (() => void) | null = null;
  let unsent: SaveData | null = null;
  let restarted: boolean = false;
  let inFlight: Promise<void> | null = null;
  const foldListeners: ((fold: SaveFold) => void)[] = [];
  const heldFolds: SaveFold[] = [];

  const deliver = (fold: SaveFold): void => {
    if (emptyFold(fold)) return;
    if (foldListeners.length === 0) heldFolds.push(fold);
    for (const listener of foldListeners) listener(fold);
  };

  const now = (): string => new Date(clock()).toISOString();
  const setState = (next: BackendState): void => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(next);
  };
  const displaced = (): boolean => {
    if (record === null) return false;
    const stored: SyncRecord | null = parseSyncRecord(store.read(SYNC_KEY), serverUrl);
    return stored !== null && stored.token !== record.token;
  };
  const keep = (next: SyncRecord | null): void => {
    if (displaced()) {
      frozen = true;
      cancelTimer?.();
      cancelTimer = null;
      return;
    }
    record = next;
    if (next === null) store.remove(SYNC_KEY);
    else store.write(SYNC_KEY, serializeSyncRecord(next));
  };
  const freshSave = (): SaveData => toSave(createWorld(content, { seed: 0, save: null }));

  const prepared = async (signal: AbortSignal): Promise<void> => {
    if (options.prepare === undefined) return;
    try {
      await options.prepare(signal);
    } catch {
      log.warn('the character list could not be read from the server; this device keeps its own list until the next reload');
    }
    record = parseSyncRecord(store.read(SYNC_KEY), serverUrl);
  };

  const create = async (signal: AbortSignal): Promise<SyncRecord | null> => {
    const result: GuestResult = await api.createGuest(signal);
    creating = null;
    if (record !== null) return record;
    if (result.kind !== 'ok') return null;
    const created: SyncRecord = { serverUrl, accountId: result.account.accountId, token: result.account.token, revision: 0, updatedAt: null, savedAt: latest === null ? null : now(), pending: latest !== null, overwriteCloud: false };
    keep(created);
    await prepared(signal);
    return record;
  };

  const account = (signal: AbortSignal): Promise<SyncRecord | null> => {
    if (record !== null) return Promise.resolve(record);
    creating ??= create(signal);
    return creating;
  };

  const enrol = async (): Promise<void> => {
    const held: SyncRecord | null = await account(timeout(TIMING.requestMs));
    if (held === null) {
      enrolLater();
      return;
    }
    if (latest !== null) return;
    if (unsent === null) {
      setState('cloud');
      return;
    }
    latest = unsent;
    unsent = null;
    keep({ ...held, pending: true, savedAt: now() });
    schedule(0);
  };

  function enrolLater(): void {
    if (record !== null || latest !== null || frozen || cancelEnrol !== null || enrolRetries >= TIMING.maxEnrolRetries) return;
    enrolRetries += 1;
    cancelEnrol = timers.after(backoffMs(enrolRetries), (): void => {
      cancelEnrol = null;
      if (latest === null) void enrol();
    });
  }

  const schedule = (ms: number): void => {
    if (cancelTimer !== null || pushing || latest === null || frozen || blocked || cloudUnreadable) return;
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

  const waitForServer = (): void => {
    if (!behindAnnounced) log.warn('the cloud save runs an older game than this one; the game keeps saving on this device and sends it again later');
    behindAnnounced = true;
    failures += 1;
    schedule(backoffMs(failures));
  };

  const succeed = (sending: SaveData, copy: CloudState): void => {
    failures = 0;
    quickRetries = 0;
    announced = false;
    behindAnnounced = false;
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

  const dropStale = (current: number): void => {
    epochs.raise(current);
    epochs.drop();
    log.warn('every save was reset on the server, so this save from before the reset was dropped. Reload to start a new character.');
    void local.reset();
    if (record !== null) keep({ ...record, pending: false, overwriteCloud: false });
    latest = null;
    frozen = true;
    setState('cloud');
  };

  const restamp = (save: SaveData | null, current: number): void => {
    epochs.raise(current);
    if (save !== null) local.save(save);
  };

  const handle = (sending: SaveData, held: SyncRecord, result: WriteResult): void => {
    switch (result.kind) {
      case 'ok':
        succeed(sending, result.copy);
        deliver(result.fold);
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
      case 'stale':
        if (!restarted) {
          dropStale(result.epoch);
          return;
        }
        restamp(latest, result.epoch);
        keep({ ...(record ?? held), revision: 0, updatedAt: null, overwriteCloud: false });
        log.info('the save epoch moved on since Start over; this new character is kept and sent again under the new epoch.');
        schedule(0);
        return;
      case 'behind':
        waitForServer();
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
    return { held, result: await api.writeSave(held.token, sending, held.revision, epochs.current(), timeout(TIMING.requestMs)) };
  };

  const sendLatest = async (sending: SaveData): Promise<void> => {
    const mine: number = epoch;
    const sent = await send(sending);
    if (mine !== epoch) return;
    pushing = false;
    inFlight = null;
    if (sent === null) fail(null);
    else handle(sending, sent.held, sent.result);
  };

  const push = (): Promise<void> => {
    if (pushing) return inFlight ?? Promise.resolve();
    if (latest === null || frozen || blocked || cloudUnreadable) return Promise.resolve();
    pushing = true;
    const run: Promise<void> = sendLatest(latest);
    inFlight = run;
    return run;
  };

  const syncFrom = async (tries: number): Promise<void> => {
    if (tries >= TIMING.syncTries || latest === null || frozen || blocked || cloudUnreadable || failures > 0) return;
    cancelTimer?.();
    cancelTimer = null;
    await push();
    await syncFrom(tries + 1);
  };

  const adopt = (cloud: CloudState): void => {
    if (record !== null) keep({ ...record, revision: cloud.revision, updatedAt: cloud.updatedAt, pending: false, overwriteCloud: false });
  };

  const overwrite = async (held: SyncRecord, cloud: CloudState, localSave: SaveData | null, signal: AbortSignal): Promise<void> => {
    const result: WriteResult = await api.writeSave(held.token, localSave ?? freshSave(), cloud.revision, epochs.current(), signal);
    if (result.kind === 'ok') {
      keep({ ...held, revision: result.copy.revision, updatedAt: result.copy.updatedAt, savedAt: now(), pending: false, overwriteCloud: false });
      setState('cloud');
      deliver(result.fold);
      return;
    }
    keep({ ...held, revision: cloud.revision, updatedAt: cloud.updatedAt });
    latest = localSave ?? freshSave();
    if (result.kind === 'stale') {
      restamp(localSave, result.epoch);
      keep({ ...held, revision: 0, updatedAt: null, overwriteCloud: false });
      schedule(0);
      return;
    }
    if (result.kind === 'behind') {
      waitForServer();
      return;
    }
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
    if (read.kind === 'unreadable') {
      cloudUnreadable = true;
      log.warn('the cloud save was written by a newer or different version of the game and cannot be read here, so it is left as it is and this device saves locally only until a reload');
    }
    if (read.kind !== 'unauthorized') return null;
    keep(null);
    return retried ? null : reachCloud(signal, true);
  };

  const load = async (): Promise<SaveData | null> => {
    const signal: AbortSignal = timeout(TIMING.loadMs);
    await prepared(signal);
    let localSave: SaveData | null = await local.load();
    const tokenBefore: string | null = record?.token ?? null;
    restarted = restarted || record?.overwriteCloud === true;
    const reached = await reachCloud(signal, false);
    if (reached === null) {
      setState('offline');
      announceOffline();
      if (record !== null && record.token !== tokenBefore && localSave !== null) keep({ ...record, pending: true, savedAt: now() });
      if (record?.pending === true && localSave !== null) latest = localSave;
      if (record === null) unsent = localSave;
      schedule(TIMING.retryBaseMs);
      enrolLater();
      return localSave;
    }
    const { held } = reached;
    restarted = restarted || held.overwriteCloud;
    if (held.overwriteCloud) restamp(localSave, reached.cloud.epoch);
    else if (epochs.raise(reached.cloud.epoch)) localSave = await local.load();
    if (reached.cloud.epoch < epochs.current() && reached.cloud.save !== null) epochs.drop();
    const cloud: CloudState = reached.cloud.epoch < epochs.current() ? { save: null, revision: reached.cloud.revision, updatedAt: reached.cloud.updatedAt, epoch: reached.cloud.epoch } : reached.cloud;
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
    if (decision.side === 'none') keep({ ...held, revision: cloud.revision, updatedAt: cloud.updatedAt, pending: false });
    return localSave;
  };

  return {
    load,
    freshStart: (): boolean => epochs.dropped(),
    setAside: (): boolean => local.setAside(),
    save(save: SaveData): boolean {
      if (frozen) return true;
      const written: boolean = local.save(save);
      latest = save;
      unsent = null;
      cancelEnrol?.();
      cancelEnrol = null;
      blocked = false;
      if (record !== null) keep({ ...record, pending: true, savedAt: now() });
      schedule(TIMING.pushGapMs);
      return written;
    },
    async reset(): Promise<void> {
      epoch += 1;
      restarted = true;
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
        epochs.raise(read.state.epoch);
        const written: WriteResult = await api.writeSave(held.token, freshSave(), read.state.revision, epochs.current(), signal);
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
    sync: (): Promise<void> => syncFrom(0),
    onFold(listener: (fold: SaveFold) => void): void {
      foldListeners.push(listener);
      for (const fold of heldFolds.splice(0, heldFolds.length)) listener(fold);
    },
    state: (): BackendState => state,
    subscribe(listener: (state: BackendState) => void): void {
      listeners.push(listener);
    },
  };
}

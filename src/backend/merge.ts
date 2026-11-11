import type { SaveData } from '../../sim/save.ts';
import type { CloudCopy, CloudState } from './api.ts';
import type { SyncRecord } from './sync-record.ts';

export type Side = 'local' | 'cloud';

export interface Decision {
  readonly side: Side;
  readonly reason: string;
}

export type LoadDecision = Decision | { readonly side: 'none' };

export interface LoadInput {
  readonly local: SaveData | null;
  readonly record: SyncRecord | null;
  readonly cloud: CloudState;
}

export interface ConflictInput {
  readonly local: SaveData;
  readonly current: CloudState;
  readonly overwriteCloud: boolean;
}

export function describe(save: SaveData): string {
  return `level ${save.level}, ${Math.floor(save.xp)} xp`;
}

export function compareProgress(left: SaveData, right: SaveData): number {
  return left.level !== right.level ? left.level - right.level : left.xp - right.xp;
}

function timeOf(text: string | null): number {
  const parsed: number = text === null ? Number.NaN : Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function diverged(local: SaveData, cloud: CloudCopy, record: SyncRecord | null): Decision {
  const ahead: number = compareProgress(local, cloud.save);
  if (ahead > 0) return { side: 'local', reason: `this device is further along (${describe(local)}) than the cloud copy (${describe(cloud.save)})` };
  if (ahead < 0) return { side: 'cloud', reason: `the cloud copy is further along (${describe(cloud.save)}) than this device (${describe(local)})` };
  const localLater: boolean = timeOf(record?.savedAt ?? null) > timeOf(cloud.updatedAt);
  return localLater ? { side: 'local', reason: `both copies are at ${describe(local)}, this device saved last` } : { side: 'cloud', reason: `both copies are at ${describe(local)}, the cloud saved last` };
}

export function chooseOnLoad(input: LoadInput): LoadDecision {
  const { local, record, cloud } = input;
  if (record?.overwriteCloud === true) return local === null ? { side: 'none' } : { side: 'local', reason: 'a reset on this device has not reached the cloud yet' };
  if (cloud.save === null) return local === null ? { side: 'none' } : { side: 'local', reason: 'the cloud has no save yet' };
  if (local === null) return { side: 'cloud', reason: 'this device has no save' };
  const known: number = record?.revision ?? 0;
  if (cloud.revision === known && record !== null) return { side: 'local', reason: 'this device is up to date with the cloud' };
  if (cloud.revision > known && record !== null && !record.pending) return { side: 'cloud', reason: 'the cloud has a newer revision and this device has no unsynced changes' };
  return diverged(local, cloud, record);
}

export function chooseOnConflict(input: ConflictInput): Decision {
  const { local, current, overwriteCloud } = input;
  if (overwriteCloud) return { side: 'local', reason: 'a reset on this device has not reached the cloud yet' };
  if (current.save === null) return { side: 'local', reason: 'the cloud copy is gone' };
  const ahead: number = compareProgress(local, current.save);
  if (ahead > 0) return { side: 'local', reason: `this device is further along (${describe(local)}) than the cloud copy (${describe(current.save)})` };
  if (ahead === 0) return { side: 'local', reason: `both copies are at ${describe(local)}` };
  return { side: 'cloud', reason: `the cloud copy is further along (${describe(current.save)}) than this device (${describe(local)})` };
}

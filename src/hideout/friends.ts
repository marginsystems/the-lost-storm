import type { FriendEntry, FriendsList, FriendsResult } from '../backend/api.ts';

export interface FriendsState {
  readonly list: FriendsList | null;
  readonly available: boolean;
  readonly loading: boolean;
  readonly again: boolean;
}

export interface FriendsStep {
  readonly state: FriendsState;
  readonly fetch: boolean;
}

export type FriendRowKind = 'incoming' | 'friend' | 'outgoing';

export interface FriendRow {
  readonly key: string;
  readonly kind: FriendRowKind;
  readonly name: string;
  readonly here: boolean;
}

export const NO_FRIENDS: FriendsState = { list: null, available: true, loading: false, again: false };

export function wantFriends(state: FriendsState): FriendsStep {
  if (!state.available) return { state, fetch: false };
  if (state.loading) return { state: { ...state, again: true }, fetch: false };
  return { state: { ...state, loading: true, again: false }, fetch: true };
}

export function friendsFetched(state: FriendsState, result: FriendsResult): FriendsStep {
  switch (result.kind) {
    case 'unsupported':
      return { state: { list: null, available: false, loading: false, again: false }, fetch: false };
    case 'ok':
    case 'failed': {
      const list: FriendsList | null = result.kind === 'ok' ? result.list : state.list;
      const settled: FriendsState = { list, available: true, loading: false, again: false };
      return state.again ? wantFriends(settled) : { state: settled, fetch: false };
    }
  }
  return { state, fetch: false };
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function row(kind: FriendRowKind, name: string, here: boolean): FriendRow {
  return { key: `${kind}:${name.toLowerCase()}`, kind, name, here };
}

function byPresence(a: FriendEntry, b: FriendEntry): number {
  if (a.here !== b.here) return a.here ? -1 : 1;
  return byName(a.name, b.name);
}

export function friendRows(list: FriendsList | null): readonly FriendRow[] {
  if (list === null) return [];
  const friends: readonly FriendEntry[] = list.friends.toSorted(byPresence);
  return [
    ...list.incoming.toSorted(byName).map((name: string): FriendRow => row('incoming', name, false)),
    ...friends.map((entry: FriendEntry): FriendRow => row('friend', entry.name, entry.here)),
    ...list.outgoing.toSorted(byName).map((name: string): FriendRow => row('outgoing', name, false)),
  ];
}

export function friendsSummary(list: FriendsList | null): string {
  if (list === null) return '';
  const here: number = list.friends.filter((entry: FriendEntry): boolean => entry.here).length;
  const parts: string[] = [];
  if (here > 0) parts.push(`${String(here)} here`);
  if (list.incoming.length > 0) parts.push(list.incoming.length === 1 ? '1 request' : `${String(list.incoming.length)} requests`);
  return parts.join(' · ');
}

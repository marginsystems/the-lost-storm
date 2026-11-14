import type { FriendResult, FriendsResult, NameRefusal, NameResult, ReportReason, ReportResult } from '../backend/api.ts';
import type { HideoutServer } from '../backend/browser.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { sayable } from '../backend/live-protocol.ts';
import { nameProblem, NAME_MESSAGES, tidyName } from '../lobby/lobby-model.ts';
import { createBrowserStore } from '../storage.ts';
import type { ChatState, ChatStep } from './chat.ts';
import { addNote, CHAT_WORDS, command, EMPTY_CHAT, friendText, GENERAL, receive, renameText, reportText, target } from './chat.ts';
import { parseChat } from './chat-command.ts';
import type { ChatView, Submitted } from './chat-view.ts';
import { createChatView } from './chat-view.ts';
import type { FriendsState, FriendsStep } from './friends.ts';
import { friendsFetched, NO_FRIENDS, wantFriends } from './friends.ts';
import type { FriendsView } from './friends-view.ts';
import { createFriendsView } from './friends-view.ts';
import type { Mutes } from './mute.ts';

export const HIDEOUT_CHAT = { requestMs: 6000, hintKey: 'the-lost-storm.chat-hint.v1', unsentText: 'Not connected. Try again in a moment.', longText: 'That is too long to send.' } as const;

export interface HideoutChat {
  handle(event: LiveEvent): void;
  frame(playing: boolean, inHideout: boolean): void;
  openDirect(name: string): void;
  friends(): FriendsState;
  onFriends(listener: (state: FriendsState) => void): void;
  befriend(name: string): Promise<FriendResult>;
  accept(name: string): Promise<FriendResult>;
  refreshFriends(): void;
  mutesChanged(): void;
}

function signal(): AbortSignal {
  return AbortSignal.timeout(HIDEOUT_CHAT.requestMs);
}

export function startHideoutChat(server: HideoutServer, root: HTMLElement, canFocus: () => boolean, mutes: Mutes): HideoutChat {
  let state: ChatState = EMPTY_CHAT;
  let present: boolean = false;
  let shown: boolean = false;
  let friends: FriendsState = NO_FRIENDS;
  const friendListeners: ((state: FriendsState) => void)[] = [];
  const store = createBrowserStore();
  server.live.mute(mutes.list());
  const show = (next: ChatState): void => {
    state = next;
    view.render(state);
  };
  const note = (text: string): void => {
    show(addNote(state, text));
  };
  const message = (name: string): void => {
    if (state.scope !== 'everyone') {
      note(CHAT_WORDS.noWhispers);
      return;
    }
    show(target(state, { kind: 'whisper', name }));
    view.focus();
  };
  const submit = (raw: string): Submitted => {
    const step: ChatStep = command(state, parseChat(raw, state.names));
    show(step.state);
    if (step.action.kind === 'none') return { clear: true, keepOpen: step.keepOpen };
    if (sayable(step.action.text) === null) {
      note(HIDEOUT_CHAT.longText);
      return { clear: false, keepOpen: true };
    }
    const sent: boolean = step.action.kind === 'say' ? server.live.say(step.action.text) : server.live.whisper(step.action.to, step.action.text);
    if (sent) return { clear: true, keepOpen: false };
    note(HIDEOUT_CHAT.unsentText);
    return { clear: false, keepOpen: true };
  };
  const report = async (line: ChatLine, reason: ReportReason): Promise<void> => {
    const token: string | null = server.token();
    const result: ReportResult = token === null ? 'failed' : await server.api.report(token, line.id, reason, signal());
    if (result === 'unsupported') view.hideReport();
    note(reportText(result));
  };
  const showFriends = (next: FriendsState): void => {
    friends = next;
    if (!friends.available) view.hideFriend();
    friendsView.render(friends);
    for (const listener of friendListeners) listener(friends);
  };
  const fetchFriends = async (): Promise<void> => {
    const token: string | null = server.token();
    const result: FriendsResult = token === null ? { kind: 'failed' } : await server.api.friends(token, signal());
    const step: FriendsStep = friendsFetched(friends, result);
    showFriends(step.state);
    if (step.fetch) void fetchFriends();
  };
  const refreshFriends = (): void => {
    const step: FriendsStep = wantFriends(friends);
    showFriends(step.state);
    if (step.fetch) void fetchFriends();
  };
  const settleFriend = (result: FriendResult, name: string): void => {
    if (result.kind === 'unsupported') showFriends(friendsFetched(friends, { kind: 'unsupported' }).state);
    else refreshFriends();
    if (result.kind !== 'ok' || result.state !== 'none') note(friendText(result, name));
  };
  const befriend = async (name: string): Promise<FriendResult> => {
    const token: string | null = server.token();
    const result: FriendResult = token === null ? { kind: 'failed' } : await server.api.befriend(token, name, signal());
    settleFriend(result, name);
    return result;
  };
  const accept = async (name: string): Promise<FriendResult> => {
    const token: string | null = server.token();
    const result: FriendResult = token === null ? { kind: 'failed' } : await server.api.accept(token, name, signal());
    settleFriend(result, name);
    return result;
  };
  const remove = async (name: string): Promise<void> => {
    const token: string | null = server.token();
    settleFriend(token === null ? { kind: 'failed' } : await server.api.remove(token, name, signal()), name);
  };
  const rename = async (raw: string): Promise<void> => {
    const name: string = tidyName(raw);
    const problem: NameRefusal | null = nameProblem(name);
    if (problem !== null) {
      note(NAME_MESSAGES[problem]);
      return;
    }
    const token: string | null = server.token();
    const result: NameResult = token === null ? { kind: 'retry', afterMs: null } : await server.lobby.rename(token, name, signal());
    note(renameText(result));
  };
  const view: ChatView = createChatView({
    root,
    events: window,
    mutes,
    submit,
    message,
    general: (): void => {
      show(target(state, GENERAL));
      view.focus();
    },
    muted: (): void => {
      server.live.mute(mutes.list());
    },
    canFocus,
    report: (line: ChatLine, reason: ReportReason): void => void report(line, reason),
    befriend: (name: string): void => {
      void befriend(name);
    },
    rename: (name: string): void => void rename(name),
  });
  const friendsView: FriendsView = createFriendsView({
    slot: view.friendsSlot,
    message,
    accept: (name: string): void => {
      void accept(name);
    },
    remove: (name: string): void => void remove(name),
  });
  return {
    handle(event: LiveEvent): void {
      if (event.type === 'present') present = event.chat !== null;
      if (event.type === 'welcome' || (event.type === 'present' && present) || event.type === 'friends') refreshFriends();
      if (event.type === 'gone' || event.type === 'away') present = false;
      const next: ChatState = receive(state, event);
      if (next !== state) show(next);
    },
    frame(playing: boolean, inHideout: boolean): void {
      const open: boolean = playing && (state.scope === 'everyone' || (inHideout && present));
      view.show(open);
      if (!open || shown) return;
      shown = true;
      if (store.read(HIDEOUT_CHAT.hintKey) !== null) return;
      store.write(HIDEOUT_CHAT.hintKey, '1');
      show(addNote(state, CHAT_WORDS.hint, 'hint'));
    },
    openDirect: message,
    friends: (): FriendsState => friends,
    onFriends(listener: (state: FriendsState) => void): void {
      friendListeners.push(listener);
    },
    befriend,
    accept,
    refreshFriends,
    mutesChanged(): void {
      server.live.mute(mutes.list());
      view.render(state);
    },
  };
}

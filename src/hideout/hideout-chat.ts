import type { FriendResult, NameRefusal, NameResult, ReportReason, ReportResult } from '../backend/api.ts';
import type { HideoutServer } from '../backend/browser.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { nameProblem, NAME_MESSAGES, tidyName } from '../lobby/lobby-model.ts';
import { createBrowserStore } from '../storage.ts';
import type { ChatState } from './chat.ts';
import { addNote, EMPTY_CHAT, friendText, receive, renameText, reportText } from './chat.ts';
import type { ChatView } from './chat-view.ts';
import { createChatView } from './chat-view.ts';
import { createMutes } from './mute.ts';

export const HIDEOUT_CHAT = { requestMs: 6000 } as const;

export interface HideoutChat {
  handle(event: LiveEvent): void;
  frame(inHideout: boolean): void;
}

function signal(): AbortSignal {
  return AbortSignal.timeout(HIDEOUT_CHAT.requestMs);
}

export function startHideoutChat(server: HideoutServer, root: HTMLElement, canFocus: () => boolean): HideoutChat {
  let state: ChatState = EMPTY_CHAT;
  let present: boolean = false;
  const note = (text: string): void => {
    state = addNote(state, text);
    view.render(state);
  };
  const report = async (line: ChatLine, reason: ReportReason): Promise<void> => {
    const token: string | null = server.token();
    const result: ReportResult = token === null ? 'failed' : await server.api.report(token, line.id, reason, signal());
    if (result === 'unsupported') view.hideReport();
    note(reportText(result));
  };
  const befriend = async (name: string): Promise<void> => {
    const token: string | null = server.token();
    const result: FriendResult = token === null ? { kind: 'failed' } : await server.api.befriend(token, name, signal());
    if (result.kind === 'unsupported') view.hideFriend();
    note(friendText(result, name));
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
    mutes: createMutes(createBrowserStore()),
    say: (text: string): boolean => server.live.say(text),
    canFocus,
    report: (line: ChatLine, reason: ReportReason): void => void report(line, reason),
    befriend: (name: string): void => void befriend(name),
    rename: (name: string): void => void rename(name),
  });
  return {
    handle(event: LiveEvent): void {
      if (event.type === 'present') present = event.chat !== null;
      if (event.type === 'gone') present = false;
      const next: ChatState = receive(state, event);
      if (next === state) return;
      state = next;
      view.render(state);
    },
    frame(inHideout: boolean): void {
      view.show(inHideout && present);
    },
  };
}

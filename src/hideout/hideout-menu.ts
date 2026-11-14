import type { FriendResult, ReportReason, ReportResult } from '../backend/api.ts';
import type { HideoutServer } from '../backend/browser.ts';
import type { BlockResult, BlocksResult } from '../backend/hideout-api.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { Others, OtherTarget, ScreenAnchor } from '../render/others.ts';
import type { BlocksState } from './blocks.ts';
import { blockSettled, blocksFetched, blockText, isBlocked, NO_BLOCKS } from './blocks.ts';
import { friendText } from './chat.ts';
import type { HideoutChat } from './hideout-chat.ts';
import type { Mutes } from './mute.ts';
import type { CloseReason, EntryId, MenuFacts } from './player-menu.ts';
import { closeReason, friendStanding } from './player-menu.ts';
import type { MenuChoice, PlayerMenuView } from './player-menu-view.ts';
import { createPlayerMenuView } from './player-menu-view.ts';

export const HIDEOUT_MENU = { requestMs: 6000 } as const;

export interface Spot {
  readonly x: number;
  readonly z: number;
}

export interface HideoutMenuOptions {
  readonly server: HideoutServer;
  readonly chat: HideoutChat;
  readonly mutes: Mutes;
  readonly others: Others;
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  readonly events: Window;
  readonly openDirect: ((name: string) => void) | null;
  readonly startTrade: ((target: OtherTarget) => void) | null;
}

export interface HideoutMenu {
  press(id: string | null): boolean;
  hover(id: string | null): void;
  handle(event: LiveEvent): void;
  frame(inHideout: boolean, hero: Spot): void;
  isBlocked(name: string): boolean;
}

function signal(): AbortSignal {
  return AbortSignal.timeout(HIDEOUT_MENU.requestMs);
}

export function reportNote(result: ReportResult): string {
  switch (result) {
    case 'reported':
      return 'Reported. Thank you.';
    case 'gone':
      return 'That player is gone.';
    case 'own':
      return 'That is one of your own characters.';
    case 'slow':
      return 'Too many reports. Try again later.';
    case 'unsupported':
      return 'Reports are not available here.';
    case 'failed':
      return 'The report could not be sent.';
  }
  return 'The report could not be sent.';
}

export function startHideoutMenu(options: HideoutMenuOptions): HideoutMenu {
  const { server, chat, mutes, others } = options;
  let openId: string | null = null;
  let target: OtherTarget | null = null;
  let hovered: string | null = null;
  let blocks: BlocksState = NO_BLOCKS;
  let reportAvailable: boolean = true;
  const reported: Set<string> = new Set<string>();
  const busy: Set<EntryId> = new Set<EntryId>();

  const facts = (name: string): MenuFacts => ({
    friend: friendStanding(chat.friends().list, name),
    friendsAvailable: chat.friends().available,
    muted: mutes.has(name),
    blocked: isBlocked(blocks, name),
    blocksAvailable: blocks.available,
    reportAvailable,
    canMessage: options.openDirect !== null,
    canTrade: options.startTrade !== null,
    reported: reported.has(name.toLowerCase()),
    busy,
  });

  const rerender = (): void => {
    if (target !== null && view.isOpen()) view.render(facts(target.name));
  };

  const fetchBlocks = async (): Promise<void> => {
    const token: string | null = server.token();
    const result: BlocksResult = token === null ? { kind: 'failed' } : await server.api.blocks(token, signal());
    blocks = blocksFetched(blocks, result);
    rerender();
  };

  const work = async (entry: EntryId, run: () => Promise<string | null>): Promise<void> => {
    busy.add(entry);
    rerender();
    const said: string | null = await run();
    busy.delete(entry);
    view.step('entries');
    if (said !== null) view.note(said);
    rerender();
  };

  const befriend = (name: string, accept: boolean): void => {
    void work('friend', async (): Promise<string | null> => {
      const result: FriendResult = accept ? await chat.accept(name) : await chat.befriend(name);
      return friendText(result, name);
    });
  };

  const setBlock = (name: string, blocking: boolean): void => {
    void work('block', async (): Promise<string | null> => {
      const token: string | null = server.token();
      const result: BlockResult = token === null ? { kind: 'failed' } : blocking ? await server.api.block(token, name, signal()) : await server.api.unblock(token, name, signal());
      blocks = blockSettled(blocks, name, result);
      if (result.kind === 'ok') chat.refreshFriends();
      if (result.kind === 'ok') return blocking ? `${name} is blocked.` : `${name} is unblocked.`;
      return blockText(result, name, blocking);
    });
  };

  const report = (name: string, reason: ReportReason): void => {
    void work('report', async (): Promise<string | null> => {
      const token: string | null = server.token();
      const result: ReportResult = token === null ? 'failed' : await server.api.reportPlayer(token, name, reason, signal());
      if (result === 'reported') reported.add(name.toLowerCase());
      if (result === 'unsupported') reportAvailable = false;
      return reportNote(result);
    });
  };

  const choose = (choice: MenuChoice): void => {
    if (target === null) return;
    const name: string = target.name;
    switch (choice.type) {
      case 'message':
        options.openDirect?.(name);
        view.close('outside');
        return;
      case 'trade':
        options.startTrade?.(target);
        view.close('outside');
        return;
      case 'befriend':
        befriend(name, false);
        return;
      case 'accept':
        befriend(name, true);
        return;
      case 'mute':
      case 'unmute':
        mutes.toggle(name);
        chat.mutesChanged();
        view.note(mutes.has(name) ? `${name}'s chat is hidden.` : `${name}'s chat is shown.`);
        rerender();
        return;
      case 'ask_block':
        view.step('confirm_block');
        return;
      case 'block':
        setBlock(name, true);
        return;
      case 'unblock':
        setBlock(name, false);
        return;
      case 'ask_report':
        view.step('report');
        return;
      case 'report':
        report(name, choice.reason);
        return;
    }
  };

  const view: PlayerMenuView = createPlayerMenuView({
    root: options.root,
    frame: options.frame,
    events: options.events,
    choose,
    closed: (_reason: CloseReason): void => {
      openId = null;
      target = null;
    },
  });

  chat.onFriends((): void => {
    rerender();
  });

  return {
    press(id: string | null): boolean {
      const tookOutside: boolean = view.takeCanvasPress();
      if (id === null) return tookOutside;
      const found: OtherTarget | null = others.target(id);
      const anchor: ScreenAnchor | null = others.anchorOf(id);
      if (found === null || anchor === null) return tookOutside;
      openId = id;
      target = found;
      view.open(found, facts(found.name), anchor, true);
      if (chat.friends().list === null) chat.refreshFriends();
      return true;
    },
    hover(id: string | null): void {
      hovered = id;
    },
    handle(event: LiveEvent): void {
      if (event.type === 'present') void fetchBlocks();
      if (event.type === 'gone' && view.isOpen()) view.close('zone');
    },
    frame(inHideout: boolean, hero: Spot): void {
      others.light(hovered ?? openId);
      if (openId === null || !view.isOpen()) return;
      const ground: Spot | null = others.groundOf(openId);
      const anchor: ScreenAnchor | null = others.anchorOf(openId);
      const reason: CloseReason | null = closeReason({
        here: others.target(openId) !== null,
        inHideout,
        distance: ground === null ? null : Math.hypot(ground.x - hero.x, ground.z - hero.z),
        anchor,
        view: { width: options.frame.clientWidth, height: options.frame.clientHeight },
      });
      if (reason !== null) {
        view.close(reason);
        return;
      }
      if (anchor !== null) view.place(anchor);
    },
    isBlocked: (name: string): boolean => isBlocked(blocks, name),
  };
}

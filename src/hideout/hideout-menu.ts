import type { FriendResult, ReportReason, ReportResult } from '../backend/api.ts';
import type { HideoutServer } from '../backend/browser.ts';
import type { BlockResult, BlocksResult } from '../backend/hideout-api.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { Others, OtherTarget, ScreenAnchor } from '../render/others.ts';
import type { BlocksState } from './blocks.ts';
import { blockSettled, blocksFetched, blockText, isBlocked, NO_BLOCKS } from './blocks.ts';
import { friendText, reportText } from './chat.ts';
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
  openName(name: string, line: ChatLine | null, anchor: HTMLElement): void;
}

export type MenuOrigin = { readonly kind: 'world'; readonly target: OtherTarget } | { readonly kind: 'chat'; readonly name: string; readonly line: ChatLine | null };

export type ReportRoute = { readonly kind: 'line'; readonly line: ChatLine } | { readonly kind: 'player'; readonly name: string };

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function originName(origin: MenuOrigin): string {
  return origin.kind === 'world' ? origin.target.name : origin.name;
}

export function reportRoute(origin: MenuOrigin): ReportRoute {
  if (origin.kind === 'chat' && origin.line !== null) return { kind: 'line', line: origin.line };
  return { kind: 'player', name: originName(origin) };
}

export function reportKey(origin: MenuOrigin): string {
  const route: ReportRoute = reportRoute(origin);
  return route.kind === 'line' ? `line:${String(route.line.id)}` : `name:${route.name.toLowerCase()}`;
}

export function tradeFrom(origin: MenuOrigin, canTrade: boolean): boolean {
  return canTrade && origin.kind === 'world';
}

export function boxAnchor(box: Box, frame: Box): ScreenAnchor {
  return { x: box.left + box.width / 2 - frame.left, top: box.top - frame.top, bottom: box.top + box.height - frame.top };
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
  let origin: MenuOrigin | null = null;
  let nameAnchor: HTMLElement | null = null;
  let hovered: string | null = null;
  let blocks: BlocksState = NO_BLOCKS;
  let settled: number = 0;
  let reportAvailable: boolean = true;
  const reported: Set<string> = new Set<string>();
  const busy: Set<EntryId> = new Set<EntryId>();

  const facts = (from: MenuOrigin): MenuFacts => {
    const name: string = originName(from);
    return {
    friend: friendStanding(chat.friends().list, name),
    friendsAvailable: chat.friends().available,
    muted: mutes.has(name),
    blocked: isBlocked(blocks, name),
    blocksAvailable: blocks.available,
    reportAvailable,
    canMessage: options.openDirect !== null,
    canTrade: tradeFrom(from, options.startTrade !== null),
    reported: reported.has(reportKey(from)),
    busy,
    };
  };

  const rerender = (): void => {
    if (origin !== null && view.isOpen()) view.render(facts(origin));
  };

  const fetchBlocks = async (): Promise<void> => {
    const token: string | null = server.token();
    const asked: number = settled;
    const result: BlocksResult = token === null ? { kind: 'failed' } : await server.api.blocks(token, signal());
    if (asked !== settled) return;
    blocks = blocksFetched(blocks, result);
    rerender();
  };

  const work = async (entry: EntryId, run: () => Promise<string | null>): Promise<void> => {
    busy.add(entry);
    rerender();
    let said: string | null = null;
    try {
      said = await run();
    } finally {
      busy.delete(entry);
      view.step('entries');
      if (said !== null) view.note(said);
      rerender();
    }
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
      settled += 1;
      blocks = blockSettled(blocks, name, result);
      if (result.kind !== 'ok') return blockText(result, name, blocking);
      chat.refreshFriends();
      if (!blocking) return mutes.has(name) ? `${name} is unblocked. Their chat stays hidden until you unmute them.` : `${name} is unblocked.`;
      if (!mutes.has(name)) mutes.toggle(name);
      chat.mutesChanged();
      return `${name} is blocked.`;
    });
  };

  const report = (from: MenuOrigin, reason: ReportReason): void => {
    void work('report', async (): Promise<string | null> => {
      const token: string | null = server.token();
      const route: ReportRoute = reportRoute(from);
      const result: ReportResult = token === null ? 'failed' : route.kind === 'line' ? await server.api.report(token, route.line.id, reason, signal()) : await server.api.reportPlayer(token, route.name, reason, signal());
      if (result === 'reported') reported.add(reportKey(from));
      if (result === 'unsupported') reportAvailable = false;
      return route.kind === 'line' ? reportText(result) : reportNote(result);
    });
  };

  const choose = (choice: MenuChoice): void => {
    if (origin === null) return;
    const from: MenuOrigin = origin;
    const name: string = originName(from);
    switch (choice.type) {
      case 'message':
        options.openDirect?.(name);
        view.close('outside');
        return;
      case 'trade':
        if (from.kind === 'world') options.startTrade?.(from.target);
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
        report(from, choice.reason);
        return;
    }
  };

  const anchorOf = (element: HTMLElement): ScreenAnchor => boxAnchor(element.getBoundingClientRect(), options.frame.getBoundingClientRect());

  const view: PlayerMenuView = createPlayerMenuView({
    root: options.root,
    frame: options.frame,
    events: options.events,
    choose,
    closed: (_reason: CloseReason): void => {
      openId = null;
      origin = null;
      nameAnchor = null;
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
      nameAnchor = null;
      origin = { kind: 'world', target: found };
      view.open(found, facts(origin), anchor, true);
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
      if (!view.isOpen()) return;
      if (openId === null) {
        if (nameAnchor?.isConnected === true) view.place(anchorOf(nameAnchor));
        return;
      }
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
    openName(name: string, line: ChatLine | null, element: HTMLElement): void {
      openId = null;
      nameAnchor = element;
      origin = { kind: 'chat', name, line };
      view.open({ name, username: null }, facts(origin), anchorOf(element), true);
      if (chat.friends().list === null) chat.refreshFriends();
    },
  };
}

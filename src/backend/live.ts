import type { Clock, Timers } from './backend.ts';
import { chatRefusal, enterFrame, helloFrame, leaveFrame, LIVE_ZONE, liveUrl, moveFrame, readServerFrame, sayable, sayFrame } from './live-protocol.ts';
import type { ChatLine, ChatRefusal, LiveMove, LivePlayer, Place, ServerFrame, Worn } from './live-protocol.ts';

export const LIVE = {
  moveEveryMs: 100,
  firstRetryMs: 1000,
  longestRetryMs: 30000,
  jitterFloor: 0.5,
  tokenWaitMs: 3000,
  stillWithin: 0.01,
} as const;

export interface SocketHandlers {
  open(): void;
  message(data: unknown): void;
  closed(code: number): void;
}

export interface LiveSocket {
  send(text: string): void;
  close(): void;
}

export type OpenSocket = (url: string, handlers: SocketHandlers) => LiveSocket;

export type LiveEvent =
  | { readonly type: 'present'; readonly you: string; readonly players: readonly LivePlayer[]; readonly chat: readonly ChatLine[] | null }
  | { readonly type: 'said'; readonly line: ChatLine }
  | { readonly type: 'refused'; readonly reason: ChatRefusal }
  | { readonly type: 'joined'; readonly player: LivePlayer }
  | { readonly type: 'left'; readonly id: string }
  | { readonly type: 'look'; readonly id: string; readonly hero: string | null; readonly worn: Worn }
  | { readonly type: 'moves'; readonly moves: readonly LiveMove[]; readonly at: number }
  | { readonly type: 'gone' };

export type LiveListener = (event: LiveEvent) => void;

export interface Stand {
  readonly zone: string | null;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export interface Live {
  update(stand: Stand): void;
  say(text: string): boolean;
  subscribe(listener: LiveListener): () => void;
}

export interface LiveOptions {
  readonly serverUrl: string;
  readonly open: OpenSocket;
  readonly token: () => string | null;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly random: () => number;
}

export function retryDelayMs(failures: number, random: number): number {
  const capped: number = Math.min(LIVE.longestRetryMs, LIVE.firstRetryMs * 2 ** Math.max(0, failures));
  return capped * (LIVE.jitterFloor + (1 - LIVE.jitterFloor) * Math.min(1, Math.max(0, random)));
}

function moved(from: Place, to: Place): boolean {
  return Math.abs(from.x - to.x) >= LIVE.stillWithin || Math.abs(from.z - to.z) >= LIVE.stillWithin || Math.abs(from.facing - to.facing) >= LIVE.stillWithin;
}

function quietly(work: () => void): void {
  try {
    work();
  } catch {
    return;
  }
}

export function createLive(options: LiveOptions): Live {
  const { clock, timers } = options;
  const listeners: Set<LiveListener> = new Set<LiveListener>();
  let socket: LiveSocket | null = null;
  let welcomed: boolean = false;
  let entered: boolean = false;
  let shown: boolean = false;
  let present: boolean = false;
  let standDown: boolean = false;
  let failures: number = 0;
  let refusals: number = 0;
  let enterAfter: number = Number.NEGATIVE_INFINITY;
  let retry: (() => void) | null = null;
  let sent: Place | null = null;
  let sentAt: number = Number.NEGATIVE_INFINITY;
  let here: Place = { x: 0, z: 0, facing: 0 };

  const emit = (event: LiveEvent): void => {
    if (event.type === 'gone') {
      if (!shown) return;
      shown = false;
    } else shown = true;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        continue;
      }
    }
  };

  const send = (text: string): void => {
    const open: LiveSocket | null = socket;
    if (open !== null) quietly((): void => open.send(text));
  };

  const drop = (): void => {
    const closing: LiveSocket | null = socket;
    socket = null;
    welcomed = false;
    entered = false;
    present = false;
    sent = null;
    if (closing !== null) quietly((): void => closing.close());
    emit({ type: 'gone' });
  };

  const waitThen = (delay: number): void => {
    retry?.();
    retry = timers.after(delay, (): void => {
      retry = null;
    });
  };

  const backOff = (): void => {
    waitThen(retryDelayMs(failures, options.random()));
    failures += 1;
  };

  const receive = (frame: ServerFrame): void => {
    switch (frame.type) {
      case 'welcome':
        welcomed = true;
        failures = 0;
        return;
      case 'present':
        refusals = 0;
        present = frame.chat !== null;
        emit({ type: 'present', you: frame.you, players: frame.players.filter((player: LivePlayer): boolean => player.id !== frame.you), chat: frame.chat });
        return;
      case 'said':
        emit({ type: 'said', line: frame.line });
        return;
      case 'joined':
        emit({ type: 'joined', player: frame.player });
        return;
      case 'left':
        emit({ type: 'left', id: frame.id });
        return;
      case 'look':
        emit({ type: 'look', id: frame.id, hero: frame.hero, worn: frame.worn });
        return;
      case 'moves':
        emit({ type: 'moves', moves: frame.moves, at: clock() });
        return;
      case 'full':
      case 'replaced':
        standDown = true;
        drop();
        return;
      case 'refused': {
        const chat: ChatRefusal | null = chatRefusal(frame.reason);
        if (chat !== null) {
          emit({ type: 'refused', reason: chat });
          return;
        }
        entered = false;
        present = false;
        sent = null;
        enterAfter = clock() + retryDelayMs(refusals, options.random());
        refusals += 1;
        return;
      }
    }
  };

  const connect = (): void => {
    const token: string | null = options.token();
    if (token === null) {
      waitThen(LIVE.tokenWaitMs);
      return;
    }
    let opened: LiveSocket | null = null;
    const handlers: SocketHandlers = {
      open(): void {
        if (socket === opened) send(helloFrame(token));
      },
      message(data: unknown): void {
        if (socket !== opened) return;
        const frame: ServerFrame | null = readServerFrame(data);
        if (frame !== null) receive(frame);
      },
      closed(): void {
        if (socket !== opened) return;
        drop();
        backOff();
      },
    };
    try {
      opened = options.open(liveUrl(options.serverUrl), handlers);
      socket = opened;
    } catch {
      socket = null;
      backOff();
    }
  };

  const leave = (): void => {
    if (entered) send(leaveFrame());
    drop();
    retry?.();
    retry = null;
    failures = 0;
    refusals = 0;
    enterAfter = Number.NEGATIVE_INFINITY;
    standDown = false;
  };

  const stay = (): void => {
    if (standDown) return;
    if (socket === null) {
      if (retry === null) connect();
      return;
    }
    if (!welcomed) return;
    const now: number = clock();
    if (!entered) {
      if (now < enterAfter) return;
      send(enterFrame(here));
      entered = true;
      sent = here;
      sentAt = now;
      return;
    }
    if (now - sentAt < LIVE.moveEveryMs || (sent !== null && !moved(sent, here))) return;
    send(moveFrame(here));
    sent = here;
    sentAt = now;
  };

  return {
    update(stand: Stand): void {
      here = { x: stand.x, z: stand.z, facing: stand.facing };
      if (stand.zone === LIVE_ZONE) stay();
      else if (socket !== null || retry !== null || standDown) leave();
    },
    say(text: string): boolean {
      const line: string | null = sayable(text);
      if (line === null || !present) return false;
      send(sayFrame(line));
      return true;
    },
    subscribe(listener: LiveListener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

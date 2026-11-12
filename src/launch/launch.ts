import { endedActs } from '../../sim/world/flags.ts';
import type { World } from '../../sim/world/types.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { readServerUrl } from '../backend/server-url.ts';
import type { ServerUrl } from '../backend/server-url.ts';
import { parseSyncRecord, SYNC_KEY } from '../backend/sync-record.ts';
import { createBrowserStore } from '../storage.ts';
import { feedbackBody, LAUNCH_KEY, readLaunchState, serializeLaunchState, takeEnd } from './alpha.ts';
import type { CountedEvent, Device, FeedbackContext, LaunchState, Progress, Rating } from './alpha.ts';
import { ALPHA_RULES, LINKS } from './data.ts';
import { createFeedbackCard } from './feedback-card.ts';
import type { CardHooks, CardMode, FeedbackCard } from './feedback-card.ts';
import { createLaunchLoop } from './launch-loop.ts';
import type { LaunchLoop, SendResult } from './launch-loop.ts';
import { outboundLinks } from './links.ts';
import { addPlayed, PLAYED_KEY, readPlayed } from './played.ts';

export interface LaunchOptions {
  readonly serverUrl: string | undefined;
  readonly build: string | undefined;
  readonly device: Device;
  readonly hud: HTMLElement;
  readonly title: HTMLElement;
}

export interface Launch {
  readonly canSend: boolean;
  update(world: World, dt: number, playing: boolean, choosing: boolean): void;
  note(event: CountedEvent): void;
  open(mode: CardMode): void;
}

const LAUNCH = { observeEvery: 1, saveEvery: 30, requestMs: 8000, secondsPerMinute: 60 } as const;

function connect(server: ServerUrl, store: KeyValueStore, device: Device): LaunchLoop | null {
  if (server.kind !== 'ok') return null;
  const serverUrl: string = server.url;
  return createLaunchLoop({
    serverUrl,
    fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
    store,
    timers: createBrowserTimers(),
    rules: ALPHA_RULES,
    device,
    token: (): string | null => parseSyncRecord(store.read(SYNC_KEY), serverUrl)?.token ?? null,
    signal: (): AbortSignal => AbortSignal.timeout(LAUNCH.requestMs),
  });
}

function endOnDevice(store: KeyValueStore): (progress: Progress) => boolean {
  let state: LaunchState = readLaunchState(store.read(LAUNCH_KEY));
  return (progress: Progress): boolean => {
    const next: LaunchState | null = takeEnd(state, ALPHA_RULES, progress);
    if (next === null) return false;
    state = next;
    store.write(LAUNCH_KEY, serializeLaunchState(state));
    return true;
  };
}

export function startLaunch(options: LaunchOptions): Launch {
  const store: KeyValueStore = createBrowserStore();
  const loop: LaunchLoop | null = connect(readServerUrl(options.serverUrl), store, options.device);
  let played: number = readPlayed(store.read(PLAYED_KEY));
  let unsaved: number = 0;
  let sinceObserved: number = 0;
  let zone: string = 'title';
  let level: number = 1;

  const savePlayed = (): void => {
    if (unsaved === 0) return;
    unsaved = 0;
    store.write(PLAYED_KEY, String(Math.floor(played)));
  };

  const context = (): FeedbackContext => ({ zone, level, minutes: Math.floor(played / LAUNCH.secondsPerMinute), device: options.device, build: options.build ?? '' });
  const hooks: CardHooks = {
    links: outboundLinks(LINKS),
    site: LINKS.site,
    send: loop === null ? null : (rating: Rating, text: string): Promise<SendResult> => loop.send(feedbackBody(rating, text, context())),
  };
  const card: FeedbackCard = createFeedbackCard(options.hud, 'game', hooks);
  const titleCard: FeedbackCard | null = loop === null ? null : createFeedbackCard(options.title, 'title', hooks);
  const takeEndCard: (progress: Progress) => boolean = loop === null ? endOnDevice(store) : (progress: Progress): boolean => loop.takeEndCard(progress);
  let endTaken: boolean = false;

  if (titleCard !== null) document.getElementById('title-feedback')?.addEventListener('click', (): void => titleCard.open('ask'));
  if (loop !== null) {
    loop.note('opened_game');
    void loop.flush();
    window.addEventListener('online', (): void => void loop.flush());
  }
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) savePlayed();
  });

  return {
    canSend: loop !== null,
    update(world: World, dt: number, playing: boolean, choosing: boolean): void {
      zone = world.zone.id;
      level = world.player.level;
      if (playing && titleCard?.isOpen === true) titleCard.close();
      if (!playing) return;
      played = addPlayed(played, dt);
      unsaved += dt;
      if (unsaved > LAUNCH.saveEvery) savePlayed();
      if (!endTaken && !choosing && takeEndCard({ flags: world.flags, ended: endedActs(world) })) {
        endTaken = true;
        card.open('end');
      }
      sinceObserved += dt;
      if (sinceObserved < LAUNCH.observeEvery) return;
      sinceObserved = 0;
      loop?.observe({ zone: world.zone.id, flags: world.flags, alive: world.player.alive });
    },
    note: (event: CountedEvent): void => loop?.note(event),
    open: (mode: CardMode): void => card.open(mode),
  };
}

import { endedActs } from '../../sim/world/flags.ts';
import type { World } from '../../sim/world/types.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { readServerUrl } from '../backend/server-url.ts';
import type { ServerUrl } from '../backend/server-url.ts';
import { parseSyncRecord, SYNC_KEY } from '../backend/sync-record.ts';
import { createBrowserStore } from '../storage.ts';
import { feedbackBody } from './alpha.ts';
import type { CountedEvent, Device, FeedbackContext, Rating } from './alpha.ts';
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
  update(world: World, dt: number, playing: boolean): void;
  note(event: CountedEvent): void;
  open(mode: CardMode): void;
}

const LAUNCH = { observeEvery: 1, saveEvery: 30, requestMs: 8000, secondsPerMinute: 60 } as const;

export function startLaunch(options: LaunchOptions): Launch | null {
  const server: ServerUrl = readServerUrl(options.serverUrl);
  if (server.kind !== 'ok') return null;
  const serverUrl: string = server.url;
  const store: KeyValueStore = createBrowserStore();
  const loop: LaunchLoop = createLaunchLoop({
    serverUrl,
    fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
    store,
    timers: createBrowserTimers(),
    rules: ALPHA_RULES,
    device: options.device,
    token: (): string | null => parseSyncRecord(store.read(SYNC_KEY), serverUrl)?.token ?? null,
    signal: (): AbortSignal => AbortSignal.timeout(LAUNCH.requestMs),
  });
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
    send: (rating: Rating, text: string): Promise<SendResult> => loop.send(feedbackBody(rating, text, context())),
  };
  const card: FeedbackCard = createFeedbackCard(options.hud, 'game', hooks);
  const titleCard: FeedbackCard = createFeedbackCard(options.title, 'title', hooks);

  document.getElementById('title-feedback')?.addEventListener('click', (): void => titleCard.open('ask'));
  loop.note('opened_game');
  void loop.flush();
  window.addEventListener('online', (): void => void loop.flush());
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) savePlayed();
  });

  return {
    update(world: World, dt: number, playing: boolean): void {
      zone = world.zone.id;
      level = world.player.level;
      if (playing && titleCard.isOpen) titleCard.close();
      if (!playing) return;
      played = addPlayed(played, dt);
      unsaved += dt;
      if (unsaved > LAUNCH.saveEvery) savePlayed();
      sinceObserved += dt;
      if (sinceObserved < LAUNCH.observeEvery) return;
      sinceObserved = 0;
      loop.observe({ zone: world.zone.id, flags: world.flags, alive: world.player.alive });
      if (loop.takeEndCard(endedActs(world))) card.open('end');
    },
    note: (event: CountedEvent): void => loop.note(event),
    open: (mode: CardMode): void => card.open(mode),
  };
}

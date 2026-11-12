import type { FetchFn } from '../backend/api.ts';
import type { KeyValueStore, Timers } from '../backend/backend.ts';
import { afterCount, afterFeedback, LAUNCH_KEY, markEndShown, noteEvent, outcomeOf, queueFeedback, reachedEvents, readLaunchState, retryDelay, serializeLaunchState, shouldShowEnd } from './alpha.ts';
import type { AlphaRules, CountedEvent, Device, FeedbackBody, LaunchState, Outcome, Snapshot } from './alpha.ts';

export type SendResult = 'sent' | 'queued' | 'rejected';

export interface LaunchDeps {
  readonly serverUrl: string;
  readonly fetch: FetchFn;
  readonly store: KeyValueStore;
  readonly timers: Timers;
  readonly rules: AlphaRules;
  readonly device: Device;
  readonly token: () => string | null;
  readonly signal: () => AbortSignal | undefined;
}

export interface LaunchLoop {
  note(event: CountedEvent): void;
  observe(snapshot: Snapshot): void;
  takeEndCard(ended: ReadonlySet<string>): boolean;
  send(body: FeedbackBody): Promise<SendResult>;
  flush(): Promise<void>;
  state(): LaunchState;
}

export function createLaunchLoop(deps: LaunchDeps): LaunchLoop {
  let state: LaunchState = readLaunchState(deps.store.read(LAUNCH_KEY));
  let flushing: Promise<void> | null = null;
  let failures: number = 0;
  let retryCancel: (() => void) | null = null;

  const keep = (next: LaunchState): void => {
    if (next === state) return;
    state = next;
    deps.store.write(LAUNCH_KEY, serializeLaunchState(state));
  };

  const post = async (path: string, body: unknown, token: string | null): Promise<Outcome> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;
    const signal: AbortSignal | undefined = deps.signal();
    const init: RequestInit = signal === undefined ? { method: 'POST', headers, body: JSON.stringify(body) } : { method: 'POST', headers, body: JSON.stringify(body), signal };
    try {
      const response: Response = await deps.fetch(`${deps.serverUrl}${path}`, init);
      return outcomeOf(response.status);
    } catch {
      return 'retry';
    }
  };

  const sendCount = (event: CountedEvent): Promise<Outcome> => post('/v1/counts', { event, device: deps.device }, null);
  const sendFeedback = (body: FeedbackBody): Promise<Outcome> => post('/v1/feedback', body, deps.token());

  const deliverFeedback = async (body: FeedbackBody): Promise<Outcome> => {
    const outcome: Outcome = await sendFeedback(body);
    keep(afterFeedback(state, body, outcome));
    if (outcome === 'sent') keep(noteEvent(state, 'sent_feedback'));
    return outcome;
  };

  const schedule = (): void => {
    if (retryCancel !== null) return;
    failures += 1;
    retryCancel = deps.timers.after(retryDelay(failures), (): void => {
      retryCancel = null;
      void loop.flush();
    });
  };

  const drainFeedback = async (): Promise<boolean> => {
    const body: FeedbackBody | undefined = state.outbox[0];
    if (body === undefined) return true;
    if ((await deliverFeedback(body)) === 'retry') return false;
    return drainFeedback();
  };

  const drainCounts = async (): Promise<boolean> => {
    const event: CountedEvent | undefined = state.pending[0];
    if (event === undefined) return true;
    const outcome: Outcome = await sendCount(event);
    keep(afterCount(state, event, outcome));
    if (outcome === 'retry') return false;
    return drainCounts();
  };

  const drain = async (): Promise<void> => {
    const clear: boolean = (await drainFeedback()) && (await drainCounts());
    if (clear) failures = 0;
    else schedule();
  };

  const loop: LaunchLoop = {
    note(event: CountedEvent): void {
      const next: LaunchState = noteEvent(state, event);
      if (next === state) return;
      keep(next);
      void loop.flush();
    },
    observe(snapshot: Snapshot): void {
      for (const event of reachedEvents(deps.rules, snapshot)) loop.note(event);
    },
    takeEndCard(ended: ReadonlySet<string>): boolean {
      if (!shouldShowEnd(state, deps.rules, ended)) return false;
      keep(markEndShown(state));
      return true;
    },
    async send(body: FeedbackBody): Promise<SendResult> {
      keep(queueFeedback(state, body));
      if (flushing !== null) await flushing;
      if (!state.outbox.includes(body)) return 'sent';
      const outcome: Outcome = await deliverFeedback(body);
      if (outcome === 'retry') schedule();
      else void loop.flush();
      return outcome === 'sent' ? 'sent' : outcome === 'rejected' ? 'rejected' : 'queued';
    },
    flush(): Promise<void> {
      if (flushing !== null) return flushing;
      if (retryCancel !== null) {
        retryCancel();
        retryCancel = null;
      }
      flushing = drain().finally((): void => {
        flushing = null;
      });
      return flushing;
    },
    state: (): LaunchState => state,
  };
  return loop;
}

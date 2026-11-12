export const TRANSITION = {
  cleanFrames: 4,
  cleanFrameMs: 22,
  slackOverTypical: 1.5,
  typicalWindow: 30,
  settleMaxMs: 3000,
  lightFrom: 0.5,
} as const;

import type { ZoneDef } from '../sim/content/types.ts';
import type { WorldEvent } from '../sim/world/types.ts';
import type { Clock, Timers } from './backend/backend.ts';

export interface Veil {
  cover(colour: string | null): Promise<void>;
  lift(): Promise<void>;
}

export interface TransitionReport {
  readonly coverMs: number;
  readonly buildMs: number;
  readonly settleMs: number;
  readonly settled: boolean;
  readonly worstHiddenMs: number;
  readonly worstShownMs: number;
}

export interface ZoneTransition {
  readonly blocking: boolean;
  readonly presenting: boolean;
  begin(swap: () => Promise<void>, colour: string | null, reveal: () => void): void;
  frame(dtMs: number): void;
}

export interface TransitionDeps {
  readonly veil: Veil;
  readonly timers: Timers;
  readonly now: Clock;
  readonly onError: (error: unknown) => void;
  readonly onReport: (report: TransitionReport) => void;
}

type Phase = 'idle' | 'covering' | 'building' | 'settling' | 'lifting';

export function veilColour(zones: ReadonlyMap<string, ZoneDef>, events: readonly WorldEvent[]): string | null {
  for (const event of events) {
    if (event.type !== 'zone_changed') continue;
    const leaving: string | null = zones.get(event.from)?.ambience.background ?? null;
    const entering: string | null = zones.get(event.to)?.ambience.background ?? null;
    if (entering === null || leaving === null) return null;
    if (isLight(entering) && !isLight(leaving)) return leaving;
    return entering;
  }
  return null;
}

export function isLight(colour: string | null): boolean {
  if (colour === null) return false;
  const hex: RegExpExecArray | null = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  const digits: string | undefined = hex?.[1];
  if (digits === undefined) return false;
  const channel = (from: number): number => Number.parseInt(digits.slice(from, from + 2), 16) / 255;
  const luminance: number = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance >= TRANSITION.lightFrom;
}

export function cleanFrameLimit(recent: readonly number[]): number {
  if (recent.length === 0) return TRANSITION.cleanFrameMs;
  const sorted: number[] = recent.toSorted((a: number, b: number): number => a - b);
  const median: number = sorted[Math.floor(sorted.length / 2)] ?? TRANSITION.cleanFrameMs;
  return Math.max(TRANSITION.cleanFrameMs, median * TRANSITION.slackOverTypical);
}

export function describeTransition(report: TransitionReport): string {
  const settle: string = report.settled ? 'settled' : 'gave up settling';
  return `Zone change: covered in ${report.coverMs.toFixed(0)} ms, built in ${report.buildMs.toFixed(0)} ms, ${settle} in ${report.settleMs.toFixed(0)} ms; worst frame ${report.worstShownMs.toFixed(1)} ms in view, ${report.worstHiddenMs.toFixed(1)} ms behind the veil`;
}

export function createZoneTransition(deps: TransitionDeps): ZoneTransition {
  const { veil, timers, now } = deps;
  let phase: Phase = 'idle';
  const recent: number[] = [];
  let limit: number = TRANSITION.cleanFrameMs;
  let clean: number = 0;
  let worstHidden: number = 0;
  let worstShown: number = 0;
  let settledNow: (() => void) | null = null;

  const settle = (): Promise<boolean> =>
    new Promise<boolean>((resolve: (settled: boolean) => void): void => {
      clean = 0;
      const cancel: () => void = timers.after(TRANSITION.settleMaxMs, (): void => {
        settledNow = null;
        resolve(false);
      });
      settledNow = (): void => {
        settledNow = null;
        cancel();
        resolve(true);
      };
    });

  const run = async (swap: () => Promise<void>, colour: string | null, reveal: () => void): Promise<void> => {
    worstHidden = 0;
    worstShown = 0;
    limit = cleanFrameLimit(recent);
    const started: number = now();
    phase = 'covering';
    await veil.cover(colour);
    const covered: number = now();
    phase = 'building';
    await swap();
    const built: number = now();
    phase = 'settling';
    const settled: boolean = await settle();
    const ready: number = now();
    phase = 'lifting';
    reveal();
    await veil.lift();
    phase = 'idle';
    deps.onReport({ coverMs: covered - started, buildMs: built - covered, settleMs: ready - built, settled, worstHiddenMs: worstHidden, worstShownMs: worstShown });
  };

  return {
    get blocking(): boolean {
      return phase !== 'idle' && phase !== 'lifting';
    },
    get presenting(): boolean {
      return phase === 'idle' || phase === 'settling' || phase === 'lifting';
    },
    begin(swap: () => Promise<void>, colour: string | null, reveal: () => void): void {
      if (phase !== 'idle') return;
      run(swap, colour, reveal).catch((error: unknown): void => {
        settledNow = null;
        phase = 'idle';
        veil.lift().catch((): void => undefined);
        deps.onError(error);
      });
    },
    frame(dtMs: number): void {
      switch (phase) {
        case 'idle':
          recent.push(dtMs);
          if (recent.length > TRANSITION.typicalWindow) recent.shift();
          return;
        case 'covering':
        case 'lifting':
          worstShown = Math.max(worstShown, dtMs);
          return;
        case 'building':
          worstHidden = Math.max(worstHidden, dtMs);
          return;
        case 'settling':
          worstHidden = Math.max(worstHidden, dtMs);
          clean = dtMs <= limit ? clean + 1 : 0;
          if (clean >= TRANSITION.cleanFrames) settledNow?.();
          return;
      }
    },
  };
}

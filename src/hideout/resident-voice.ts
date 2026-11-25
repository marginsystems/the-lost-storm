import type { FetchFn } from '../backend/api.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';

export const RESIDENT_VOICE = {
  path: '/v1/voice/line',
  requestMs: 8000,
  maxBytes: 524288,
  waiting: 2,
} as const;

export interface Ground {
  readonly x: number;
  readonly z: number;
}

export interface ResidentVoiceOptions {
  readonly serverUrl: string;
  readonly fetch: FetchFn;
  readonly standsAt: (line: ChatLine) => Ground | null;
  readonly speak: (audio: ArrayBuffer, at: Ground) => Promise<void>;
  readonly heard?: (line: ChatLine, phase: VoicePhase) => void;
}

export type VoicePhase = 'started' | 'ended' | 'failed';

export interface ResidentVoice {
  handle(event: LiveEvent): void;
}

export interface VoicedLine {
  readonly line: ChatLine;
  readonly voice: string;
}

export function spokenLine(event: LiveEvent): ChatLine | null {
  if (event.type === 'said') return event.line;
  if (event.type === 'whisper' && event.dir === 'from') return event.line;
  return null;
}

export function lineToVoice(event: LiveEvent, standsAt: (line: ChatLine) => Ground | null): VoicedLine | null {
  const line: ChatLine | null = spokenLine(event);
  if (line === null || line.resident !== true || line.voice === undefined || line.own === true) return null;
  return standsAt(line) === null ? null : { line, voice: line.voice };
}

export function voiceUrl(serverUrl: string, voice: string): string {
  return `${serverUrl}${RESIDENT_VOICE.path}/${voice}`;
}

async function fetchClip(options: ResidentVoiceOptions, voice: string): Promise<ArrayBuffer | null> {
  try {
    const response: Response = await options.fetch(voiceUrl(options.serverUrl, voice), { method: 'GET', signal: AbortSignal.timeout(RESIDENT_VOICE.requestMs) });
    if (!response.ok) return null;
    const audio: ArrayBuffer = await response.arrayBuffer();
    return audio.byteLength === 0 || audio.byteLength > RESIDENT_VOICE.maxBytes ? null : audio;
  } catch {
    return null;
  }
}

export function createResidentVoice(options: ResidentVoiceOptions): ResidentVoice {
  let queued: number = 0;
  let chain: Promise<void> = Promise.resolve();

  const play = async (voiced: VoicedLine, clip: Promise<ArrayBuffer | null>): Promise<void> => {
    const audio: ArrayBuffer | null = await clip;
    const at: Ground | null = options.standsAt(voiced.line);
    if (audio === null || at === null) {
      options.heard?.(voiced.line, 'failed');
      return;
    }
    options.heard?.(voiced.line, 'started');
    try {
      await options.speak(audio, at);
    } finally {
      options.heard?.(voiced.line, 'ended');
    }
  };

  return {
    handle(event: LiveEvent): void {
      const voiced: VoicedLine | null = lineToVoice(event, options.standsAt);
      if (voiced === null) return;
      if (queued >= RESIDENT_VOICE.waiting) {
        options.heard?.(voiced.line, 'failed');
        return;
      }
      const clip: Promise<ArrayBuffer | null> = fetchClip(options, voiced.voice);
      queued += 1;
      chain = chain
        .then((): Promise<void> => play(voiced, clip))
        .catch((): void => undefined)
        .finally((): void => {
          queued -= 1;
        });
    },
  };
}

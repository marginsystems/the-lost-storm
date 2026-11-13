export const VOICE_LINES = {
  fadeSeconds: 0.18,
} as const;

export interface SpokenClip {
  fadeOut(seconds: number): void;
  readonly ended: Promise<void>;
}

export interface VoiceLineDeps<T> {
  find(clipId: string): Promise<string | null>;
  load(path: string): Promise<T | null>;
  play(clip: T): SpokenClip;
}

export interface VoiceLines {
  say(speaker: string, clipId: string): Promise<void>;
  hush(): void;
  speaking(): readonly string[];
}

interface Speaker {
  ticket: number;
  clip: SpokenClip | null;
}

export function createVoiceLines<T>(deps: VoiceLineDeps<T>): VoiceLines {
  const speakers: Map<string, Speaker> = new Map<string, Speaker>();

  const speakerOf = (id: string): Speaker => {
    const known: Speaker | undefined = speakers.get(id);
    if (known !== undefined) return known;
    const fresh: Speaker = { ticket: 0, clip: null };
    speakers.set(id, fresh);
    return fresh;
  };

  const silence = (speaker: Speaker): void => {
    speaker.ticket += 1;
    const clip: SpokenClip | null = speaker.clip;
    speaker.clip = null;
    clip?.fadeOut(VOICE_LINES.fadeSeconds);
  };

  return {
    async say(id: string, clipId: string): Promise<void> {
      const speaker: Speaker = speakerOf(id);
      silence(speaker);
      const ticket: number = speaker.ticket;
      const path: string | null = await deps.find(clipId);
      if (path === null || ticket !== speaker.ticket) return;
      const loaded: T | null = await deps.load(path);
      if (loaded === null || ticket !== speaker.ticket) return;
      const clip: SpokenClip = deps.play(loaded);
      speaker.clip = clip;
      await clip.ended;
      if (speaker.clip === clip) speaker.clip = null;
    },
    hush(): void {
      for (const speaker of speakers.values()) silence(speaker);
    },
    speaking(): readonly string[] {
      return [...speakers.entries()].filter(([, speaker]: [string, Speaker]): boolean => speaker.clip !== null).map(([id]: [string, Speaker]): string => id);
    },
  };
}

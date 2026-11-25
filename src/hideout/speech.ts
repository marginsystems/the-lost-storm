import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';

export const SPEECH = {
  readBaseMs: 1600,
  readPerCharMs: 55,
  readMinMs: 2600,
  readMaxMs: 9000,
  voiceWaitMs: 12000,
  lingerMs: 650,
  heardMinMs: 350,
} as const;

export type Speaker = { readonly kind: 'self' } | { readonly kind: 'other'; readonly id: string } | { readonly kind: 'resident'; readonly id: string | null; readonly name: string };

export interface SpokenLine {
  readonly speaker: Speaker;
  readonly line: number;
  readonly text: string;
  readonly voiced: boolean;
}

export type BubblePhase = { readonly kind: 'waiting'; readonly since: number } | { readonly kind: 'reading'; readonly until: number } | { readonly kind: 'speaking'; readonly since: number };

export interface Bubble {
  readonly key: string;
  readonly speaker: Speaker;
  readonly line: number;
  readonly text: string;
  readonly phase: BubblePhase;
}

export interface SpeechState {
  readonly you: string | null;
  readonly me: string | null;
  readonly bubbles: readonly Bubble[];
}

export const NO_SPEECH: SpeechState = { you: null, me: null, bubbles: [] };

export function speakerKey(speaker: Speaker): string {
  switch (speaker.kind) {
    case 'self':
      return 'self';
    case 'other':
      return `other:${speaker.id}`;
    case 'resident':
      return speaker.id === null ? `resident:${speaker.name.toLowerCase()}` : `other:${speaker.id}`;
  }
  return 'self';
}

export function readingMs(text: string): number {
  return Math.min(SPEECH.readMaxMs, Math.max(SPEECH.readMinMs, SPEECH.readBaseMs + text.trim().length * SPEECH.readPerCharMs));
}

function ownLine(state: SpeechState, line: ChatLine): boolean {
  if (line.own !== null) return line.own;
  return line.from !== null && (line.from === state.you || line.from === state.me);
}

function speakerOf(state: SpeechState, line: ChatLine): Speaker | null {
  if (line.resident === true) return line.own === true ? null : { kind: 'resident', id: line.from, name: line.name };
  if (ownLine(state, line)) return { kind: 'self' };
  return line.from === null ? null : { kind: 'other', id: line.from };
}

function bubbleLine(state: SpeechState, line: ChatLine): SpokenLine | null {
  const text: string = line.text.trim();
  if (text === '') return null;
  const speaker: Speaker | null = speakerOf(state, line);
  return speaker === null ? null : { speaker, line: line.id, text, voiced: line.resident === true && line.voice !== undefined };
}

export function heard(state: SpeechState, event: LiveEvent): SpeechState {
  switch (event.type) {
    case 'welcome':
      return event.you === state.me ? state : { ...state, me: event.you };
    case 'present':
      return event.you === state.you ? state : { ...state, you: event.you };
    case 'gone':
    case 'away':
      return state.bubbles.some((bubble: Bubble): boolean => bubble.speaker.kind !== 'self') ? { ...state, bubbles: state.bubbles.filter((bubble: Bubble): boolean => bubble.speaker.kind === 'self') } : state;
    case 'said':
    case 'whisper':
    case 'refused':
    case 'unsent':
    case 'joined':
    case 'left':
    case 'look':
    case 'moves':
    case 'friends':
    case 'trade':
      return state;
  }
  return state;
}

export function spokenOf(state: SpeechState, event: LiveEvent): SpokenLine | null {
  switch (event.type) {
    case 'said':
      return bubbleLine(state, event.line);
    case 'whisper':
      return event.dir === 'from' && event.line.resident === true && event.line.voice !== undefined ? bubbleLine(state, event.line) : null;
    case 'welcome':
    case 'present':
    case 'refused':
    case 'unsent':
    case 'joined':
    case 'left':
    case 'look':
    case 'moves':
    case 'friends':
    case 'trade':
    case 'away':
    case 'gone':
      return null;
  }
  return null;
}

function withBubble(state: SpeechState, bubble: Bubble): SpeechState {
  return { ...state, bubbles: [...state.bubbles.filter((known: Bubble): boolean => known.key !== bubble.key), bubble] };
}

export function say(state: SpeechState, spoken: SpokenLine, now: number): SpeechState {
  const phase: BubblePhase = spoken.voiced ? { kind: 'waiting', since: now } : { kind: 'reading', until: now + readingMs(spoken.text) };
  return withBubble(state, { key: speakerKey(spoken.speaker), speaker: spoken.speaker, line: spoken.line, text: spoken.text, phase });
}

function changeLine(state: SpeechState, line: number, change: (bubble: Bubble) => BubblePhase): SpeechState {
  const index: number = state.bubbles.findIndex((bubble: Bubble): boolean => bubble.line === line);
  const bubble: Bubble | undefined = state.bubbles[index];
  if (bubble === undefined) return state;
  const phase: BubblePhase = change(bubble);
  if (phase === bubble.phase) return state;
  return { ...state, bubbles: state.bubbles.map((known: Bubble, at: number): Bubble => (at === index ? { ...known, phase } : known)) };
}

export function voiceStarted(state: SpeechState, line: number, now: number): SpeechState {
  return changeLine(state, line, (bubble: Bubble): BubblePhase => (bubble.phase.kind === 'speaking' ? bubble.phase : { kind: 'speaking', since: now }));
}

export function voiceEnded(state: SpeechState, line: number, now: number): SpeechState {
  return changeLine(state, line, (bubble: Bubble): BubblePhase => {
    switch (bubble.phase.kind) {
      case 'speaking':
        return now - bubble.phase.since >= SPEECH.heardMinMs ? { kind: 'reading', until: now + SPEECH.lingerMs } : { kind: 'reading', until: bubble.phase.since + readingMs(bubble.text) };
      case 'waiting':
        return { kind: 'reading', until: now + readingMs(bubble.text) };
      case 'reading':
        return bubble.phase;
    }
    return bubble.phase;
  });
}

export function voiceFailed(state: SpeechState, line: number, now: number): SpeechState {
  return changeLine(state, line, (bubble: Bubble): BubblePhase => (bubble.phase.kind === 'waiting' ? { kind: 'reading', until: now + readingMs(bubble.text) } : bubble.phase));
}

function stillHere(bubble: Bubble, now: number): Bubble | null {
  switch (bubble.phase.kind) {
    case 'speaking':
      return bubble;
    case 'reading':
      return bubble.phase.until > now ? bubble : null;
    case 'waiting':
      return now - bubble.phase.since < SPEECH.voiceWaitMs ? bubble : { ...bubble, phase: { kind: 'reading', until: now + readingMs(bubble.text) } };
  }
  return null;
}

export function expire(state: SpeechState, now: number): SpeechState {
  let changed: boolean = false;
  const bubbles: Bubble[] = [];
  for (const bubble of state.bubbles) {
    const kept: Bubble | null = stillHere(bubble, now);
    if (kept !== bubble) changed = true;
    if (kept !== null) bubbles.push(kept);
  }
  return changed ? { ...state, bubbles } : state;
}

export function shownBubbles(state: SpeechState): readonly Bubble[] {
  return state.bubbles.filter((bubble: Bubble): boolean => bubble.phase.kind !== 'waiting');
}

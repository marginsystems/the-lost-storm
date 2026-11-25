import type { LabelGlide } from '../render/label-glide.ts';
import { createGlide } from '../render/label-glide.ts';
import type { WorldTag } from '../render/world-tag.ts';
import type { Bubble, Speaker } from './speech.ts';

export const SPEECH_BUBBLES = {
  bubbleClass: 'speech-bubble',
  plateClass: 'speech-plate',
  bodyClass: 'speech-body',
  linesClass: 'speech-lines',
  lineClass: 'speech-line',
  residentClass: 'resident',
  heldClass: 'held',
  leavingClass: 'leaving',
  awayClass: 'away',
  lineLeaveMs: 520,
  leaveMs: 520,
} as const;

export type BubbleHome = { readonly kind: 'world'; readonly x: number; readonly y: number; readonly z: number; readonly seen: boolean } | { readonly kind: 'held'; readonly holder: HTMLElement };

export type HomeOf = (speaker: Speaker) => BubbleHome | null;

export interface SpeechBubbles {
  update(bubbles: readonly Bubble[], homeOf: HomeOf, now: number): readonly WorldTag[];
  clear(): void;
}

interface BubbleTag {
  readonly element: HTMLElement;
  x: number;
  y: number;
  z: number;
  shown: boolean;
  readonly edge: boolean;
  readonly glide: LabelGlide;
  readonly stack: LabelGlide;
}

interface OldLine {
  readonly element: HTMLElement;
  readonly gone: number;
}

interface Drawn {
  readonly element: HTMLDivElement;
  readonly lines: HTMLDivElement;
  current: HTMLParagraphElement;
  line: number;
  leaving: number | null;
  held: boolean;
  readonly old: OldLine[];
  readonly tag: BubbleTag;
}

function lineElement(text: string): HTMLParagraphElement {
  const line: HTMLParagraphElement = document.createElement('p');
  line.className = SPEECH_BUBBLES.lineClass;
  line.textContent = text;
  return line;
}

function fitLines(drawn: Drawn): void {
  drawn.lines.style.width = `${String(drawn.current.offsetWidth)}px`;
  drawn.lines.style.height = `${String(drawn.current.offsetHeight)}px`;
}

function residentSpeaker(speaker: Speaker): boolean {
  return speaker.kind === 'resident';
}

function settle(shown: Drawn, home: BubbleHome, layer: HTMLElement): void {
  switch (home.kind) {
    case 'world':
      if (shown.held || shown.element.parentElement !== layer) {
        shown.held = false;
        shown.element.classList.remove(SPEECH_BUBBLES.heldClass);
        layer.append(shown.element);
      }
      shown.tag.x = home.x;
      shown.tag.y = home.y;
      shown.tag.z = home.z;
      if (shown.tag.shown !== home.seen) {
        shown.tag.shown = home.seen;
        shown.element.classList.toggle(SPEECH_BUBBLES.awayClass, !home.seen);
      }
      return;
    case 'held':
      if (!shown.held || shown.element.parentElement !== home.holder) {
        shown.held = true;
        shown.tag.shown = false;
        shown.element.classList.add(SPEECH_BUBBLES.heldClass);
        shown.element.classList.remove(SPEECH_BUBBLES.awayClass);
        home.holder.prepend(shown.element);
      }
      return;
  }
}

export function createSpeechBubbles(layer: HTMLElement): SpeechBubbles {
  const drawn: Map<string, Drawn> = new Map<string, Drawn>();

  const create = (bubble: Bubble, home: BubbleHome): Drawn => {
    const element: HTMLDivElement = document.createElement('div');
    element.className = SPEECH_BUBBLES.bubbleClass;
    element.classList.toggle(SPEECH_BUBBLES.residentClass, residentSpeaker(bubble.speaker));
    element.classList.add(SPEECH_BUBBLES.awayClass);
    const plate: HTMLDivElement = document.createElement('div');
    plate.className = SPEECH_BUBBLES.plateClass;
    const body: HTMLDivElement = document.createElement('div');
    body.className = SPEECH_BUBBLES.bodyClass;
    const lines: HTMLDivElement = document.createElement('div');
    lines.className = SPEECH_BUBBLES.linesClass;
    const current: HTMLParagraphElement = lineElement(bubble.text);
    lines.append(current);
    body.append(lines);
    plate.append(body);
    element.append(plate);
    const made: Drawn = { element, lines, current, line: bubble.line, leaving: null, held: false, old: [], tag: { element, x: 0, y: 0, z: 0, shown: false, edge: true, glide: createGlide(), stack: createGlide() } };
    settle(made, home, layer);
    fitLines(made);
    return made;
  };

  const retext = (shown: Drawn, bubble: Bubble, now: number): void => {
    if (shown.line === bubble.line) return;
    shown.line = bubble.line;
    if (shown.current.textContent === bubble.text) return;
    const old: HTMLParagraphElement = shown.current;
    old.classList.add(SPEECH_BUBBLES.leavingClass);
    shown.old.push({ element: old, gone: now + SPEECH_BUBBLES.lineLeaveMs });
    shown.current = lineElement(bubble.text);
    shown.lines.append(shown.current);
    fitLines(shown);
  };

  const sweep = (shown: Drawn, now: number): void => {
    for (let index: number = shown.old.length - 1; index >= 0; index -= 1) {
      const old: OldLine | undefined = shown.old[index];
      if (old === undefined || old.gone > now) continue;
      old.element.remove();
      shown.old.splice(index, 1);
    }
  };

  return {
    update(bubbles: readonly Bubble[], homeOf: HomeOf, now: number): readonly WorldTag[] {
      const live: Set<string> = new Set<string>();
      for (const bubble of bubbles) {
        const home: BubbleHome | null = homeOf(bubble.speaker);
        if (home === null) continue;
        live.add(bubble.key);
        const known: Drawn | undefined = drawn.get(bubble.key);
        const shown: Drawn = known ?? create(bubble, home);
        if (known === undefined) drawn.set(bubble.key, shown);
        if (shown.leaving !== null) {
          shown.leaving = null;
          shown.element.classList.remove(SPEECH_BUBBLES.leavingClass);
        }
        settle(shown, home, layer);
        retext(shown, bubble, now);
      }
      const tags: BubbleTag[] = [];
      for (const [key, shown] of drawn) {
        if (!live.has(key) && shown.leaving === null) {
          shown.leaving = now;
          shown.element.classList.add(SPEECH_BUBBLES.leavingClass);
        }
        if (shown.leaving !== null && now - shown.leaving >= SPEECH_BUBBLES.leaveMs) {
          shown.element.remove();
          drawn.delete(key);
          continue;
        }
        sweep(shown, now);
        if (!shown.held) tags.push(shown.tag);
      }
      return tags;
    },
    clear(): void {
      for (const shown of drawn.values()) shown.element.remove();
      drawn.clear();
    },
  };
}

import type { NpcDef } from '../../sim/content/types.ts';
import type { WorldEvent } from '../../sim/world/types.ts';
import type { HudContext } from './context.ts';
import { el, retrigger, setText } from './dom.ts';

const DIALOGUE_BOX = {
  nextHint: 'Click to continue',
  lastHint: 'Click to close',
  touchNextHint: 'Tap to continue',
  touchLastHint: 'Tap to close',
} as const;

export function dialogueHint(last: boolean, touch: boolean): string {
  if (touch) return last ? DIALOGUE_BOX.touchLastHint : DIALOGUE_BOX.touchNextHint;
  return last ? DIALOGUE_BOX.lastHint : DIALOGUE_BOX.nextHint;
}

type LineEvent = Extract<WorldEvent, { readonly type: 'dialogue_line' }>;

export interface DialogueBox {
  readonly element: HTMLElement;
  show(event: LineEvent): void;
  close(): void;
}

export function createDialogueBox(root: HTMLElement, context: HudContext): DialogueBox {
  const element: HTMLDivElement = el('div', 'hud-dialogue', root);
  const head: HTMLDivElement = el('div', 'dialogue-head', element);
  const name: HTMLDivElement = el('div', 'dialogue-name', head);
  const title: HTMLDivElement = el('div', 'dialogue-title', head);
  const text: HTMLDivElement = el('div', 'dialogue-text', element);
  const foot: HTMLDivElement = el('div', 'dialogue-foot', element);
  const count: HTMLDivElement = el('div', 'dialogue-count', foot);
  const hint: HTMLDivElement = el('div', 'dialogue-hint', foot);
  let open: boolean = false;

  element.addEventListener('pointerdown', (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0 && open) context.api.send({ type: 'advance' });
  });

  return {
    element,
    show(event: LineEvent): void {
      const world = context.api.world;
      const speaker: NpcDef | undefined = world.content.npcs.get(event.line.speaker);
      const total: number = world.dialogue?.talk.lines.length ?? event.index + 1;
      setText(name, speaker?.name ?? event.line.speaker, false);
      setText(title, speaker?.title ?? '', false);
      setText(count, `${event.index + 1} / ${total}`, false);
      setText(hint, dialogueHint(event.last, context.api.touch), false);
      text.textContent = event.line.text;
      retrigger(text, 'line');
      if (!open) {
        open = true;
        element.classList.add('open');
      }
      context.api.voice.play(event.line.id);
    },
    close(): void {
      if (!open) return;
      open = false;
      element.classList.remove('open');
      context.api.voice.stop();
    },
  };
}

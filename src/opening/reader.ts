import type { BookDef, PageDef } from '../../sim/content/story-types.ts';
import { promptText, use } from '../hud/prompts.ts';
import readerCss from './reader.css?inline';

export const READER = {
  addressDelayMs: 1600,
  hintDelayMs: 2800,
  leaveMs: 520,
  nameSlot: '{name}',
  hint: 'close',
} as const;

export interface ReaderPage {
  readonly page: PageDef;
  readonly name: string | null;
}

export interface Reader {
  open(book: BookDef, pages: readonly ReaderPage[], onClose: () => void): void;
  isOpen(): boolean;
}

export function addressLine(page: PageDef, name: string | null): string {
  return name === null ? page.unnamed : page.address.replace(READER.nameSlot, (): string => name);
}

function line(parent: HTMLElement, className: string, text: string): HTMLParagraphElement {
  const element: HTMLParagraphElement = document.createElement('p');
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

export function createReader(root: HTMLElement, touch: boolean): Reader {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = readerCss;
  root.append(style);
  let current: HTMLDivElement | null = null;

  const close = (veil: HTMLDivElement, timers: readonly number[], onClose: () => void): void => {
    if (current !== veil) return;
    current = null;
    for (const timer of timers) window.clearTimeout(timer);
    veil.classList.add('leaving');
    window.setTimeout((): void => veil.remove(), READER.leaveMs);
    onClose();
  };

  return {
    open(book: BookDef, pages: readonly ReaderPage[], onClose: () => void): void {
      if (current !== null || pages.length === 0) return;
      const veil: HTMLDivElement = document.createElement('div');
      veil.className = 'reader-veil';
      const sheet: HTMLDivElement = document.createElement('div');
      sheet.className = 'reader-sheet';
      veil.append(sheet);
      line(sheet, 'reader-title', book.title);
      const addresses: HTMLParagraphElement[] = [];
      for (const entry of pages) {
        for (const text of entry.page.lines) line(sheet, 'reader-line', text);
        addresses.push(line(sheet, 'reader-address', addressLine(entry.page, entry.name)));
      }
      const hint: HTMLParagraphElement = line(sheet, 'reader-hint', promptText(touch, use(READER.hint)));
      root.append(veil);
      current = veil;
      const timers: number[] = [
        window.setTimeout((): void => {
          for (const address of addresses) address.classList.add('shown');
        }, READER.addressDelayMs),
        window.setTimeout((): void => hint.classList.add('shown'), READER.hintDelayMs),
      ];
      const finish = (): void => close(veil, timers, onClose);
      veil.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        finish();
      });
      const onKey = (event: KeyboardEvent): void => {
        if (current !== veil) {
          window.removeEventListener('keydown', onKey, true);
          return;
        }
        if (event.key !== 'Escape' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        window.removeEventListener('keydown', onKey, true);
        finish();
      };
      window.addEventListener('keydown', onKey, true);
    },
    isOpen(): boolean {
      return current !== null;
    },
  };
}

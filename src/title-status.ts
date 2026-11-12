import type { Timers } from './backend/backend.ts';

export const STATUS_LINE = {
  textClass: 'title-line',
  leavingClass: 'leaving',
  leaveAnimation: 'line-out',
  dwellMs: 320,
  settleMs: 700,
} as const;

export interface LineEnd {
  readonly animationName: string;
}

export interface LineNode {
  textContent: string | null;
  className: string;
  readonly classList: { add(token: string): void };
  setAttribute(name: string, value: string): void;
  addEventListener(type: 'animationend', listener: (event: LineEnd) => void): void;
  remove(): void;
}

export interface LineRoot<N extends LineNode> {
  readonly textContent: string | null;
  append(node: N): void;
  replaceChildren(): void;
}

export interface StatusLine {
  show(text: string): void;
  current(): string;
}

export function createStatusLine<N extends LineNode>(root: LineRoot<N>, make: () => N, timers: Timers): StatusLine {
  let wanted: string = root.textContent?.trim() ?? '';
  let shown: string = wanted;
  let line: N | null = null;
  let holding: boolean = false;

  const leave = (node: N): void => {
    let gone: boolean = false;
    const drop = (): void => {
      if (gone) return;
      gone = true;
      node.remove();
    };
    node.classList.add(STATUS_LINE.leavingClass);
    node.setAttribute('aria-hidden', 'true');
    node.addEventListener('animationend', (event: LineEnd): void => {
      if (event.animationName === STATUS_LINE.leaveAnimation) drop();
    });
    timers.after(STATUS_LINE.settleMs, drop);
  };

  const add = (text: string): N => {
    const node: N = make();
    node.className = STATUS_LINE.textClass;
    node.textContent = text;
    root.append(node);
    return node;
  };

  const apply = (): void => {
    if (wanted === shown && line !== null) return;
    if (line !== null) leave(line);
    else root.replaceChildren();
    shown = wanted;
    line = shown === '' ? null : add(shown);
    if (line === null) return;
    holding = true;
    timers.after(STATUS_LINE.dwellMs, (): void => {
      holding = false;
      apply();
    });
  };

  if (shown !== '') {
    root.replaceChildren();
    line = add(shown);
  }

  return {
    show(text: string): void {
      wanted = text;
      if (!holding) apply();
    },
    current: (): string => wanted,
  };
}

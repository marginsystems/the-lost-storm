import { el, setText } from './dom.ts';
import { svg } from './svg.ts';
import type { Box } from './tooltip.ts';

const DROPDOWN = {
  gap: 4,
  margin: 8,
  caretBox: '0 0 10 6',
  caretPath: 'M0.7 0.7 L5 5.3 L9.3 0.7',
  checkBox: '0 0 10 8',
  checkPath: 'M0.8 4.2 L3.8 7 L9.2 1',
  strokeWidth: '1.4',
} as const;

export interface DropdownChoice {
  readonly value: string;
  readonly label: string;
}

export interface ListSpot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
  readonly above: boolean;
}

export type Reaction =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'hold' }
  | { readonly kind: 'open'; readonly active: number }
  | { readonly kind: 'move'; readonly active: number }
  | { readonly kind: 'choose'; readonly active: number }
  | { readonly kind: 'close' };

export function snap(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio;
}

export function listSpot(anchor: Box, width: number, height: number, view: Box, ratio: number): ListSpot {
  const room: number = view.right - view.left - DROPDOWN.margin * 2;
  const fitted: number = Math.min(width, room);
  const below: number = view.bottom - DROPDOWN.margin - (anchor.bottom + DROPDOWN.gap);
  const over: number = anchor.top - DROPDOWN.gap - (view.top + DROPDOWN.margin);
  const above: boolean = height > below && over > below;
  const maxHeight: number = Math.max(0, above ? over : below);
  const shown: number = Math.min(height, maxHeight);
  const left: number = Math.min(Math.max(anchor.left, view.left + DROPDOWN.margin), view.right - DROPDOWN.margin - fitted);
  const top: number = above ? anchor.top - DROPDOWN.gap - shown : anchor.bottom + DROPDOWN.gap;
  return { left: snap(left, ratio), top: snap(top, ratio), width: fitted, maxHeight, above };
}

export function jumpTo(labels: readonly string[], from: number, letter: string): number | null {
  const wanted: string = letter.toLowerCase();
  for (let step: number = 1; step <= labels.length; step += 1) {
    const index: number = (from + step) % labels.length;
    if ((labels[index] ?? '').toLowerCase().startsWith(wanted)) return index;
  }
  return null;
}

function isLetter(key: string): boolean {
  return key.length === 1 && key !== ' ';
}

export function react(key: string, open: boolean, active: number, labels: readonly string[]): Reaction {
  const last: number = labels.length - 1;
  if (last < 0) return { kind: 'ignore' };
  if (!open) {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') return { kind: 'open', active };
    if (key === 'Home') return { kind: 'open', active: 0 };
    if (key === 'End') return { kind: 'open', active: last };
    if (isLetter(key)) {
      const found: number | null = jumpTo(labels, active, key);
      return found === null ? { kind: 'hold' } : { kind: 'open', active: found };
    }
    return { kind: 'ignore' };
  }
  if (key === 'ArrowDown') return { kind: 'move', active: Math.min(last, active + 1) };
  if (key === 'ArrowUp') return { kind: 'move', active: Math.max(0, active - 1) };
  if (key === 'Home') return { kind: 'move', active: 0 };
  if (key === 'End') return { kind: 'move', active: last };
  if (key === 'Enter' || key === ' ') return { kind: 'choose', active };
  if (key === 'Escape') return { kind: 'close' };
  if (isLetter(key)) {
    const found: number | null = jumpTo(labels, active, key);
    return found === null ? { kind: 'hold' } : { kind: 'move', active: found };
  }
  return { kind: 'ignore' };
}

export interface DropdownOptions {
  readonly layer: HTMLElement;
  readonly host: HTMLElement;
  readonly name: string;
  readonly choices: readonly DropdownChoice[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export interface Dropdown {
  readonly button: HTMLButtonElement;
  readonly list: HTMLElement;
  value(): string;
  select(value: string): void;
  close(): void;
}

let created: number = 0;

function glyph(parent: HTMLElement, className: string, box: string, path: string): void {
  const drawing: SVGSVGElement = svg('svg', className, parent, { viewBox: box, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': DROPDOWN.strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg('path', '', drawing, { d: path });
}

export function createDropdown(parent: HTMLElement, options: DropdownOptions): Dropdown {
  created += 1;
  const id: string = `dropdown-${created}`;
  const labels: readonly string[] = options.choices.map((choice: DropdownChoice): string => choice.label);
  const indexOf = (value: string): number => Math.max(0, options.choices.findIndex((choice: DropdownChoice): boolean => choice.value === value));
  let selected: number = indexOf(options.value);
  let active: number = selected;
  let opened: boolean = false;

  const button: HTMLButtonElement = el('button', 'dropdown-button', parent);
  button.type = 'button';
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-label', options.name);
  const face: HTMLSpanElement = el('span', 'dropdown-face', button);
  const current: HTMLSpanElement = el('span', 'dropdown-current', face);
  current.textContent = labels[selected] ?? '';
  for (const text of labels) {
    const ghost: HTMLSpanElement = el('span', 'dropdown-ghost', face);
    ghost.textContent = text;
    ghost.setAttribute('aria-hidden', 'true');
  }
  glyph(el('span', 'dropdown-caret', button), 'dropdown-caret-glyph', DROPDOWN.caretBox, DROPDOWN.caretPath);

  const list: HTMLDivElement = el('div', 'dropdown-list', options.layer);
  list.id = id;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', options.name);
  list.setAttribute('aria-hidden', 'true');
  const rows: HTMLDivElement[] = options.choices.map((choice: DropdownChoice, index: number): HTMLDivElement => {
    const row: HTMLDivElement = el('div', 'dropdown-option', list);
    row.id = `${id}-${index}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === selected));
    el('span', 'dropdown-option-label', row).textContent = choice.label;
    glyph(el('span', 'dropdown-check', row), 'dropdown-check-glyph', DROPDOWN.checkBox, DROPDOWN.checkPath);
    return row;
  });

  const markActive = (next: number): void => {
    active = next;
    rows.forEach((row: HTMLDivElement, index: number): void => {
      row.classList.toggle('active', index === next);
    });
    const row: HTMLDivElement | undefined = rows[next];
    if (row === undefined) return;
    button.setAttribute('aria-activedescendant', row.id);
    const top: number = row.offsetTop;
    const bottom: number = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  };

  const fit = (): void => {
    face.style.minWidth = '';
    face.style.minWidth = `${Math.ceil(face.getBoundingClientRect().width)}px`;
  };
  fit();
  void document.fonts.ready.then(fit);
  document.fonts.addEventListener('loadingdone', fit);

  const place = (): void => {
    const layerBox: DOMRect = options.layer.getBoundingClientRect();
    const box: DOMRect = button.getBoundingClientRect();
    const anchor: Box = { left: box.left - layerBox.left, top: box.top - layerBox.top, right: box.right - layerBox.left, bottom: box.bottom - layerBox.top };
    list.style.maxHeight = '';
    list.style.maxWidth = '';
    list.style.width = '';
    list.style.minWidth = `${Math.ceil(box.width)}px`;
    const natural: number = Math.ceil(Number.parseFloat(getComputedStyle(list).width));
    const spot: ListSpot = listSpot(anchor, natural, list.offsetHeight, { left: 0, top: 0, right: layerBox.width, bottom: layerBox.height }, window.devicePixelRatio);
    list.style.left = `${spot.left}px`;
    list.style.top = `${spot.top}px`;
    list.style.maxHeight = `${spot.maxHeight}px`;
    list.style.width = `${spot.width}px`;
    list.classList.toggle('above', spot.above);
  };

  const onOutside = (event: PointerEvent): void => {
    const target: EventTarget | null = event.target;
    if (target instanceof Node && (list.contains(target) || button.contains(target))) return;
    close();
  };
  const onDetach = (event: Event): void => {
    if (event.target instanceof Node && list.contains(event.target)) return;
    close();
  };

  function close(): void {
    if (!opened) return;
    opened = false;
    list.classList.remove('open');
    list.setAttribute('aria-hidden', 'true');
    button.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    window.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onDetach, true);
  }

  const open = (at: number): void => {
    if (opened) {
      markActive(at);
      return;
    }
    opened = true;
    place();
    list.classList.add('open');
    list.setAttribute('aria-hidden', 'false');
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    markActive(at);
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onDetach, true);
  };

  const select = (value: string): void => {
    selected = indexOf(value);
    setText(current, labels[selected] ?? '', true);
    rows.forEach((row: HTMLDivElement, index: number): void => {
      row.setAttribute('aria-selected', String(index === selected));
    });
  };

  const choose = (index: number): void => {
    const choice: DropdownChoice | undefined = options.choices[index];
    close();
    button.focus({ preventScroll: true });
    if (choice === undefined || index === selected) return;
    select(choice.value);
    options.onChange(choice.value);
  };

  button.addEventListener('click', (): void => {
    if (opened) close();
    else open(selected);
  });
  button.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const reaction: Reaction = react(event.key, opened, active, labels);
    if (reaction.kind === 'ignore') return;
    event.preventDefault();
    event.stopPropagation();
    if (reaction.kind === 'open' || reaction.kind === 'move') open(reaction.active);
    else if (reaction.kind === 'choose') choose(reaction.active);
    else if (reaction.kind === 'close') {
      close();
      button.focus({ preventScroll: true });
    }
  });
  button.addEventListener('blur', close);
  list.addEventListener('pointerdown', (event: PointerEvent): void => event.preventDefault());
  list.addEventListener('mousedown', (event: MouseEvent): void => event.preventDefault());
  rows.forEach((row: HTMLDivElement, index: number): void => {
    row.addEventListener('pointermove', (): void => {
      if (index !== active) markActive(index);
    });
    row.addEventListener('click', (): void => choose(index));
  });
  new MutationObserver((): void => {
    if (!options.host.classList.contains('open')) close();
  }).observe(options.host, { attributes: true, attributeFilter: ['class'] });

  return {
    button,
    list,
    value: (): string => options.choices[selected]?.value ?? '',
    select,
    close,
  };
}

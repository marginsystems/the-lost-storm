export const TITLE_SCREEN = {
  playingClass: 'playing',
  inputKnownClass: 'input-known',
  touchClass: 'touch',
  foldOpenClass: 'open',
  readyClass: 'ready',
  goneClass: 'gone',
  awayClass: 'hud-away',
  awayProperty: 'opacity',
  enterKeys: ['Enter', ' '],
} as const;

export type KeyTarget = 'control' | 'page';

export const GAME_LAYERS: readonly string[] = ['#hud', '#overlays', '.tc', '.tc-rotate'];

export interface ClassTarget {
  readonly classList: {
    toggle(token: string, force?: boolean): boolean;
  };
}

export function markInput(body: ClassTarget, touch: boolean): void {
  body.classList.toggle(TITLE_SCREEN.touchClass, touch);
  body.classList.toggle(TITLE_SCREEN.inputKnownClass, true);
}

export function markPlaying(body: ClassTarget, playing: boolean): void {
  body.classList.toggle(TITLE_SCREEN.playingClass, playing);
  if (playing) body.classList.toggle(TITLE_SCREEN.awayClass, false);
}

export function settlesAway(property: string, fromLayer: boolean, playing: boolean): boolean {
  return fromLayer && !playing && property === TITLE_SCREEN.awayProperty;
}

export function wireHudAway(body: HTMLElement, hud: HTMLElement): void {
  const settle = (event: TransitionEvent): void => {
    if (settlesAway(event.propertyName, event.target === hud, body.classList.contains(TITLE_SCREEN.playingClass))) body.classList.add(TITLE_SCREEN.awayClass);
  };
  hud.addEventListener('transitionend', settle);
  hud.addEventListener('transitioncancel', settle);
}

export function wireFold(button: HTMLButtonElement, fold: HTMLElement): void {
  button.addEventListener('click', (): void => {
    const open: boolean = fold.classList.toggle(TITLE_SCREEN.foldOpenClass);
    button.setAttribute('aria-expanded', String(open));
  });
}

export function pressesEnter(key: string, target: KeyTarget, titleActive: boolean): boolean {
  return titleActive && target === 'page' && TITLE_SCREEN.enterKeys.some((enterKey: string): boolean => enterKey === key);
}

function keyTarget(target: EventTarget | null): KeyTarget {
  if (!(target instanceof HTMLElement)) return 'page';
  if (target.isContentEditable) return 'control';
  return target.closest('button, input, textarea, select, a[href], [tabindex]') === null ? 'page' : 'control';
}

export function wireTitleKeys(title: HTMLElement, enter: HTMLButtonElement): void {
  document.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const active: boolean = title.classList.contains(TITLE_SCREEN.readyClass) && !title.classList.contains(TITLE_SCREEN.goneClass) && !enter.disabled;
    if (!pressesEnter(event.key, keyTarget(event.target), active)) return;
    event.preventDefault();
    event.stopPropagation();
    enter.click();
  });
}

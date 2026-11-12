export const TITLE_SCREEN = {
  playingClass: 'playing',
  inputKnownClass: 'input-known',
  touchClass: 'touch',
  foldOpenClass: 'open',
} as const;

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
}

export function wireFold(button: HTMLButtonElement, fold: HTMLElement): void {
  button.addEventListener('click', (): void => {
    const open: boolean = fold.classList.toggle(TITLE_SCREEN.foldOpenClass);
    button.setAttribute('aria-expanded', String(open));
  });
}

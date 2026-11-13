import { mountThresholdBloom } from '../dither/mount.ts';
import { el, label, setText } from '../hud/dom.ts';
import { createCharacterStrip } from './character-strip.ts';
import type { CharacterStrip } from './character-strip.ts';
import { deleteWording, STRIP_TEXT } from './character-strip-model.ts';
import type { CardView, DeleteWording } from './character-strip-model.ts';
import type { Lobby } from './compact.ts';
import type { HeroChoice, HeroOption } from './hero-choice.ts';
import type { LobbyHero, LobbyStat } from './lobby-sheet.ts';
import screenCss from './lobby-screen.css?inline';
import { mountTitleLobby } from './title-lobby.ts';

export const LOBBY_SCREEN = {
  shownClass: 'shown',
  confirmClass: 'confirming',
  unnamed: 'The one who woke',
  fresh: 'Not yet woken. Everything starts in the storm.',
  offlineTitle: 'Ladder',
  offline: 'Offline. The ladder needs a connection; your character is kept on this device.',
  enterNew: 'Enter the storm',
  enterKnown: 'Continue',
  startOver: STRIP_TEXT.deleteLabel,
  settings: 'Settings',
  back: 'Back to title',
  confirmNo: STRIP_TEXT.keep,
  playedLabel: 'Played',
  seenLabel: 'Last seen',
  levelLabel: 'Level',
  heroesLabel: 'Who wakes',
  findsLabel: 'Finds the',
  chosenProperty: '--chosen',
  countProperty: '--heroes',
} as const;

export interface SheetView {
  readonly name: string | null;
  readonly hero: LobbyHero;
  readonly known: boolean;
  readonly heroes: HeroChoice | null;
}

export interface LobbyView extends SheetView {
  readonly cards: readonly CardView[];
  readonly username: string | null;
  readonly only: boolean;
}

export interface LobbyActions {
  primary(): void;
  startOver(): void;
  pick(key: string): void;
  create(name: string): Promise<string | null>;
  suggest(): string | null;
  settings(): void;
  back(): void;
  chooseHero(id: string): void;
}

export interface LobbyScreen {
  readonly root: HTMLElement;
  readonly shown: boolean;
  show(view: LobbyView): void;
  hide(): void;
  setBusy(busy: boolean): void;
  setHeroes(choice: HeroChoice | null): void;
  setCards(cards: readonly CardView[]): void;
  setUsername(username: string | null): void;
  refuse(text: string): void;
}

function button(parent: HTMLElement, className: string, text: string, onClick: () => void): HTMLButtonElement {
  const made: HTMLButtonElement = el('button', className, parent);
  made.type = 'button';
  made.textContent = text;
  made.addEventListener('click', onClick);
  return made;
}

function ensureStyles(): void {
  const id: string = 'lobby-screen-styles';
  if (document.getElementById(id) !== null) return;
  const style: HTMLStyleElement = document.createElement('style');
  style.id = id;
  style.textContent = screenCss;
  document.head.appendChild(style);
}

function fillStats(list: HTMLElement, stats: readonly LobbyStat[]): void {
  const rows: HTMLElement[] = [...list.children].filter((node: Element): node is HTMLElement => node instanceof HTMLElement);
  stats.forEach((stat: LobbyStat, index: number): void => {
    const row: HTMLElement = rows[index] ?? el('div', 'lobby-stat', list);
    const name: HTMLElement = row.querySelector('.lobby-stat-name') ?? label('lobby-stat-name', '', row);
    const value: HTMLElement = row.querySelector('.lobby-stat-value') ?? label('lobby-stat-value', '', row);
    setText(name, stat.name, false);
    setText(value, stat.value, true);
  });
  for (const extra of rows.slice(stats.length)) extra.remove();
}

export function createLobbyScreen(root: HTMLElement, lobby: Lobby | null, actions: LobbyActions): LobbyScreen {
  ensureStyles();
  root.classList.add('lobby-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Lobby');
  root.inert = true;

  const side: HTMLDivElement = el('div', 'lobby-side', root);
  const strip: CharacterStrip = createCharacterStrip(side, { pick: (key: string): void => actions.pick(key), create: (text: string): Promise<string | null> => actions.create(text), suggest: (): string | null => actions.suggest() });
  const sheet: HTMLElement = el('section', 'lobby-sheet', side);
  sheet.setAttribute('aria-label', 'Your character');
  const name: HTMLHeadingElement = el('h2', 'lobby-name', sheet);
  const account: HTMLDivElement = label('lobby-account', '', sheet);
  const setUsername = (username: string | null): void => {
    if (username !== null) setText(account, username, false);
    account.classList.toggle(LOBBY_SCREEN.shownClass, username !== null);
  };
  const level: HTMLDivElement = el('div', 'lobby-level', sheet);
  const levelText: HTMLSpanElement = el('span', 'lobby-level-text', level);
  const bar: HTMLDivElement = el('div', 'lobby-xp', level);
  const fill: HTMLDivElement = el('div', 'lobby-xp-fill', bar);
  const empty: HTMLDivElement = label('lobby-fresh', LOBBY_SCREEN.fresh, sheet);
  const heroes: HTMLDivElement = el('div', 'lobby-heroes', sheet);
  heroes.setAttribute('role', 'radiogroup');
  heroes.setAttribute('aria-label', LOBBY_SCREEN.heroesLabel);
  heroes.hidden = true;
  const heroMark: HTMLSpanElement = el('span', 'lobby-hero-mark', heroes);
  const heroButtons: Map<string, HTMLButtonElement> = new Map<string, HTMLButtonElement>();
  const heroButton = (option: HeroOption): HTMLButtonElement => {
    const made: HTMLButtonElement = button(heroes, 'lobby-hero', '', (): void => actions.chooseHero(option.id));
    made.setAttribute('role', 'radio');
    label('lobby-hero-name', option.name, made);
    if (option.finds !== null) label('lobby-hero-finds', `${LOBBY_SCREEN.findsLabel} ${option.finds}`, made);
    return made;
  };
  const setHeroes = (choice: HeroChoice | null): void => {
    heroes.hidden = choice === null;
    if (choice === null) return;
    if (choice.options.map((option: HeroOption): string => option.id).join('|') !== [...heroButtons.keys()].join('|')) {
      for (const stale of heroButtons.values()) stale.remove();
      heroButtons.clear();
      for (const option of choice.options) heroButtons.set(option.id, heroButton(option));
    }
    heroes.style.setProperty(LOBBY_SCREEN.countProperty, String(choice.options.length));
    heroes.style.setProperty(LOBBY_SCREEN.chosenProperty, String(Math.max(0, choice.options.findIndex((option: HeroOption): boolean => option.id === choice.chosen))));
    heroMark.hidden = !choice.options.some((option: HeroOption): boolean => option.id === choice.chosen);
    for (const [id, made] of heroButtons) made.setAttribute('aria-checked', String(id === choice.chosen));
  };
  const stats: HTMLDivElement = el('div', 'lobby-stats', sheet);
  const facts: HTMLDivElement = el('div', 'lobby-facts', sheet);
  const played: HTMLDivElement = label('lobby-fact', '', facts);
  const seen: HTMLDivElement = label('lobby-fact', '', facts);

  const ladder: HTMLElement = el('aside', 'lobby-ladder lobby', root);
  ladder.setAttribute('aria-label', 'Ladder');
  if (lobby === null) {
    ladder.classList.add('offline');
    label('lobby-ladder-title', LOBBY_SCREEN.offlineTitle, ladder);
    label('lobby-ladder-note', LOBBY_SCREEN.offline, ladder);
  } else {
    mountTitleLobby(ladder, lobby);
  }

  const dock: HTMLDivElement = el('div', 'lobby-dock', root);
  const primary: HTMLButtonElement = button(dock, 'lobby-primary threshold-button', LOBBY_SCREEN.enterNew, (): void => actions.primary());
  mountThresholdBloom(primary);
  const quiet: HTMLDivElement = el('div', 'lobby-quiet', dock);
  const reset: HTMLButtonElement = button(quiet, 'lobby-link', LOBBY_SCREEN.startOver, (): void => {
    strip.close();
    setText(ask, wording.ask, false);
    dock.classList.add(LOBBY_SCREEN.confirmClass);
    confirm.inert = false;
    no.focus();
  });
  const settings: HTMLButtonElement = button(quiet, 'lobby-link', LOBBY_SCREEN.settings, (): void => actions.settings());
  const back: HTMLButtonElement = button(quiet, 'lobby-link', LOBBY_SCREEN.back, (): void => actions.back());
  const confirm: HTMLDivElement = el('div', 'lobby-confirm', dock);
  confirm.inert = true;
  const confirmInner: HTMLDivElement = el('div', 'lobby-confirm-inner', confirm);
  let wording: DeleteWording = deleteWording(LOBBY_SCREEN.unnamed, true);
  const ask: HTMLDivElement = label('lobby-confirm-ask', wording.ask, confirmInner);
  ask.setAttribute('aria-live', 'polite');
  const confirmRow: HTMLDivElement = el('div', 'lobby-confirm-row', confirmInner);
  const yes: HTMLButtonElement = button(confirmRow, 'lobby-link danger', wording.yes, (): void => actions.startOver());
  const no: HTMLButtonElement = button(confirmRow, 'lobby-link', LOBBY_SCREEN.confirmNo, (): void => closeConfirm());

  const closeConfirm = (): void => {
    if (!dock.classList.contains(LOBBY_SCREEN.confirmClass)) return;
    dock.classList.remove(LOBBY_SCREEN.confirmClass);
    confirm.inert = true;
    reset.focus();
  };

  let shown: boolean = false;
  document.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!shown || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      closeConfirm();
      return;
    }
    if (event.key !== 'Enter' || event.repeat) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    primary.click();
  });

  return {
    root,
    get shown(): boolean {
      return shown;
    },
    show(view: LobbyView): void {
      setText(name, view.name ?? LOBBY_SCREEN.unnamed, false);
      setUsername(view.username);
      strip.render(view.cards);
      wording = deleteWording(view.name ?? LOBBY_SCREEN.unnamed, view.only);
      setText(ask, wording.ask, false);
      yes.textContent = wording.yes;
      primary.textContent = view.known ? LOBBY_SCREEN.enterKnown : LOBBY_SCREEN.enterNew;
      reset.hidden = !view.known && view.only;
      const hero: LobbyHero = view.hero;
      sheet.dataset['state'] = hero.kind;
      switch (hero.kind) {
        case 'fresh':
          fillStats(stats, []);
          break;
        case 'known':
          setText(levelText, `${LOBBY_SCREEN.levelLabel} ${hero.level}`, true);
          fill.style.transform = `scaleX(${hero.progress.toFixed(3)})`;
          fillStats(stats, hero.stats);
          setText(played, hero.played === null ? '' : `${LOBBY_SCREEN.playedLabel} ${hero.played}`, false);
          setText(seen, `${LOBBY_SCREEN.seenLabel} in ${hero.seen}`, false);
          played.hidden = hero.played === null;
          break;
      }
      empty.hidden = hero.kind !== 'fresh';
      setHeroes(view.heroes);
      dock.classList.remove(LOBBY_SCREEN.confirmClass);
      confirm.inert = true;
      shown = true;
      root.inert = false;
      root.classList.add(LOBBY_SCREEN.shownClass);
      primary.focus({ preventScroll: true });
    },
    hide(): void {
      shown = false;
      root.inert = true;
      root.classList.remove(LOBBY_SCREEN.shownClass);
    },
    setBusy(busy: boolean): void {
      for (const control of [primary, reset, settings, back, yes, no, ...heroButtons.values()]) control.disabled = busy;
      strip.setBusy(busy);
    },
    setHeroes,
    setCards(cards: readonly CardView[]): void {
      strip.render(cards);
    },
    setUsername,
    refuse(text: string): void {
      setText(ask, text, true);
      no.focus();
    },
  };
}

import { mountThresholdBloom } from '../dither/mount.ts';
import { el, label, setAttr, setClass, setData, setText, setVar } from '../hud/dom.ts';
import { createCharacterStrip } from './character-strip.ts';
import type { CharacterStrip } from './character-strip.ts';
import { deleteWording, STRIP_TEXT } from './character-strip-model.ts';
import type { CardView, DeleteWording } from './character-strip-model.ts';
import type { Lobby } from './compact.ts';
import { canEnter, HERO_TEXT, heroNote, sameHeroChoice } from './hero-choice.ts';
import type { HeroChoice, HeroOption } from './hero-choice.ts';
import type { LobbyHero, LobbyStat } from './lobby-sheet.ts';
import heroCss from './hero-choice.css?inline';
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
  feedback: 'Feedback',
  back: 'Back to title',
  confirmNo: STRIP_TEXT.keep,
  playedLabel: 'Played',
  seenLabel: 'Last seen',
  levelLabel: 'Level',
  findsLabel: 'Finds the',
  chosenColumnProperty: '--chosen-column',
  chosenRowProperty: '--chosen-row',
  columnsProperty: '--hero-columns',
  rowsProperty: '--hero-rows',
  heroColumns: 2,
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
  readonly feedback: (() => void) | null;
  back(): void;
  chooseHero(id: string): void;
  previewHero(id: string | null): void;
}

export interface LobbyScreen {
  readonly root: HTMLElement;
  readonly sheet: HTMLElement;
  readonly shown: boolean;
  show(view: LobbyView): void;
  hide(): void;
  setBusy(busy: boolean): void;
  setHeroes(choice: HeroChoice | null): void;
  setCards(cards: readonly CardView[]): void;
  setUsername(username: string | null): void;
  fadeSheet(faded: boolean): void;
  refuse(text: string): void;
}

const HERO_NOTE_ID: string = 'lobby-hero-note';

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
  style.textContent = `${screenCss}\n${heroCss}`;
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
    setClass(account, LOBBY_SCREEN.shownClass, username !== null);
  };
  const level: HTMLDivElement = el('div', 'lobby-level', sheet);
  const levelText: HTMLSpanElement = el('span', 'lobby-level-text', level);
  const bar: HTMLDivElement = el('div', 'lobby-xp', level);
  const fill: HTMLDivElement = el('div', 'lobby-xp-fill', bar);
  const empty: HTMLDivElement = label('lobby-fresh', LOBBY_SCREEN.fresh, sheet);
  const heroBox: HTMLDivElement = el('div', 'lobby-hero-box', sheet);
  heroBox.dataset['kind'] = 'none';
  const heroHead: HTMLDivElement = label('lobby-hero-head', HERO_TEXT.heading, heroBox);
  const heroes: HTMLDivElement = el('div', 'lobby-heroes', heroBox);
  heroes.setAttribute('role', 'radiogroup');
  heroes.setAttribute('aria-label', HERO_TEXT.heading);
  el('span', 'lobby-hero-mark', heroes);
  const heroNoteLine: HTMLDivElement = label('lobby-hero-note', '', heroBox);
  heroNoteLine.setAttribute('aria-live', 'polite');
  const heroFixed: HTMLDivElement = label('lobby-hero-fixed', '', heroBox);
  const heroButtons: Map<string, HTMLButtonElement> = new Map<string, HTMLButtonElement>();
  let enterable: boolean = true;
  let busyNow: boolean = false;
  let heroesShown: HeroChoice | null = null;
  let heroesDrawn: boolean = false;
  const heroButton = (option: HeroOption): HTMLButtonElement => {
    const made: HTMLButtonElement = button(heroes, 'lobby-hero', '', (): void => actions.chooseHero(option.id));
    made.setAttribute('role', 'radio');
    made.addEventListener('pointerenter', (): void => actions.previewHero(option.id));
    made.addEventListener('pointerleave', (): void => actions.previewHero(null));
    made.addEventListener('focus', (): void => actions.previewHero(option.id));
    made.addEventListener('blur', (): void => actions.previewHero(null));
    label('lobby-hero-name', option.name, made);
    if (option.finds !== null) label('lobby-hero-finds', `${LOBBY_SCREEN.findsLabel} ${option.finds}`, made);
    return made;
  };
  const setEnterable = (next: boolean): void => {
    enterable = next;
    const disabled: boolean = busyNow || !enterable;
    if (primary.disabled !== disabled) primary.disabled = disabled;
    if (next) {
      if (primary.hasAttribute('aria-describedby')) primary.removeAttribute('aria-describedby');
    } else {
      setAttr(primary, 'aria-describedby', HERO_NOTE_ID);
    }
  };
  heroNoteLine.id = HERO_NOTE_ID;
  const setHeroes = (choice: HeroChoice | null): void => {
    if (heroesDrawn && sameHeroChoice(heroesShown, choice)) return;
    heroesDrawn = true;
    heroesShown = choice;
    const kind: string = choice === null ? 'none' : choice.kind;
    setData(heroBox, 'kind', kind);
    setData(root, 'hero', kind);
    const note: string | null = heroNote(choice);
    if (note !== null) setText(heroNoteLine, note, heroNoteLine.textContent !== '');
    setEnterable(canEnter(choice));
    if (choice === null) return;
    switch (choice.kind) {
      case 'fixed':
        setText(heroHead, HERO_TEXT.fixedHeading, false);
        setText(heroFixed, choice.name, false);
        return;
      case 'choose':
        break;
    }
    setText(heroHead, HERO_TEXT.heading, false);
    if (choice.options.map((option: HeroOption): string => option.id).join('|') !== [...heroButtons.keys()].join('|')) {
      for (const stale of heroButtons.values()) stale.remove();
      heroButtons.clear();
      for (const option of choice.options) heroButtons.set(option.id, heroButton(option));
    }
    const at: number = choice.options.findIndex((option: HeroOption): boolean => option.id === choice.chosen);
    const columns: number = Math.max(1, Math.min(choice.options.length, LOBBY_SCREEN.heroColumns));
    setVar(heroes, LOBBY_SCREEN.columnsProperty, String(columns));
    setVar(heroes, LOBBY_SCREEN.rowsProperty, String(Math.max(1, Math.ceil(choice.options.length / columns))));
    if (at >= 0) {
      setVar(heroes, LOBBY_SCREEN.chosenColumnProperty, String(at % columns));
      setVar(heroes, LOBBY_SCREEN.chosenRowProperty, String(Math.floor(at / columns)));
    }
    if (at >= 0 && heroes.dataset['chosen'] !== 'true') heroes.getBoundingClientRect();
    setData(heroes, 'chosen', String(at >= 0));
    for (const [id, made] of heroButtons) setAttr(made, 'aria-checked', String(id === choice.chosen));
  };
  let fillScale: string = '';
  const setFillScale = (value: string): void => {
    if (fillScale === value) return;
    fillScale = value;
    fill.style.transform = value;
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
  const primary: HTMLButtonElement = button(dock, 'lobby-primary threshold-button', LOBBY_SCREEN.enterNew, (): void => {
    if (enterable) actions.primary();
  });
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
  const feedback: (() => void) | null = actions.feedback;
  const feedbackLink: HTMLButtonElement | null = feedback === null ? null : button(quiet, 'lobby-link', LOBBY_SCREEN.feedback, feedback);
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
    sheet,
    get shown(): boolean {
      return shown;
    },
    show(view: LobbyView): void {
      setText(name, view.name ?? LOBBY_SCREEN.unnamed, false);
      setUsername(view.username);
      strip.render(view.cards);
      wording = deleteWording(view.name ?? LOBBY_SCREEN.unnamed, view.only);
      setText(ask, wording.ask, false);
      setText(yes, wording.yes, false);
      setText(primary, view.known ? LOBBY_SCREEN.enterKnown : LOBBY_SCREEN.enterNew, false);
      const hideReset: boolean = !view.known && view.only;
      if (reset.hidden !== hideReset) reset.hidden = hideReset;
      const hero: LobbyHero = view.hero;
      setData(sheet, 'state', hero.kind);
      switch (hero.kind) {
        case 'fresh':
          fillStats(stats, []);
          break;
        case 'known':
          setText(levelText, `${LOBBY_SCREEN.levelLabel} ${hero.level}`, true);
          setFillScale(`scaleX(${hero.progress.toFixed(3)})`);
          fillStats(stats, hero.stats);
          setText(played, hero.played === null ? '' : `${LOBBY_SCREEN.playedLabel} ${hero.played}`, false);
          setText(seen, `${LOBBY_SCREEN.seenLabel} in ${hero.seen}`, false);
          if (played.hidden !== (hero.played === null)) played.hidden = hero.played === null;
          break;
      }
      const hideEmpty: boolean = hero.kind !== 'fresh' || view.known;
      if (empty.hidden !== hideEmpty) empty.hidden = hideEmpty;
      setHeroes(view.heroes);
      setClass(dock, LOBBY_SCREEN.confirmClass, false);
      if (!confirm.inert) confirm.inert = true;
      shown = true;
      if (root.inert) root.inert = false;
      setClass(root, LOBBY_SCREEN.shownClass, true);
      if (enterable && document.activeElement !== primary) primary.focus({ preventScroll: true });
    },
    hide(): void {
      shown = false;
      root.inert = true;
      root.classList.remove(LOBBY_SCREEN.shownClass);
    },
    setBusy(busy: boolean): void {
      busyNow = busy;
      for (const control of [reset, settings, ...(feedbackLink === null ? [] : [feedbackLink]), back, yes, no, ...heroButtons.values()]) control.disabled = busy;
      primary.disabled = busy || !enterable;
      strip.setBusy(busy);
    },
    setHeroes,
    setCards(cards: readonly CardView[]): void {
      strip.render(cards);
    },
    setUsername,
    fadeSheet(faded: boolean): void {
      setData(sheet, 'swap', faded ? 'out' : 'in');
    },
    refuse(text: string): void {
      setText(ask, text, true);
      no.focus();
    },
  };
}

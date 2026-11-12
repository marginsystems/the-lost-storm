import type { Leaderboard, YourRow } from '../backend/lobby-api.ts';
import type { RenameOutcome } from '../backend/lobby.ts';
import { el, label, setText } from '../hud/dom.ts';
import { COMPACT, watchFocus } from './compact.ts';
import type { Lobby } from './compact.ts';
import { createLobbyPanel } from './lobby-panel.ts';
import type { LobbyPanel } from './lobby-panel.ts';
import { asksForName, NAME_MESSAGES, NAME_RULES, nameProblem, rankText, tidyName } from './lobby-model.ts';
import type { NameProblem } from './lobby-model.ts';

export interface TitleLobby {
  stop(): void;
}

type YouMode = 'hidden' | 'line' | 'ask';

export const TITLE_LOBBY: { readonly placeholder: string; readonly save: string; readonly saving: string; readonly askFresh: string } = {
  placeholder: 'Name your character',
  save: 'Save',
  saving: 'Saving',
  askFresh: 'Choose the name others will see.',
};

function askText(you: YourRow | null): string {
  return you === null ? TITLE_LOBBY.askFresh : `You are ${you.name}, ${rankText(you.rank)}. Choose your own name.`;
}

export function mountTitleLobby(root: HTMLElement, lobby: Lobby): TitleLobby {
  const panel: LobbyPanel = createLobbyPanel(root, { title: COMPACT.title, rows: COMPACT.rows, ticker: true });
  const you: HTMLDivElement = el('div', 'lobby-you', panel.root);
  you.dataset['mode'] = 'hidden';
  const line: HTMLDivElement = el('div', 'lobby-you-line board-row you', you);
  const lineRank: HTMLSpanElement = el('span', 'board-rank', line);
  el('span', 'board-dot on', line);
  const lineName: HTMLSpanElement = el('span', 'board-name', line);
  const lineLevel: HTMLSpanElement = el('span', 'board-level', line);
  const form: HTMLFormElement = el('form', 'lobby-name', you);
  const field: HTMLInputElement = el('input', 'lobby-name-field', form);
  field.type = 'text';
  field.maxLength = NAME_RULES.max;
  field.placeholder = TITLE_LOBBY.placeholder;
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('aria-label', TITLE_LOBBY.placeholder);
  const save: HTMLButtonElement = el('button', 'lobby-name-save', form);
  save.type = 'submit';
  save.textContent = TITLE_LOBBY.save;
  const note: HTMLDivElement = label('lobby-name-note', '', you);
  note.setAttribute('aria-live', 'polite');
  let busy: boolean = false;
  let failed: boolean = false;

  const setMode = (mode: YouMode): void => {
    if (you.dataset['mode'] !== mode) you.dataset['mode'] = mode;
  };

  const tell = (text: string, problem: boolean): void => {
    note.classList.toggle('problem', problem);
    setText(note, text, true);
  };

  const showYou = (board: Leaderboard): void => {
    const mine: YourRow | null = board.you;
    if (mine !== null) {
      setText(lineRank, rankText(mine.rank), true);
      setText(lineName, mine.name, false);
      setText(lineLevel, String(mine.level), true);
    }
    if (busy) return;
    if (asksForName(board)) {
      setMode('ask');
      if (!failed) tell(askText(mine), false);
      return;
    }
    setMode('line');
    failed = false;
    tell('', false);
  };

  const refuse = (problem: NameProblem): void => {
    failed = true;
    tell(NAME_MESSAGES[problem], true);
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    const name: string = tidyName(field.value);
    const local: NameProblem | null = nameProblem(name);
    if (local !== null) {
      refuse(local);
      return;
    }
    busy = true;
    save.disabled = true;
    save.textContent = TITLE_LOBBY.saving;
    const outcome: RenameOutcome = await lobby.service.rename(name);
    busy = false;
    save.disabled = false;
    save.textContent = TITLE_LOBBY.save;
    switch (outcome.kind) {
      case 'named':
        failed = false;
        field.value = '';
        setText(lineName, outcome.name, false);
        await lobby.feed.refresh(true);
        return;
      case 'invalid':
        refuse(outcome.reason);
        return;
      case 'unavailable':
        refuse('unavailable');
        return;
    }
  };

  form.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    void submit();
  });
  field.addEventListener('keydown', (event: KeyboardEvent): void => {
    event.stopPropagation();
  });
  field.addEventListener('keyup', (event: KeyboardEvent): void => {
    event.stopPropagation();
  });
  field.addEventListener('input', (): void => {
    if (!failed) return;
    failed = false;
    const board: Leaderboard | null = lobby.feed.current();
    tell(askText(board === null ? null : board.you), false);
  });

  const unsubscribe: () => void = lobby.feed.subscribe((board: Leaderboard | null): void => {
    panel.show(board);
    if (board !== null) showYou(board);
  });
  const unwatch: () => void = watchFocus(lobby.feed);
  lobby.feed.every(COMPACT.refreshMs);
  void lobby.feed.refresh(true);

  return {
    stop(): void {
      unsubscribe();
      unwatch();
      panel.stop();
    },
  };
}

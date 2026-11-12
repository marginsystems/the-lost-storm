import type { Leaderboard } from '../backend/api.ts';
import type { RenameOutcome } from '../backend/lobby.ts';
import { el, label, setText } from '../hud/dom.ts';
import { markOverlay } from '../hud/overlay-mark.ts';
import type { Lobby } from './compact.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { keepHeroName, pendingRename, readHeroName, stepWanted } from './hero-name.ts';
import { chooseName, NAME_MESSAGES, NAME_RULES, nameProblem, tidyName } from './lobby-model.ts';
import type { NameBody, NameProblem } from './lobby-model.ts';
import { pressAction } from './name-press.ts';
import type { PressAction, StepState } from './name-press.ts';
import stepCss from './name-step.css?inline';

export const NAME_STEP = {
  ask: 'What is your name?',
  placeholder: 'Your name',
  choose: 'Choose for me',
  suggested: 'Enter to keep it, or type your own.',
  nudgeClass: 'nudge',
} as const;

export interface NameStep {
  enter(): Promise<boolean>;
}

export interface NameStepParts {
  readonly card: HTMLElement;
  readonly enter: HTMLButtonElement;
  readonly lobby: Lobby | null;
  readonly fresh: boolean;
  readonly store: KeyValueStore;
  readonly body: NameBody;
  readonly random: () => number;
  readonly begin: () => void;
}

async function sendKept(lobby: Lobby, kept: string): Promise<boolean> {
  const outcome: RenameOutcome = await lobby.service.rename(kept);
  if (outcome.kind === 'named') await lobby.feed.refresh(true);
  return outcome.kind === 'named' || outcome.kind === 'invalid';
}

export function createNameStep(parts: NameStepParts): NameStep {
  const { card, enter, lobby } = parts;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = stepCss;
  card.append(style);
  const step: HTMLFormElement = el('form', 'name-step', null);
  step.dataset['state'] = 'closed';
  step.noValidate = true;
  const inner: HTMLDivElement = el('div', 'name-step-inner', step);
  const note: HTMLDivElement = label('name-step-note', NAME_STEP.ask, inner);
  note.setAttribute('aria-live', 'polite');
  const row: HTMLDivElement = el('div', 'name-step-row', inner);
  const field: HTMLInputElement = el('input', 'name-step-field', row);
  field.type = 'text';
  field.maxLength = NAME_RULES.max;
  field.placeholder = NAME_STEP.placeholder;
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.enterKeyHint = 'go';
  field.tabIndex = -1;
  field.setAttribute('aria-label', NAME_STEP.ask);
  const choose: HTMLButtonElement = el('button', 'name-step-choose', row);
  choose.type = 'button';
  choose.textContent = NAME_STEP.choose;
  choose.tabIndex = -1;
  enter.before(step);
  const refused: Set<string> = new Set<string>();
  let state: StepState = 'closed';
  let limited: boolean = false;

  const setState = (next: StepState): void => {
    state = next;
    step.dataset['state'] = next;
    step.toggleAttribute('aria-busy', next === 'busy');
    markOverlay(step, next === 'open' || next === 'busy');
    enter.disabled = next === 'busy';
    choose.disabled = next === 'busy' || limited;
    const reachable: number = next === 'open' || next === 'busy' ? 0 : -1;
    field.tabIndex = reachable;
    choose.tabIndex = reachable;
  };

  const tell = (text: string, problem: boolean): void => {
    note.classList.toggle('problem', problem);
    setText(note, text, true);
  };

  const needed = (): boolean => stepWanted(parts.fresh, lobby === null ? null : lobby.feed.current(), lobby !== null && lobby.service.hasAccount());

  const nudge = (): void => {
    field.classList.remove(NAME_STEP.nudgeClass);
    void field.offsetWidth;
    field.classList.add(NAME_STEP.nudgeClass);
  };

  const hold = (): void => {
    field.focus({ preventScroll: true });
    field.select();
    nudge();
  };

  const refuse = (problem: NameProblem): boolean => {
    setState('open');
    tell(NAME_MESSAGES[problem], true);
    hold();
    return false;
  };

  const suggest = (): boolean => {
    const picked: string | null = chooseName(parts.body, parts.random, refused);
    if (picked === null) return refuse('name_taken');
    field.value = picked;
    tell(NAME_STEP.suggested, false);
    hold();
    return false;
  };

  const finish = (): boolean => {
    setState('done');
    return true;
  };

  const name = async (raw: string): Promise<boolean> => {
    const wanted: string = tidyName(raw);
    const local: NameProblem | null = nameProblem(wanted);
    if (local !== null) return refuse(local);
    keepHeroName(parts.store, wanted);
    if (lobby === null || !lobby.service.hasAccount()) return finish();
    setState('busy');
    const outcome: RenameOutcome = await lobby.service.rename(wanted);
    if (outcome.kind === 'invalid') {
      refused.add(wanted);
      return refuse(outcome.reason);
    }
    if (outcome.kind === 'limited') {
      limited = true;
      return refuse('limited');
    }
    if (outcome.kind === 'named') await lobby.feed.refresh(true);
    return finish();
  };

  let sentKept: boolean = false;
  lobby?.feed.subscribe((board: Leaderboard | null): void => {
    const kept: string | null = pendingRename(readHeroName(parts.store), board, lobby.service.hasAccount());
    if (kept === null || sentKept || state === 'open' || state === 'busy') return;
    sentKept = true;
    void sendKept(lobby, kept).then((settled: boolean): boolean => {
      sentKept = settled;
      return settled;
    });
  });

  step.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    enter.click();
  });
  choose.addEventListener('click', (): void => {
    if (state !== 'open') return;
    suggest();
  });
  for (const kind of ['keydown', 'keyup'] as const) {
    field.addEventListener(kind, (event: KeyboardEvent): void => {
      event.stopPropagation();
    });
  }
  field.addEventListener('animationend', (): void => {
    field.classList.remove(NAME_STEP.nudgeClass);
  });
  field.addEventListener('input', (): void => {
    if (note.textContent !== NAME_STEP.ask) tell(NAME_STEP.ask, false);
  });

  return {
    async enter(): Promise<boolean> {
      const action: PressAction = pressAction({ state, value: field.value, needed: state === 'closed' && needed(), limited });
      if (action === 'wait') return false;
      if (action === 'begin') return true;
      if (action === 'suggest') return suggest();
      if (action === 'submit') return name(field.value);
      setState('open');
      field.value = readHeroName(parts.store) ?? '';
      field.focus({ preventScroll: true });
      return false;
    },
  };
}

export interface EnterWiring {
  readonly enter: HTMLButtonElement;
  readonly step: NameStep | null;
  readonly failed: () => boolean;
  readonly begin: () => void;
}

export function wireEnter(wiring: EnterWiring): void {
  const press = async (): Promise<void> => {
    if (wiring.step === null || (await wiring.step.enter())) wiring.begin();
  };
  wiring.enter.addEventListener('click', (): void => {
    if (wiring.failed()) window.location.reload();
    else void press();
  });
}

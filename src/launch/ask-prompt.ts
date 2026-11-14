import type { KeyValueStore } from '../backend/backend.ts';

export const ASK_PROMPT = {
  key: 'the-lost-storm.feedback-ask.v1',
  spentValue: 'spent',
  minMinutes: 10,
  minLevel: 5,
  restZone: 'hideout',
  campFlag: 'camp',
  campValue: 'reached',
  showSeconds: 45,
  line: 'How is the alpha so far?',
  later: 'Not now',
} as const;

export interface AskFacts {
  readonly canSend: boolean;
  readonly spent: boolean;
  readonly sent: boolean;
  readonly minutes: number;
  readonly level: number;
  readonly zone: string;
  readonly flags: Readonly<Record<string, string>>;
}

export interface AskPrompt {
  readonly spent: boolean;
  readonly shownFor: number;
  readonly visible: boolean;
}

export interface AskMoment {
  readonly worth: boolean;
  readonly onScreen: boolean;
  readonly calm: boolean;
  readonly dt: number;
}

export const IDLE_ASK: AskPrompt = { spent: false, shownFor: 0, visible: false };

export function readAskSpent(store: KeyValueStore): boolean {
  return store.read(ASK_PROMPT.key) === ASK_PROMPT.spentValue;
}

export function keepAskSpent(store: KeyValueStore): void {
  store.write(ASK_PROMPT.key, ASK_PROMPT.spentValue);
}

export function atRest(facts: Pick<AskFacts, 'level' | 'zone' | 'flags'>): boolean {
  return facts.level >= ASK_PROMPT.minLevel || facts.zone === ASK_PROMPT.restZone || facts.flags[ASK_PROMPT.campFlag] === ASK_PROMPT.campValue;
}

export function worthAsking(facts: AskFacts): boolean {
  if (!facts.canSend || facts.spent || facts.sent) return false;
  if (facts.minutes < ASK_PROMPT.minMinutes) return false;
  return atRest(facts);
}

export function spendAsk(state: AskPrompt): AskPrompt {
  return { ...state, spent: true, visible: false };
}

function hidden(state: AskPrompt): AskPrompt {
  return state.visible ? { ...state, visible: false } : state;
}

export function stepAsk(state: AskPrompt, moment: AskMoment): AskPrompt {
  if (state.spent) return hidden(state);
  if (!moment.worth || !moment.onScreen || !moment.calm) return hidden(state);
  const shownFor: number = state.shownFor + Math.max(0, moment.dt);
  if (shownFor >= ASK_PROMPT.showSeconds) return { ...state, spent: true, visible: false, shownFor };
  return { ...state, visible: true, shownFor };
}

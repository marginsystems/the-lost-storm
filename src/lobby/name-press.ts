import { tidyName } from './lobby-model.ts';

export type StepState = 'closed' | 'open' | 'busy' | 'done';

export type PressAction = 'wait' | 'begin' | 'open' | 'suggest' | 'submit';

export interface PressContext {
  readonly state: StepState;
  readonly value: string;
  readonly needed: boolean;
  readonly limited: boolean;
}

export function pressAction(context: PressContext): PressAction {
  if (context.state === 'busy') return 'wait';
  if (context.state === 'done') return 'begin';
  if (context.state === 'closed') return context.needed ? 'open' : 'begin';
  if (context.limited) return 'begin';
  return tidyName(context.value) === '' ? 'suggest' : 'submit';
}

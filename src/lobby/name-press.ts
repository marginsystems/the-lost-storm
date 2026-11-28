import { tidyName } from './lobby-model.ts';
import type { PickedName } from './name-pool.ts';

export type StepState = 'closed' | 'open' | 'busy' | 'done';

export type PressAction = 'wait' | 'begin' | 'open' | 'suggest' | 'submit';

export interface PressContext {
  readonly state: StepState;
  readonly value: string;
  readonly needed: boolean;
  readonly limited: boolean;
}

export type OpenFill = { readonly kind: 'kept'; readonly name: string } | { readonly kind: 'suggested'; readonly picked: PickedName } | { readonly kind: 'empty' };

export function openFill(kept: string | null, pick: () => PickedName | null): OpenFill {
  if (kept !== null) return { kind: 'kept', name: kept };
  const picked: PickedName | null = pick();
  return picked === null ? { kind: 'empty' } : { kind: 'suggested', picked };
}

export type UnreachedStep = 'warn' | 'keep';

export function unreachedStep(warned: boolean): UnreachedStep {
  return warned ? 'keep' : 'warn';
}

export function pressAction(context: PressContext): PressAction {
  if (context.state === 'busy') return 'wait';
  if (context.state === 'done') return 'begin';
  if (context.state === 'closed') return context.needed ? 'open' : 'begin';
  if (context.limited) return 'begin';
  return tidyName(context.value) === '' ? 'suggest' : 'submit';
}

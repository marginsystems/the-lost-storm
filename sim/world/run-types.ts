export interface RunPin {
  readonly condition: string;
  readonly pick: string | null;
}

export interface RunSetup {
  readonly zone: string;
  readonly pins: readonly RunPin[];
}

export interface RunState {
  active: RunSetup | null;
  last: RunSetup | null;
}

export type RunEnd = 'left' | 'cleared';

export interface SetOutCommand {
  readonly type: 'set_out';
  readonly setup: RunSetup;
}

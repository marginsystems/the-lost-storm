import type { World } from '../../sim/world/types.ts';
import type { AccountService } from '../backend/account.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { warnInConsole } from '../backend/console-log.ts';
import { runFrames } from '../frame-loop.ts';
import { startTitleAccount } from '../title-signin.ts';
import type { TitleSignIn } from '../title-signin.ts';
import { KEEP_PROMPT } from './keep-prompt.ts';
import { createKeepView } from './keep-view.ts';
import type { KeepView } from './keep-view.ts';

export const KEEP_START = {
  maxFrame: 0.1,
  millisecondsPerSecond: 1000,
} as const;

export interface KeepStartDeps {
  readonly account: AccountService;
  readonly world: World;
  readonly hud: HTMLElement;
  readonly lobby: HTMLElement;
  readonly store: KeyValueStore;
  readonly setBusy: (busy: boolean) => void;
  readonly save: () => void;
  readonly cloud: () => boolean;
  readonly inPlay: () => boolean;
  readonly toTitle: () => void;
}

export function startKeepPrompt(deps: KeepStartDeps): void {
  const signIn: TitleSignIn = startTitleAccount(deps.account, { setBusy: deps.setBusy, beforeSignIn: deps.save });
  const view: KeepView = createKeepView({
    world: deps.world,
    hud: deps.hud,
    lobby: deps.lobby,
    store: deps.store,
    clock: (): number => Date.now(),
    offered: (): boolean => signIn.offered(),
    cloud: deps.cloud,
    online: (): boolean => window.navigator.onLine,
    inPlay: deps.inPlay,
    signIn: (): void => {
      deps.save();
      signIn.ask(KEEP_PROMPT.titleNote);
      deps.toTitle();
    },
  });
  let last: number = performance.now();
  runFrames(
    (now: number): void => {
      const dt: number = Math.min(KEEP_START.maxFrame, Math.max(0, (now - last) / KEEP_START.millisecondsPerSecond));
      last = now;
      view.update(dt);
    },
    (error: unknown): void => {
      warnInConsole(`The sign-in prompt failed: ${String(error)}`);
    },
    { request: (callback: (now: number) => void): void => void requestAnimationFrame(callback) },
  );
}

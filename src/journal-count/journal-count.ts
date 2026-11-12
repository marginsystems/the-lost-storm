import { hudHidden } from '../../sim/world/hud.ts';
import type { World } from '../../sim/world/types.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { JournalCountClient, Tally } from '../backend/journal-count-api.ts';
import type { CountLines } from './count-lines.ts';
import { countLine } from './count-lines.ts';
import type { CountState } from './count-state.ts';
import { shouldAsk, shouldShow } from './count-state.ts';
import journalCountCss from './journal-count.css?inline';

export const JOURNAL_COUNT = {
  showMs: 7000,
  shownKey: 'the-lost-storm.journal-count.v1',
  flag: 'first_choice',
  taken: 'took_journal',
} as const;

export interface JournalCountDeps {
  readonly world: World;
  readonly hud: HTMLElement;
  readonly client: JournalCountClient;
  readonly lines: CountLines;
  readonly store: KeyValueStore;
}

export interface JournalCount {
  update(): void;
}

export function createJournalCount(deps: JournalCountDeps): JournalCount {
  const { world, client, lines, store } = deps;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = journalCountCss;
  deps.hud.append(style);
  const element: HTMLDivElement = document.createElement('div');
  element.className = 'journal-count';
  element.dataset['shown'] = 'off';
  element.setAttribute('aria-live', 'polite');
  deps.hud.append(element);
  let state: CountState = { shown: store.read(JOURNAL_COUNT.shownKey) !== null, asked: false, tally: null };

  const ask = async (): Promise<void> => {
    const tally: Tally | null = await client.count();
    state = { ...state, tally };
  };

  return {
    update(): void {
      if (shouldAsk(state, world.flags[JOURNAL_COUNT.flag] === JOURNAL_COUNT.taken, client.signedIn())) {
        state = { ...state, asked: true };
        void ask();
      }
      if (!shouldShow(state, hudHidden(world)) || state.tally === null) return;
      const { others, count } = state.tally;
      state = { ...state, shown: true };
      store.write(JOURNAL_COUNT.shownKey, String(count));
      element.textContent = countLine(lines, others);
      element.dataset['shown'] = 'on';
      window.setTimeout((): void => {
        element.dataset['shown'] = 'off';
      }, JOURNAL_COUNT.showMs);
    },
  };
}

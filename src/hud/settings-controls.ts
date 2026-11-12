import type { ActionDef, RebindResult, ResolvedKeys } from '../settings/bindings.ts';
import { ACTION_GROUPS, BINDING, keyLabel } from '../settings/bindings.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label, setText } from './dom.ts';

const MOUSE_BUTTONS: ReadonlyMap<number, string> = new Map<number, string>([[2, BINDING.rightMouse]]);

const COPY = {
  idle: 'Pick an action, then press the new key. Esc cancels.',
  waiting: 'Press a key for',
} as const;

interface RowView {
  readonly def: ActionDef;
  readonly row: HTMLButtonElement;
  readonly chip: HTMLElement;
}

export interface ControlsPage {
  capturing(): boolean;
  cancel(): void;
  bind(code: string): void;
}

export function mountControls(page: HTMLElement, settings: SettingsStore): ControlsPage {
  const list: HTMLDivElement = el('div', 'ctl-list', page);
  const note: HTMLDivElement = label('ctl-note', COPY.idle, page);
  const footer: HTMLDivElement = el('div', 'ctl-foot', page);
  const reset: HTMLButtonElement = el('button', 'set-text-btn', footer);
  reset.type = 'button';
  reset.textContent = 'Reset to defaults';
  const rows: RowView[] = [];
  let pending: ActionDef | null = null;

  const say = (text: string, warn: boolean): void => {
    note.classList.toggle('warn', warn);
    setText(note, text, true);
  };

  const refresh = (): void => {
    const keys: ResolvedKeys = settings.keys();
    for (const view of rows) {
      const waiting: boolean = pending?.id === view.def.id;
      view.row.classList.toggle('waiting', waiting);
      setText(view.chip, waiting ? '...' : keys.bindingsOf(view.def.id).map(keyLabel).join(' / '), true);
    }
  };

  const select = (def: ActionDef | null): void => {
    pending = def;
    refresh();
    say(def === null ? COPY.idle : `${COPY.waiting} ${def.label}`, false);
  };

  const build = (): void => {
    for (const group of ACTION_GROUPS) {
      const defs: ActionDef[] = settings.keys().table.filter((def: ActionDef): boolean => def.group === group);
      if (defs.length === 0) continue;
      label('ctl-group', group, list);
      for (const def of defs) {
        const row: HTMLButtonElement = el('button', def.locked ? 'ctl-row locked' : 'ctl-row', list);
        row.type = 'button';
        label('ctl-name', def.label, row);
        const chip: HTMLDivElement = label('ctl-chip', '', row);
        rows.push({ def, row, chip });
        row.addEventListener('click', (): void => {
          if (def.locked) return;
          select(pending?.id === def.id ? null : def);
        });
      }
    }
  };
  build();

  const bind = (code: string): void => {
    const target: ActionDef | null = pending;
    if (target === null) return;
    const result: RebindResult = settings.rebind(target.id, code);
    switch (result.kind) {
      case 'ok':
        select(null);
        say(`${target.label} is now ${keyLabel(code)}.`, false);
        return;
      case 'conflict':
        say(`${keyLabel(code)} is already used by ${result.with.label}. Press another key.`, true);
        return;
      case 'refused':
        say(`${result.reason} Press another key.`, true);
        return;
    }
  };

  reset.addEventListener('click', (): void => {
    settings.resetControls();
    select(null);
    say('Controls are back to their defaults.', false);
  });
  settings.subscribe(refresh);
  window.addEventListener(
    'mousedown',
    (event: MouseEvent): void => {
      const code: string | undefined = MOUSE_BUTTONS.get(event.button);
      if (pending === null || code === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      bind(code);
    },
    true,
  );
  refresh();
  return {
    capturing(): boolean {
      return pending !== null;
    },
    cancel(): void {
      if (pending !== null) select(null);
    },
    bind,
  };
}

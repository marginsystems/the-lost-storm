import type { World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { ConditionRow, KindChip, LevelRow, TableAction, TablePick, TableView } from './run-table-model.ts';
import { choosePick, chooseLevel, firstPick, tableView, togglePin } from './run-table-model.ts';

const RUN_TABLE = {
  title: 'Descent Table',
  role: 'Shape your next descent',
  levels: 'Level',
  conditions: 'Conditions',
} as const;

interface LevelView {
  readonly row: HTMLButtonElement;
  readonly range: HTMLElement;
}

interface ConditionView {
  readonly row: HTMLButtonElement;
  readonly price: HTMLElement;
  readonly danger: HTMLElement;
  readonly kinds: HTMLElement;
  key: string;
}

interface ActionView {
  readonly button: HTMLButtonElement;
  readonly note: HTMLElement;
}

function actionView(parent: HTMLElement, className: string): ActionView {
  const holder: HTMLDivElement = el('div', `rt-action ${className}`, parent);
  const button: HTMLButtonElement = el('button', 'rt-go', holder);
  button.type = 'button';
  const note: HTMLDivElement = label('rt-note', '', holder);
  return { button, note };
}

function showAction(view: ActionView, action: TableAction): void {
  setText(view.button, action.label, true);
  setClass(view.button, 'off', action.command === null);
  setClass(view.button, 'short', action.short);
  setText(view.note, action.note, true);
  setClass(view.note, 'shown', action.note !== '');
}

function pinsHint(count: number): string {
  return count === 1 ? '1 pin left' : `${count} pins left`;
}

export function createRunTablePanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel run-table-panel', parent);
  element.dataset['tab'] = 'Descent';
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  const naming: HTMLDivElement = el('div', 'trade-naming', head);
  label('panel-title', RUN_TABLE.title, naming);
  label('trade-role', RUN_TABLE.role, naming);
  const purse: HTMLDivElement = el('div', 'trade-gold', head);
  el('span', 'gold-icon', purse).innerHTML = iconSvg('coin');
  const gold: HTMLSpanElement = el('span', 'gold-text', purse);
  label('panel-subtitle', RUN_TABLE.levels, element);
  const levelList: HTMLDivElement = el('div', 'rt-levels', element);
  const condHead: HTMLDivElement = el('div', 'rt-subhead', element);
  label('panel-subtitle', RUN_TABLE.conditions, condHead);
  const left: HTMLDivElement = label('rt-left', '', condHead);
  const condList: HTMLDivElement = el('div', 'rt-conditions', element);
  const foot: HTMLDivElement = el('div', 'rt-foot', element);
  const totals: HTMLDivElement = el('div', 'rt-totals', foot);
  const totalDanger: HTMLDivElement = label('rt-danger', '', totals);
  const totalReward: HTMLDivElement = label('rt-reward', '', totals);
  const actions: HTMLDivElement = el('div', 'rt-actions', foot);
  const setOut: ActionView = actionView(actions, 'rt-set-out');
  const again: ActionView = actionView(actions, 'rt-again');

  let pick: TablePick | null = null;
  let view: TableView | null = null;
  let levelKey: string = '';
  let levels: Map<string, LevelView> = new Map<string, LevelView>();
  const conditions: Map<string, ConditionView> = new Map<string, ConditionView>();

  const refresh = (): void => {
    const world: World = context.api.world;
    if (world.service?.kind !== 'descent') {
      pick = null;
      return;
    }
    pick ??= firstPick(world);
    view = tableView(world, pick);
    render(view);
  };

  const change = (next: TablePick): void => {
    pick = next;
    refresh();
  };

  const levelRow = (row: LevelRow): LevelView => {
    const button: HTMLButtonElement = el('button', 'rt-level', null);
    button.type = 'button';
    label('rt-level-name', row.name, button);
    const range: HTMLDivElement = label('rt-level-range', row.range, button);
    label('rt-level-holds', row.holds, button);
    button.addEventListener('click', (): void => {
      if (pick !== null) change(chooseLevel(context.api.world, pick, row.id));
    });
    return { row: button, range };
  };

  const conditionRow = (row: ConditionRow): ConditionView => {
    const button: HTMLButtonElement = el('button', 'rt-condition', condList);
    button.type = 'button';
    const top: HTMLDivElement = el('div', 'rt-condition-top', button);
    el('span', 'rt-pin', top);
    label('rt-condition-name', row.name, top);
    const price: HTMLDivElement = label('rt-price', '', top);
    label('rt-condition-text', row.text, button);
    label('rt-condition-reward', row.reward, button);
    const danger: HTMLDivElement = label('rt-condition-danger', row.danger, button);
    const kinds: HTMLDivElement = el('div', 'rt-kinds', button);
    button.addEventListener('click', (event: MouseEvent): void => {
      if (pick === null) return;
      if (event.target instanceof Element && event.target.closest('.rt-kind') !== null) return;
      const next: TablePick = togglePin(context.api.world, pick, row.id);
      if (next === pick) retrigger(button, 'deny');
      change(next);
    });
    return { row: button, price, danger, kinds, key: '' };
  };

  const showKinds = (holder: ConditionView, id: string, chips: readonly KindChip[]): void => {
    const key: string = chips.map((chip: KindChip): string => chip.id).join('|');
    if (key !== holder.key) {
      holder.key = key;
      holder.kinds.replaceChildren(
        ...chips.map((chip: KindChip): HTMLElement => {
          const button: HTMLButtonElement = el('button', 'rt-kind', null);
          button.type = 'button';
          button.textContent = chip.name;
          button.dataset['kind'] = chip.id;
          button.addEventListener('click', (): void => {
            if (pick !== null) change(choosePick(pick, id, chip.id));
          });
          return button;
        }),
      );
    }
    for (const child of holder.kinds.children) if (child instanceof HTMLElement) setClass(child, 'chosen', chips.some((chip: KindChip): boolean => chip.chosen && chip.id === child.dataset['kind']));
    setClass(holder.kinds, 'shown', chips.length > 0);
  };

  const render = (shown: TableView): void => {
    setText(gold, String(context.api.world.player.gold), true);
    const key: string = shown.levels.map((row: LevelRow): string => row.id).join('|');
    if (key !== levelKey) {
      levelKey = key;
      const next: Map<string, LevelView> = new Map<string, LevelView>();
      for (const row of shown.levels) next.set(row.id, levels.get(row.id) ?? levelRow(row));
      levels = next;
      levelList.replaceChildren(...[...next.values()].map((entry: LevelView): HTMLElement => entry.row));
    }
    for (const row of shown.levels) {
      const entry: LevelView | undefined = levels.get(row.id);
      if (entry === undefined) continue;
      setClass(entry.row, 'chosen', row.chosen);
      setText(entry.range, row.range, false);
    }
    setText(left, pinsHint(shown.pinsLeft), true);
    for (const row of shown.conditions) {
      const entry: ConditionView = conditions.get(row.id) ?? conditionRow(row);
      conditions.set(row.id, entry);
      setClass(entry.row, 'pinned', row.pinned);
      setClass(entry.row, 'closed', !row.open);
      setText(entry.price, `${row.price} gold`, true);
      setText(entry.danger, row.danger, true);
      setClass(entry.price, 'short', !row.pinned && row.price > context.api.world.player.gold);
      showKinds(entry, row.id, row.kinds);
    }
    setText(totalDanger, shown.danger, true);
    setText(totalReward, shown.reward === '' ? 'No added reward' : shown.reward, true);
    showAction(setOut, shown.setOut);
    showAction(again, shown.again);
  };

  const send = (action: ActionView, read: (shown: TableView) => TableAction): void => {
    action.button.addEventListener('click', (): void => {
      const command = view === null ? null : read(view).command;
      if (command === null) {
        retrigger(action.button, 'deny');
        return;
      }
      context.api.send(command);
    });
  };
  send(setOut, (shown: TableView): TableAction => shown.setOut);
  send(again, (shown: TableView): TableAction => shown.again);

  return { element, refresh };
}

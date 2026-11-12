import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';

const STASH = {
  hint: 'Click to take',
} as const;

export function createStashPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel', parent);
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  label('panel-title', 'Stash', head);
  const tally: HTMLDivElement = label('trade-role', '', head);
  const grid: HTMLDivElement = el('div', 'inv-grid stash-grid', element);
  const cells: ItemCell[] = Array.from({ length: context.api.world.content.trade.stashSize }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, grid, (): string => STASH.hint);
    const take = (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'trade', action: { type: 'unstash', index } });
    };
    view.cell.addEventListener('click', take);
    view.cell.addEventListener('contextmenu', take);
    return view;
  });

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      let changed: boolean = false;
      for (const [index, view] of cells.entries()) {
        if (showItem(context, view, world.stash[index] ?? null)) changed = true;
      }
      const used: number = world.stash.filter((item: ItemInstance | null): boolean => item !== null).length;
      setText(tally, `${used} / ${world.stash.length}`, changed);
      if (changed) context.tooltip.hide();
    },
  };
}

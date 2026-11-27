import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { promptText, use } from './prompts.ts';
import type { ScrollFade } from './scroll-fade.ts';
import { watchScrollFade } from './scroll-fade.ts';

const STASH = {
  hint: 'take',
} as const;

export function createStashPanel(parent: HTMLElement, context: HudContext, kind: 'stash' | 'porter' = 'stash'): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel stash-panel', parent);
  const porter: boolean = kind === 'porter';
  const title: string = porter ? 'Porter’s satchel' : 'Stash';
  element.dataset['tab'] = title;
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  label('panel-title', title, head);
  const tally: HTMLDivElement = label('trade-role', '', head);
  const hire = porter ? el('button', 'loot-choice', element) : null;
  const status = porter ? label('trade-role', '', element) : null;
  if (hire !== null) {
    hire.type = 'button';
    hire.textContent = 'Hire for 1 hour · ' + context.api.world.content.trade.porter.price + ' gold';
    hire.addEventListener('click', (): void => context.api.send({ type: 'trade', action: { type: 'hire_porter' } }));
    label('trade-role', 'Collects equipment allowed by your loot filter.', element);
  }
  const scroll: HTMLDivElement = el('div', 'stash-scroll', element);
  const fade: ScrollFade = watchScrollFade(scroll);
  const grid: HTMLDivElement = el('div', 'inv-grid stash-grid', scroll);
  const cells: ItemCell[] = Array.from({ length: porter ? context.api.world.content.trade.porter.capacity : context.api.world.content.trade.stashSize }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, grid, (): string => promptText(context.api.touch, use(STASH.hint)));
    const take = (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'trade', action: porter ? { type: 'take_satchel', uid: view.current.uid } : { type: 'unstash', index } });
    };
    view.cell.addEventListener('click', take);
    view.cell.addEventListener('contextmenu', take);
    return view;
  });

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      const storage = porter ? world.satchel : world.stash;
      if (status !== null && hire !== null) {
        const active: boolean = world.porterUntil > world.now;
        hire.hidden = active;
        setText(status, active ? 'On duty · ' + Math.ceil((world.porterUntil - world.now) / 60000) + ' min left' : 'Off duty', true);
      }
      let changed: boolean = false;
      for (const [index, view] of cells.entries()) {
        if (showItem(context, view, storage[index] ?? null)) changed = true;
      }
      const used: number = storage.filter((item: ItemInstance | null): boolean => item !== null).length;
      setText(tally, `${used} / ${storage.length}`, changed);
      if (changed) {
        context.tooltip.hide();
        fade.update();
      }
    },
  };
}

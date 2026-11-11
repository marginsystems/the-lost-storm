import type { Command, ItemInstance, World, WorldEvent } from '../../sim/world/types.ts';

export type HudPanel = 'inventory' | 'tree';

export interface HudApi {
  readonly world: World;
  send(command: Command): void;
  itemImage(item: ItemInstance): string | null;
}

export interface Hud {
  update(dt: number): void;
  handleEvents(events: readonly WorldEvent[]): void;
  isPointerOverUi(): boolean;
  togglePanel(panel: HudPanel): void;
  closePanels(): boolean;
}

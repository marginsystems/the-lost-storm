import type { UiAction } from '../../sim/content/audio.ts';
import type { Command, ItemInstance, World, WorldEvent } from '../../sim/world/types.ts';
import type { AudioControls } from '../audio/settings.ts';
import type { VoicePlayer } from '../voice.ts';

export type HudPanel = 'inventory' | 'tree';

export interface HudApi {
  readonly world: World;
  send(command: Command): void;
  readonly audio: AudioControls;
  playUi(action: UiAction): void;
  itemImage(item: ItemInstance): string | null;
  readonly voice: VoicePlayer;
}

export interface Hud {
  update(dt: number): void;
  handleEvents(events: readonly WorldEvent[]): void;
  isPointerOverUi(): boolean;
  togglePanel(panel: HudPanel): void;
  closePanels(): boolean;
}

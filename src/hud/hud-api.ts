import type { PlayerTrade } from '../player-trade/trade-flow.ts';
import type { UiAction } from '../../sim/content/audio.ts';
import type { Command, ItemInstance, World, WorldEvent } from '../../sim/world/types.ts';
import type { AuctionFlow } from '../auction/auction-flow.ts';
import type { AudioControls } from '../audio/settings.ts';
import type { SettingsSection } from '../settings/settings.ts';
import type { SettingsStore } from '../settings/store.ts';
import type { VoicePlayer } from '../voice.ts';
import type { FrameView } from './frame-meter.ts';
import type { OverlayManager } from './overlays.ts';

export type HudPanel = 'inventory' | 'character' | 'tree' | 'map';

export interface HudApi {
  readonly world: World;
  send(command: Command): void;
  readonly audio: AudioControls;
  readonly settings: SettingsStore;
  openSettings(section: SettingsSection): void;
  readonly feedback: (() => void) | null;
  playUi(action: UiAction): void;
  itemImage(item: ItemInstance): string | null;
  unverified(item: ItemInstance): boolean;
  readonly voice: VoicePlayer;
  readonly touch: boolean;
  readBook(item: ItemInstance): void;
  qualityTier(): string;
  readonly overlays: OverlayManager;
  readonly auction: AuctionFlow | null;
}

export interface Hud {
  update(dt: number, view: FrameView): void;
  refreshItems(): void;
  warm(): void;
  coversScene(): boolean;
  handleEvents(events: readonly WorldEvent[]): void;
  isPointerOverUi(): boolean;
  togglePanel(panel: HudPanel): void;
  closePanels(): boolean;
  requestMap(wanted: boolean): void;
  showGroundItem(item: ItemInstance, x: number, y: number): void;
  moveGroundItem(x: number, y: number): void;
  hideGroundItem(): void;
  attachPlayerTrade(flow: PlayerTrade): void;
}

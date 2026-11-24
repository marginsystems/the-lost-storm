import type { Scene } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content } from '../../sim/content/types.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import type { World } from '../../sim/world/types.ts';
import { createBrowserHideoutServer } from '../backend/browser.ts';
import type { HideoutServer } from '../backend/browser.ts';
import type { Timers } from '../backend/backend.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { LIVE_ZONE } from '../backend/live-protocol.ts';
import type { CharacterLibrary, Dresser } from '../render/character-loader.ts';
import type { TurnGate } from '../render/paced-work.ts';
import { loadNeeds } from '../render/character-loader.ts';
import type { InputHooks } from '../input.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import type { Others } from '../render/others.ts';
import { createOthers } from '../render/others.ts';
import { createGestureClips, fetchGestureClip } from '../render/gesture-clips.ts';
import type { Sight } from '../render/sight.ts';
import { createBrowserStore } from '../storage.ts';
import type { HideoutChat } from './hideout-chat.ts';
import { startHideoutChat } from './hideout-chat.ts';
import type { HideoutMenu } from './hideout-menu.ts';
import { startHideoutMenu } from './hideout-menu.ts';
import type { Hud } from '../hud/hud-api.ts';
import type { PlayerTrade } from '../player-trade/trade-flow.ts';
import { createTradeFlow } from '../player-trade/trade-flow.ts';
import { tradeBusy } from '../player-trade/trade-model.ts';
import type { OtherTarget } from '../render/others.ts';
import type { MapCharacter } from '../minimap/marks.ts';
import type { Mutes } from './mute.ts';
import { createMutes } from './mute.ts';
import type { Ground, ResidentVoice } from './resident-voice.ts';
import { createResidentVoice } from './resident-voice.ts';

export interface HideoutParts {
  readonly scene: Scene;
  readonly library: CharacterLibrary;
  readonly content: Content;
  readonly feather: boolean;
  readonly camera: IsoCamera;
  readonly labels: HTMLElement;
  readonly hud: HTMLElement;
  readonly loader: GLTFLoader;
  readonly dresser: Dresser;
  readonly gate: TurnGate;
  readonly sight: Sight;
  readonly screen: Pick<Hud, 'attachPlayerTrade'>;
  readonly sync: () => Promise<void>;
  readonly openProfile: ((name: string) => void) | null;
  readonly speak: (audio: ArrayBuffer, at: Ground) => Promise<void>;
}

export interface Hideout {
  frame(dt: number, playing: boolean, world: World, presenting: boolean): void;
  playerAt(x: number, y: number): string | null;
  hoverPlayer(id: string | null): void;
  pressPlayer(id: string | null): boolean;
  characters(): readonly MapCharacter[];
}

const WINDOW_TIMERS: Timers = {
  after: (ms: number, task: () => void): (() => void) => {
    const id: number = window.setTimeout(task, ms);
    return (): void => {
      window.clearTimeout(id);
    };
  },
};

export function startHideout(rawUrl: string | undefined, parts: HideoutParts): Hideout | null {
  const server: HideoutServer | null = createBrowserHideoutServer(rawUrl);
  if (server === null) return null;
  let current: World | null = null;
  const mutes: Mutes = createMutes(createBrowserStore());
  const chat: HideoutChat = startHideoutChat(server, parts.hud, (): boolean => current !== null && current.dialogue === null && current.player.alive, mutes, (name: string, line: ChatLine | null, anchor: HTMLElement): void => {
    menu.openName(name, line, anchor);
  });
  const others: Others = createOthers({
    scene: parts.scene,
    library: parts.library,
    content: parts.content,
    feather: parts.feather,
    camera: parts.camera,
    labels: parts.labels,
    load: (needs: CharacterNeeds): Promise<void> => loadNeeds(parts.loader, parts.content, parts.dresser, parts.library, needs, parts.gate),
    clock: (): number => performance.now(),
    sight: parts.sight,
    gestures: createGestureClips(fetchGestureClip(parts.loader, parts.gate)),
  });
  const trade: PlayerTrade = createTradeFlow({ live: server.live, world: (): World | null => current, sync: parts.sync, clock: (): number => Date.now(), timers: WINDOW_TIMERS });
  parts.screen.attachPlayerTrade(trade);
  const menu: HideoutMenu = startHideoutMenu({ server, chat, mutes, others, root: parts.hud, frame: parts.labels, events: window, openDirect: (name: string): void => chat.openDirect(name), openProfile: parts.openProfile, trade: { ready: (): boolean => trade.ready(), busy: (): boolean => tradeBusy(trade.state()), start: (target: OtherTarget): void => trade.ask(target.id, target.name) } });
  const standsAt = (line: ChatLine): Ground | null => {
    if (current?.zone.id !== LIVE_ZONE) return null;
    const id: string | null = line.from !== null && others.groundOf(line.from) !== null ? line.from : others.resident(line.name) ? (others.named(line.name)?.id ?? null) : null;
    return id === null ? null : others.groundOf(id);
  };
  const voice: ResidentVoice = createResidentVoice({ serverUrl: server.url, fetch: server.fetch, standsAt, speak: parts.speak });
  server.live.subscribe((event: LiveEvent): void => {
    others.handle(event);
    voice.handle(event);
    chat.handle(event);
    menu.handle(event);
  });
  let drawn: World['zone'] | null = null;
  return {
    frame(dt: number, playing: boolean, world: World, presenting: boolean): void {
      current = world;
      server.live.update({ zone: playing ? world.zone.id : null, x: world.player.pos.x, z: world.player.pos.z, facing: world.player.facing });
      chat.frame(playing, world.zone.id === LIVE_ZONE);
      const inHideout: boolean = playing && world.zone.id === LIVE_ZONE;
      if (!presenting) {
        menu.frame(false, world.player.pos);
        return;
      }
      if (drawn !== world.zone) others.clear();
      drawn = world.zone;
      others.update(dt, world.zone.floorHeight);
      menu.frame(inHideout, world.player.pos);
    },
    playerAt: (x: number, y: number): string | null => (current?.zone.id === LIVE_ZONE ? others.playerAt({ x, y }) : null),
    hoverPlayer(id: string | null): void {
      menu.hover(id);
    },
    pressPlayer: (id: string | null): boolean => menu.press(id),
    characters: (): readonly MapCharacter[] => (current?.zone.id === LIVE_ZONE ? others.residents() : []),
  };
}

export type PlayerHooks = Pick<InputHooks, 'playerAt' | 'hoverPlayer' | 'pressPlayer'>;

export function playerHooks(hideout: Hideout | null): PlayerHooks {
  return {
    playerAt: (x: number, y: number): string | null => hideout?.playerAt(x, y) ?? null,
    hoverPlayer: (id: string | null): void => hideout?.hoverPlayer(id),
    pressPlayer: (id: string | null): boolean => hideout?.pressPlayer(id) ?? false,
  };
}

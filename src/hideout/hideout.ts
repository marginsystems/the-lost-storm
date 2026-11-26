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
import { HIDEOUT_CHAT, startHideoutChat } from './hideout-chat.ts';
import type { HideoutMenu } from './hideout-menu.ts';
import { startHideoutMenu } from './hideout-menu.ts';
import type { Hud } from '../hud/hud-api.ts';
import type { PlayerTrade } from '../player-trade/trade-flow.ts';
import { createTradeFlow } from '../player-trade/trade-flow.ts';
import { tradeBusy } from '../player-trade/trade-model.ts';
import type { PartyFlow } from '../party/party-flow.ts';
import { createPartyFlow } from '../party/party-flow.ts';
import type { PartyStanding } from '../party/party-model.ts';
import { partyStanding } from '../party/party-model.ts';
import type { OtherTarget } from '../render/others.ts';
import type { MapCharacter } from '../minimap/marks.ts';
import type { WorldTag } from '../render/world-tag.ts';
import type { Mutes } from './mute.ts';
import { createMutes } from './mute.ts';
import type { Ground, ResidentVoice, VoicePhase } from './resident-voice.ts';
import { createResidentVoice } from './resident-voice.ts';
import type { OtherHead } from '../render/others.ts';
import { HEAD_TOP } from '../render/head-top.ts';
import { standLift } from '../render/terrain-lift.ts';
import type { Speaker, SpeechState, SpokenLine } from './speech.ts';
import { expire, heard, NO_SPEECH, say, shownBubbles, spokenOf, voiceEnded, voiceFailed, voiceStarted } from './speech.ts';
import type { BubbleHome, SpeechBubbles } from './speech-bubbles.ts';
import { createSpeechBubbles } from './speech-bubbles.ts';

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
  readonly screen: Pick<Hud, 'attachPlayerTrade' | 'attachParty'>;
  readonly sync: () => Promise<void>;
  readonly openProfile: ((name: string) => void) | null;
  readonly speak: (audio: ArrayBuffer, at: Ground) => Promise<void>;
  readonly headRiseOf: (actorId: number, dt: number) => number;
}

export interface Hideout {
  frame(dt: number, playing: boolean, world: World, presenting: boolean): void;
  playerAt(x: number, y: number): string | null;
  hoverPlayer(id: string | null): void;
  pressPlayer(id: string | null): boolean;
  characters(): readonly MapCharacter[];
  tags(): readonly WorldTag[];
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
  const party: PartyFlow = createPartyFlow({ live: server.live });
  parts.screen.attachParty(party);
  const chat: HideoutChat = startHideoutChat(
    server,
    parts.hud,
    (): boolean => current !== null && current.dialogue === null && current.player.alive,
    mutes,
    (name: string, line: ChatLine | null, anchor: HTMLElement): void => {
      menu.openName(name, line, anchor);
    },
    party,
  );
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
  const menu: HideoutMenu = startHideoutMenu({ server, chat, mutes, others, root: parts.hud, frame: parts.labels, events: window, openDirect: (name: string): void => chat.openDirect(name), openProfile: parts.openProfile, trade: { ready: (): boolean => trade.ready(), busy: (): boolean => tradeBusy(trade.state()), start: (target: OtherTarget): void => trade.ask(target.id, target.name) }, party: { standing: (name: string): PartyStanding => partyStanding(party.state(), party.available(), name), invite: (name: string): void => {
        if (!party.invite(name)) chat.notice(HIDEOUT_CHAT.unsentText);
      } } });
  const standsAt = (line: ChatLine): Ground | null => {
    if (current?.zone.id !== LIVE_ZONE) return null;
    const id: string | null = line.from !== null && others.groundOf(line.from) !== null ? line.from : others.resident(line.name) ? (others.named(line.name)?.id ?? null) : null;
    return id === null ? null : others.groundOf(id);
  };
  let speech: SpeechState = NO_SPEECH;
  let step: number = 0;
  const bubbles: SpeechBubbles = createSpeechBubbles(parts.labels);
  const otherId = (speaker: Speaker): string | null => {
    switch (speaker.kind) {
      case 'self':
        return null;
      case 'other':
        return speaker.id;
      case 'resident':
        return speaker.id !== null && others.headOf(speaker.id) !== null ? speaker.id : others.residentId(speaker.name);
    }
    return null;
  };
  const otherHead = (speaker: Speaker): OtherHead | null => {
    const id: string | null = otherId(speaker);
    return id === null ? null : others.headOf(id);
  };
  const homeOf = (world: World | null, speaker: Speaker): BubbleHome | null => {
    if (speaker.kind !== 'self') {
      const id: string | null = otherId(speaker);
      const holder: HTMLElement | null = id === null ? null : others.holderOf(id);
      return holder === null ? null : { kind: 'held', holder };
    }
    if (world === null) return null;
    const head: OtherHead = heroHead(world);
    return { kind: 'world', ...head };
  };
  const heroHead = (world: World): OtherHead => {
    const { pos } = world.player;
    return { x: pos.x, y: world.zone.floorHeight + standLift(world.zone, world.content.props, pos.x, pos.z) + parts.headRiseOf(world.player.id, step) + HEAD_TOP.gap, z: pos.z };
  };
  const drawnHere = (speaker: Speaker): boolean => speaker.kind === 'self' || (current?.zone.id === LIVE_ZONE && otherHead(speaker) !== null);
  const heardVoice = (line: ChatLine, phase: VoicePhase): void => {
    const now: number = performance.now();
    switch (phase) {
      case 'started':
        speech = voiceStarted(speech, line.id, now);
        return;
      case 'ended':
        speech = voiceEnded(speech, line.id, now);
        return;
      case 'failed':
        speech = voiceFailed(speech, line.id, now);
        return;
    }
  };
  const voice: ResidentVoice = createResidentVoice({ serverUrl: server.url, fetch: server.fetch, standsAt, speak: parts.speak, heard: heardVoice });
  server.live.subscribe((event: LiveEvent): void => {
    others.handle(event);
    speech = heard(speech, event);
    const spoken: SpokenLine | null = spokenOf(speech, event);
    if (spoken !== null && drawnHere(spoken.speaker)) speech = say(speech, spoken, performance.now());
    voice.handle(event);
    chat.handle(event);
    menu.handle(event);
  });
  let drawn: World['zone'] | null = null;
  return {
    frame(dt: number, playing: boolean, world: World, presenting: boolean): void {
      current = world;
      step = dt;
      server.live.update({ zone: playing ? world.zone.id : null, x: world.player.pos.x, z: world.player.pos.z, facing: world.player.facing });
      if (playing) party.where(world.zone.id, world.player.level);
      chat.frame(playing, world.zone.id === LIVE_ZONE);
      const inHideout: boolean = playing && world.zone.id === LIVE_ZONE;
      if (!presenting) {
        menu.frame(false, world.player.pos);
        return;
      }
      if (drawn !== world.zone) {
        others.clear();
        bubbles.clear();
        speech = { ...speech, bubbles: [] };
      }
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
    tags(): readonly WorldTag[] {
      const world: World | null = current;
      speech = expire(speech, performance.now());
      return [...others.tags(), ...bubbles.update(shownBubbles(speech), (speaker: Speaker): BubbleHome | null => homeOf(world, speaker), performance.now())];
    },
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

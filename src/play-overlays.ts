import type { Command, ItemInstance, World } from '../sim/world/types.ts';
import { element } from './dom-element.ts';
import { findLabel } from './hud/pickup-notes.ts';
import type { Hud } from './hud/hud-api.ts';
import type { Actors } from './render/actors.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import type { Overlays } from './render/overlays.ts';
import type { WorldTag } from './render/world-tag.ts';
import { createOverlays } from './render/overlays.ts';
import { HEAD_TOP } from './render/head-top.ts';
import type { SettingsStore } from './settings/store.ts';

export interface PlayOverlaysDeps {
  readonly world: World;
  readonly camera: IsoCamera;
  readonly touch: boolean;
  readonly gameSettings: SettingsStore;
  readonly actors: Actors;
  readonly hud: Hud;
  readonly send: (command: Command) => void;
}

export function createPlayOverlays(deps: PlayOverlaysDeps): Overlays {
  const { world, camera, gameSettings, actors, hud, send } = deps;
  const root: HTMLDivElement = element('overlays', HTMLDivElement);
  const overlays: Overlays = createOverlays(root, camera, {
    findLabel: findLabel(deps.touch),
    nameKeys: (): readonly string[] => gameSettings.keys().bindingsOf('names'),
    heightOf: (id: number): number => actors.heightOf(id),
    labelRiseOf: (id: number, dt: number): number => actors.headRiseOf(id, dt) + HEAD_TOP.gap,
    onPickup: (groundId: number): void => {
      hud.hideGroundItem();
      send({ type: 'pickup', groundId });
    },
    onLootEnter: (item: ItemInstance, x: number, y: number): void => hud.showGroundItem(item, x, y),
    onLootMove: (x: number, y: number): void => hud.moveGroundItem(x, y),
    onLootLeave: (): void => hud.hideGroundItem(),
    onTravel: (exit: string): void => send({ type: 'travel', exit }),
    onTalk: (npcId: number): void => send({ type: 'talk', npcId }),
    onWaypoint: (): void => {
      const waypoint = world.zone.waypoint;
      if (waypoint === null) return;
      send({ type: 'move', held: false, dest: { x: waypoint.x, z: waypoint.z } });
      hud.requestMap(true);
    },
    onUse: (prop: number): void => send({ type: 'use', prop }),
  }, hud.targets);
  return {
    ...overlays,
    update(dt: number, current: World, hoveredId: number | null, tags?: readonly WorldTag[]): void {
      root.classList.toggle('hushed', current.zone.flash !== null);
      overlays.update(dt, current, hoveredId, tags);
    },
  };
}

import type { BookDef, PageDef, VoidShore } from '../../sim/content/story-types.ts';
import type { ZoneAmbience } from '../../sim/content/types.ts';
import { shoreDepth } from '../../sim/world/shore.ts';
import { blendAmbience, shoreEase } from '../render/shore-look.ts';
import { bookOf } from '../../sim/content/story.ts';
import { baseOf } from '../../sim/items.ts';
import type { Vec2 } from '../../sim/math.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { hudHidden } from '../../sim/world/hud.ts';
import { readablePages } from '../../sim/world/story.ts';
import type { Command, ItemInstance, WakeState, World } from '../../sim/world/types.ts';
import type { HudGate } from '../hud/hud-gate.ts';
import { createHudGate, HUD_GATE, hudGateCss } from '../hud/hud-gate.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import openingCss from './opening.css?inline';
import type { SpokenName } from '../backend/name-voice.ts';
import type { NameEcho } from './name-echo.ts';
import { createNameEcho } from './name-echo.ts';
import type { Reader } from './reader.ts';
import { createReader } from './reader.ts';

export const OPENING = {
  wakeDistance: 46,
  wakeRate: 0.45,
  ambienceStep: 0.004,
} as const;

export interface OpeningDeps {
  readonly world: World;
  readonly camera: IsoCamera;
  readonly hud: HTMLElement;
  readonly touch: boolean;
  send(command: Command): void;
  nameOf(): string | null;
  fetchVoice(): Promise<SpokenName | null>;
  refreshName(): Promise<void>;
  playVoice(audio: ArrayBuffer): Promise<void>;
  setAmbience(ambience: ZoneAmbience): void;
}

export interface Opening {
  update(): void;
  readBook(item: ItemInstance): void;
  relight(): void;
}

function bookIn(world: World, item: ItemInstance): BookDef | null {
  return bookOf(world.content, baseOf(world.content, item));
}

function carriedBooks(world: World): Set<number> {
  const uids: Set<number> = new Set<number>();
  for (const item of world.player.inventory) if (item !== null && bookIn(world, item) !== null) uids.add(item.uid);
  return uids;
}

export function createOpening(deps: OpeningDeps): Opening {
  const { world, camera, hud } = deps;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = openingCss;
  hud.append(style);
  let shift: Vec2 = { x: world.shift.x, z: world.shift.z };
  let shiftZone: string = world.zone.id;
  let eased: WakeState | null = null;
  let held: WakeState | null = null;
  const reader: Reader = createReader(hud, deps.touch);
  const echo: NameEcho = createNameEcho({ root: hud, fetchVoice: (): Promise<SpokenName | null> => deps.fetchVoice(), play: (audio: ArrayBuffer): Promise<void> => deps.playVoice(audio), nameOf: (): string | null => deps.nameOf(), refreshName: (): Promise<void> => deps.refreshName() });
  let books: Set<number> = carriedBooks(world);
  let shownShore: number = 0;
  const gateStyle: HTMLStyleElement = document.createElement('style');
  gateStyle.textContent = hudGateCss();
  hud.append(gateStyle);
  const gate: HudGate = createHudGate(document.body, hudHidden(world));
  document.body.addEventListener('animationend', (event: AnimationEvent): void => {
    if (event.animationName === HUD_GATE.revealAnimation) gate.settle();
  });

  const readBook = (item: ItemInstance): void => {
    const book: BookDef | null = bookIn(world, item);
    if (book === null) return;
    const pages: PageDef[] = readablePages(world, book);
    const name: string | null = echo.spokenName() ?? deps.nameOf();
    reader.open(
      book,
      pages.map((page: PageDef) => ({ page, name })),
      (): void => {
        for (const page of pages) deps.send({ type: 'read', book: book.id, page: page.id });
      },
    );
  };

  const noticeBooks = (): void => {
    const now: Set<number> = carriedBooks(world);
    for (const item of world.player.inventory) if (item !== null && now.has(item.uid) && !books.has(item.uid)) readBook(item);
    books = now;
  };

  return {
    readBook,
    relight(): void {
      shownShore = -1;
    },
    update(): void {
      document.body.dataset['zoneKind'] = world.zone.kind;
      document.body.dataset['voidLight'] = world.zone.void !== null && world.zone.exits.some((exit): boolean => exit.hiddenWhenLocked && allHold(world, exit.requires)) ? 'on' : 'off';
      if (world.shift.x !== shift.x || world.shift.z !== shift.z) {
        if (world.zone.id === shiftZone) camera.shift(world.shift.x - shift.x, world.shift.z - shift.z);
        shift = { x: world.shift.x, z: world.shift.z };
      }
      shiftZone = world.zone.id;
      const wake: WakeState | null = world.wake;
      if (wake !== null && wake !== held) {
        held = wake;
        camera.hold(OPENING.wakeDistance);
      }
      if (wake !== null && wake !== eased && wake.elapsed > 0) {
        eased = wake;
        camera.ease(OPENING.wakeRate);
      }
      const shore: VoidShore | null = world.zone.void?.shore ?? null;
      const depth: number = shore === null ? 0 : shoreEase(shoreDepth(world));
      if (shore !== null && (Math.abs(depth - shownShore) >= OPENING.ambienceStep || (depth !== shownShore && (depth === 0 || depth === 1)))) {
        shownShore = depth;
        deps.setAmbience(blendAmbience(world.zone.ambience, shore.ambience, depth));
      }
      gate.set(hudHidden(world));
      noticeBooks();
      echo.update(world);
    },
  };
}

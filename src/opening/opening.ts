import type { BookDef, HudPart, PageDef } from '../../sim/content/story-types.ts';
import { bookOf } from '../../sim/content/story.ts';
import { baseOf } from '../../sim/items.ts';
import { HUD_PARTS } from '../../sim/content/story-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { hiddenHudParts } from '../../sim/world/hud.ts';
import { readablePages } from '../../sim/world/story.ts';
import type { Command, ItemInstance, WakeState, World } from '../../sim/world/types.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import openingCss from './opening.css?inline';
import type { Reader } from './reader.ts';
import { createReader } from './reader.ts';

export const OPENING = {
  wakeDistance: 46,
  wakeRate: 0.45,
  revealAnimation: 'hud-part-reveal',
} as const;

export interface OpeningDeps {
  readonly world: World;
  readonly camera: IsoCamera;
  readonly hud: HTMLElement;
  send(command: Command): void;
  nameOf(): string | null;
}

export interface Opening {
  update(): void;
  readBook(item: ItemInstance): void;
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
  let eased: WakeState | null = null;
  let held: WakeState | null = null;
  const reader: Reader = createReader(hud);
  let books: Set<number> = carriedBooks(world);
  let hidden: ReadonlySet<HudPart> = new Set<HudPart>(hiddenHudParts(world));
  for (const part of hidden) document.body.classList.add(`hud-hide-${part}`);
  document.body.addEventListener('animationend', (event: AnimationEvent): void => {
    if (event.animationName !== OPENING.revealAnimation) return;
    for (const part of HUD_PARTS) document.body.classList.remove(`hud-reveal-${part}`);
  });

  const showHud = (): void => {
    const now: ReadonlySet<HudPart> = new Set<HudPart>(hiddenHudParts(world));
    for (const part of HUD_PARTS) {
      if (now.has(part) === hidden.has(part)) continue;
      document.body.classList.toggle(`hud-hide-${part}`, now.has(part));
      if (!now.has(part)) document.body.classList.add(`hud-reveal-${part}`);
    }
    hidden = now;
  };

  const readBook = (item: ItemInstance): void => {
    const book: BookDef | null = bookIn(world, item);
    if (book === null) return;
    const pages: PageDef[] = readablePages(world, book);
    const name: string | null = deps.nameOf();
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
    update(): void {
      document.body.dataset['zoneKind'] = world.zone.kind;
      document.body.dataset['voidLight'] = world.zone.void !== null && world.zone.exits.some((exit): boolean => exit.hiddenWhenLocked && allHold(world, exit.requires)) ? 'on' : 'off';
      if (world.shift.x !== shift.x || world.shift.z !== shift.z) {
        camera.shift(world.shift.x - shift.x, world.shift.z - shift.z);
        shift = { x: world.shift.x, z: world.shift.z };
      }
      const wake: WakeState | null = world.wake;
      if (wake !== null && wake !== held) {
        held = wake;
        camera.hold(OPENING.wakeDistance);
      }
      if (wake !== null && wake !== eased && wake.elapsed > 0) {
        eased = wake;
        camera.ease(OPENING.wakeRate);
      }
      showHud();
      noticeBooks();
    },
  };
}

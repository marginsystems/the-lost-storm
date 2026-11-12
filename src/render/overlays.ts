import { Vector2 } from 'three';
import { shownTitle } from '../hud/npc-title.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { hasNews } from '../../sim/world/dialogue.ts';
import type { GroundItem, NpcState, World, WorldEvent } from '../../sim/world/types.ts';
import { createTargetBar } from '../hud/target-bar.ts';
import type { TargetBar } from '../hud/target-bar.ts';
import { createHealthBars } from './health-bars.ts';
import type { HealthBars } from './health-bars.ts';
import type { IsoCamera } from './iso-camera.ts';
import { createLootTip } from './loot-tip.ts';
import type { LootTip, TipCheck } from './loot-tip.ts';
import { anchorInView, placeTag } from './label-edge.ts';
import type { ItemPoint, TagPlace, ViewSize } from './label-edge.ts';
import { foldPiles, stackLabels } from './label-stack.ts';
import type { LabelGlide } from './label-glide.ts';
import { createGlide, glideToward } from './label-glide.ts';
import type { Folding, RankedBox, ScreenRect } from './label-stack.ts';

export const OVERLAYS = {
  numberLife: 1,
  numberDrift: 26,
  labelLift: 1.35,
  labelExit: 0.52,
  labelNear: 9,
  labelGap: 2,
  pileKeep: 3,
  pileReach: 36,
  labelHeight: 20,
  labelWidth: 90,
  labelShownRank: 1,
  findLabel: 'Pick up',
  arrowFloor: 0.001,
  arrowGap: 1,
  altKey: 'Alt',
  numberHeight: 0.75,
  exitLift: 2.6,
  npcLift: 0.5,
  npcLeave: 0.52,
  hudBlockers: ['.hud-bottom', '.hud-globe-group', '.hud-xp', '.tc-btn', '.tc-stick', '.tc-menu', '.minimap-corner', '.hud-quests', '.hud-target.visible', '.hud-hint.visible', '.hud > .hud-banners'],
  hudReadSeconds: 0.25,
  waypointId: 'waypoint',
  waypointName: 'Waypoint',
} as const;

interface FloatingNumber {
  readonly element: HTMLDivElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  age: number;
}

interface LootLabel {
  readonly element: HTMLDivElement;
  readonly inner: HTMLSpanElement;
  readonly ground: GroundItem;
  folded: boolean;
  more: number;
  leaving: number;
  rank: number;
  width: number;
  height: number;
  shown: boolean;
  readonly glide: LabelGlide;
}

interface ExitLabel {
  readonly element: HTMLDivElement;
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly open: (world: World) => boolean;
  readonly secret: boolean;
  readonly glide: LabelGlide;
}

interface NpcLabel {
  readonly element: HTMLDivElement;
  readonly npc: NpcState;
  news: boolean | null;
  readonly glide: LabelGlide;
}

interface LeavingLabel {
  readonly element: HTMLDivElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  left: number;
  readonly glide: LabelGlide;
}

export interface OverlayHooks {
  heightOf(actorId: number): number;
  onPickup(groundId: number): void;
  onLootEnter(item: ItemInstance, x: number, y: number): void;
  onLootMove(x: number, y: number): void;
  onLootLeave(): void;
  onTravel(exit: string): void;
  onTalk(npcId: number): void;
  onWaypoint(): void;
}

export interface Overlays {
  handle(events: readonly WorldEvent[], world: World): void;
  update(dt: number, world: World, hoveredId: number | null): void;
  aimExit(exit: string | null): void;
  labelHover(): number | null;
}

function blockersIn(root: HTMLElement): ScreenRect[] {
  const origin: DOMRect = root.getBoundingClientRect();
  const rects: ScreenRect[] = [];
  for (const selector of OVERLAYS.hudBlockers) {
    for (const element of document.querySelectorAll(selector)) {
      const box: DOMRect = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') rects.push({ left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top });
    }
  }
  return rects;
}

function place(element: HTMLElement, point: Vector2): void {
  element.style.transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0)`;
}

function glidePlace(element: HTMLElement, glide: LabelGlide, anchor: Vector2, target: Vector2, dt: number): void {
  glideToward(glide, target.x - anchor.x, target.y - anchor.y, dt);
  target.set(anchor.x + glide.x, anchor.y + glide.y);
  place(element, target);
}

export function createOverlays(root: HTMLElement, camera: IsoCamera, hooks: OverlayHooks): Overlays {
  let hudRects: ScreenRect[] = [];
  let sinceHudRead: number = Infinity;
  const numbers: FloatingNumber[] = [];
  const labels: Map<number, LootLabel> = new Map<number, LootLabel>();
  let exits: ExitLabel[] = [];
  let view: ViewSize = { width: root.clientWidth, height: root.clientHeight };
  new ResizeObserver((): void => {
    view = { width: root.clientWidth, height: root.clientHeight };
  }).observe(root);
  let labelHoverId: number | null = null;
  let showAll: boolean = false;
  let exitsOf: ZoneDef | null = null;
  let aimed: string | null = null;
  let people: NpcLabel[] = [];
  let peopleOf: readonly NpcState[] | null = null;
  let peopleZone: ZoneDef | null = null;
  let seenZone: ZoneDef | null = null;
  let tipZone: ZoneDef | null = null;
  const pointer: Vector2 = new Vector2(-1, -1);
  window.addEventListener('pointermove', (event: PointerEvent): void => {
    pointer.set(event.clientX, event.clientY);
  });
  const tip: LootTip = createLootTip((): void => hooks.onLootLeave());
  let leaving: LeavingLabel[] = [];
  const point: Vector2 = new Vector2();
  const anchor: Vector2 = new Vector2();
  const keepClear = (element: HTMLElement): void => {
    const tag: Element | null = element.firstElementChild;
    if (!(tag instanceof HTMLElement) || tag.offsetWidth === 0) return;
    const spot: TagPlace = placeTag(point.x, point.y, tag.offsetWidth, tag.offsetHeight, view, hudRects);
    point.set(spot.x, spot.y);
  };
  const labelLayer: HTMLDivElement = document.createElement('div');
  const numberLayer: HTMLDivElement = document.createElement('div');
  for (const layer of [labelLayer, numberLayer]) {
    layer.className = 'world-layer';
    root.append(layer);
  }
  const healthBars: HealthBars = createHealthBars(root, camera);
  const targetBar: TargetBar = createTargetBar(root);

  const setAlt = (event: KeyboardEvent): void => {
    if (event.key === OVERLAYS.altKey) showAll = event.type === 'keydown';
  };
  window.addEventListener('keydown', setAlt);
  window.addEventListener('keyup', setAlt);
  window.addEventListener('blur', (): void => {
    showAll = false;
  });

  const float = (text: string, kind: string, x: number, y: number, z: number): void => {
    const element: HTMLDivElement = document.createElement('div');
    element.className = `damage-number ${kind}`;
    const inner: HTMLSpanElement = document.createElement('span');
    inner.textContent = text;
    inner.style.setProperty('--drift', `${((Math.random() - 0.5) * 2 * OVERLAYS.numberDrift).toFixed(0)}px`);
    element.append(inner);
    numberLayer.append(element);
    numbers.push({ element, x, y, z, age: 0 });
  };

  const foldLabel = (label: LootLabel, folded: boolean, more: number): void => {
    if (folded !== label.folded) {
      label.folded = folded;
      label.element.classList.toggle('folded', folded);
    }
    if (more === label.more) return;
    label.more = more;
    if (more > 0) label.inner.dataset['more'] = String(more);
    else delete label.inner.dataset['more'];
  };

  const labelFor = (world: World, ground: GroundItem): void => {
    if (ground.content.kind !== 'item' || labels.has(ground.id)) return;
    const element: HTMLDivElement = document.createElement('div');
    element.className = 'loot-label';
    const inner: HTMLSpanElement = document.createElement('span');
    const arrow: HTMLElement = document.createElement('i');
    arrow.className = 'loot-arrow';
    inner.textContent = ground.find === null ? itemName(world.content, ground.content.item) : OVERLAYS.findLabel;
    inner.style.color = rarityOf(world.content, ground.content.item).color;
    element.append(inner, arrow);
    element.addEventListener('pointerdown', (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) hooks.onPickup(ground.id);
    });
    const item: ItemInstance = ground.content.item;
    element.addEventListener('pointerenter', (event: PointerEvent): void => {
      const label: LootLabel | undefined = labels.get(ground.id);
      pointer.set(event.clientX, event.clientY);
      tipZone = seenZone;
      tip.enter(ground.id, label === undefined || label.leaving >= 0, (): void => hooks.onLootEnter(item, event.clientX, event.clientY));
    });
    element.addEventListener('pointermove', (event: PointerEvent): void => {
      if (tip.owner() === ground.id) hooks.onLootMove(event.clientX, event.clientY);
    });
    element.addEventListener('pointerleave', (): void => {
      tip.leave(ground.id);
    });
    labelLayer.append(element);
    const rank: number = world.content.rarities.findIndex((rarity): boolean => rarity.id === item.rarity);
    labels.set(ground.id, { element, inner, ground, folded: false, more: 0, leaving: -1, rank, width: OVERLAYS.labelWidth, height: OVERLAYS.labelHeight, shown: true, glide: createGlide() });
  };

  const showExits = (world: World): void => {
    for (const label of exits) label.element.remove();
    exitsOf = world.zone;
    aimed = null;
    exits = world.zone.exits.map((exit): ExitLabel => {
      const element: HTMLDivElement = document.createElement('div');
      element.className = world.zone.kind === 'void' ? 'exit-label distant' : 'exit-label';
      const inner: HTMLSpanElement = document.createElement('span');
      inner.textContent = world.content.zones.get(exit.to)?.name ?? exit.to;
      element.append(inner);
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTravel(exit.id);
      });
      labelLayer.append(element);
      return { element, id: exit.id, x: exit.x, z: exit.z, open: (current: World): boolean => allHold(current, exit.requires), secret: exit.hiddenWhenLocked, glide: createGlide() };
    });
    const waypoint = world.zone.waypoint;
    if (waypoint === null) return;
    const element: HTMLDivElement = document.createElement('div');
    element.className = 'exit-label waypoint';
    const inner: HTMLSpanElement = document.createElement('span');
    inner.textContent = OVERLAYS.waypointName;
    element.append(inner);
    element.addEventListener('pointerdown', (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) hooks.onWaypoint();
    });
    labelLayer.append(element);
    exits.push({ element, id: OVERLAYS.waypointId, x: waypoint.x, z: waypoint.z, open: (current: World): boolean => current.waypoints.includes(current.zone.id), secret: false, glide: createGlide() });
  };

  const showPeople = (world: World): void => {
    const sameZone: boolean = peopleZone === world.zone;
    if (!sameZone) {
      for (const label of leaving) label.element.remove();
      leaving = [];
    }
    for (const label of people) {
      if (world.npcs.includes(label.npc)) continue;
      if (!sameZone) {
        label.element.remove();
        continue;
      }
      label.element.classList.add('leaving');
      leaving.push({ element: label.element, x: label.npc.pos.x, y: hooks.heightOf(label.npc.id) + OVERLAYS.npcLift, z: label.npc.pos.z, left: OVERLAYS.npcLeave, glide: label.glide });
    }
    const staying: NpcLabel[] = people.filter((label: NpcLabel): boolean => world.npcs.includes(label.npc));
    peopleOf = world.npcs;
    peopleZone = world.zone;
    people = world.npcs.map((npc: NpcState): NpcLabel => {
      const kept: NpcLabel | undefined = staying.find((label: NpcLabel): boolean => label.npc === npc);
      if (kept !== undefined) return kept;
      const element: HTMLDivElement = document.createElement('div');
      element.className = 'npc-label';
      const inner: HTMLSpanElement = document.createElement('span');
      const news: HTMLElement = document.createElement('i');
      const name: HTMLElement = document.createElement('b');
      name.textContent = npc.def.name;
      const title: HTMLElement = document.createElement('small');
      title.textContent = shownTitle(npc.def);
      inner.append(news, name, title);
      element.append(inner);
      element.addEventListener('pointerenter', (): void => {
        labelHoverId = npc.id;
      });
      element.addEventListener('pointerleave', (): void => {
        if (labelHoverId === npc.id) labelHoverId = null;
      });
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTalk(npc.id);
      });
      labelLayer.append(element);
      return { element, npc, news: null, glide: createGlide() };
    });
  };

  return {
    aimExit(exit: string | null): void {
      if (exit === aimed) return;
      aimed = exit;
      for (const label of exits) label.element.classList.toggle('aimed', label.id === exit);
    },
    handle(events: readonly WorldEvent[], world: World): void {
      for (const event of events) {
        switch (event.type) {
          case 'damage': {
            if (event.targetTeam !== 'player') targetBar.hit(event.targetId);
            const y: number = hooks.heightOf(event.targetId) * OVERLAYS.numberHeight;
            const kind: string = event.targetTeam === 'player' ? 'hurt' : event.crit ? 'crit' : '';
            float(event.crit ? `${event.amount}!` : `${event.amount}`, kind, event.pos.x, y, event.pos.z);
            break;
          }
          case 'drop':
            labelFor(world, event.ground);
            break;
          case 'pickup': {
            const label: LootLabel | undefined = labels.get(event.ground.id);
            if (label !== undefined) {
              label.leaving = OVERLAYS.labelExit;
              label.element.classList.add('taken');
            }
            if (event.ground.content.kind === 'gold') float(`+${event.ground.content.amount} gold`, 'gold', event.ground.pos.x, 1.2, event.ground.pos.z);
            break;
          }
          case 'area':
          case 'chain':
          case 'beam':
          case 'blink':
          case 'brand':
          case 'skill_unlocked':
          case 'chart_point':
          case 'xp':
          case 'skill_start':
          case 'skill_impact':
          case 'hazard':
          case 'guarded':
          case 'skill_interrupt':
          case 'projectile_spawn':
          case 'projectile_end':
          case 'death':
          case 'monster_spawn':
          case 'monster_remove':
          case 'aggro':
          case 'level_up':
          case 'surge':
          case 'surge_cleared':
          case 'player_respawn':
          case 'notice':
          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'silence':
          case 'zone_edited':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'moment_gone':
          case 'path_marked':
          case 'character_changed':
          case 'zone_changed':
          case 'checkpoint':
          case 'hero_step':
          case 'explored':
          case 'dialogue_line':
          case 'dialogue_closed':
          case 'quest_started':
          case 'quest_advanced':
          case 'act_ended':
          case 'triggered':
          case 'quest_completed':
          case 'waypoint_unlocked':
          case 'exit_locked':
          case 'boss_phase':
          case 'bark':
          case 'flask_used':
          case 'revive':
          case 'flasks_refilled':
            break;
        }
      }
    },
    labelHover(): number | null {
      return labelHoverId;
    },
    update(dt: number, world: World, hoveredId: number | null): void {
      sinceHudRead += dt;
      if (sinceHudRead >= OVERLAYS.hudReadSeconds) {
        hudRects = blockersIn(root);
        sinceHudRead = 0;
      }
      if (exitsOf !== world.zone) showExits(world);
      for (const label of exits) {
        const open: boolean = label.open(world);
        label.element.classList.toggle('locked', !open);
        label.element.classList.toggle('secret', !open && label.secret);
        camera.project(label.x, OVERLAYS.exitLift, label.z, point);
        anchor.copy(point);
        label.element.classList.toggle('edge', !anchorInView(point.x, point.y, view));
        keepClear(label.element);
        glidePlace(label.element, label.glide, anchor, point, dt);
      }
      if (peopleOf !== world.npcs) showPeople(world);
      for (const label of people) {
        const news: boolean = hasNews(world, label.npc.def);
        if (news !== label.news) {
          label.news = news;
          label.element.classList.toggle('news', news);
        }
        label.element.classList.toggle('aimed', label.npc.id === hoveredId);
        camera.project(label.npc.pos.x, hooks.heightOf(label.npc.id) + OVERLAYS.npcLift, label.npc.pos.z, point);
        anchor.copy(point);
        keepClear(label.element);
        glidePlace(label.element, label.glide, anchor, point, dt);
      }
      for (const label of leaving) {
        label.left -= dt;
        if (label.left <= 0) {
          label.element.remove();
          continue;
        }
        camera.project(label.x, label.y, label.z, point);
        anchor.copy(point);
        glidePlace(label.element, label.glide, anchor, point, dt);
      }
      if (leaving.some((label: LeavingLabel): boolean => label.left <= 0)) leaving = leaving.filter((label: LeavingLabel): boolean => label.left > 0);

      for (let index: number = numbers.length - 1; index >= 0; index -= 1) {
        const number: FloatingNumber | undefined = numbers[index];
        if (number === undefined) continue;
        number.age += dt;
        if (number.age > OVERLAYS.numberLife) {
          number.element.remove();
          numbers.splice(index, 1);
          continue;
        }
        camera.project(number.x, number.y, number.z, point);
        place(number.element, point);
      }

      healthBars.update(dt, world, (actorId: number): number => hooks.heightOf(actorId));
      targetBar.update(dt, world.monsters, hoveredId);

      seenZone = world.zone;
      tip.check((id: number): TipCheck => {
        const label: LootLabel | undefined = labels.get(id);
        const under: Element | null = document.elementFromPoint(pointer.x, pointer.y);
        return {
          present: label !== undefined && world.ground.includes(label.ground),
          leaving: label === undefined || label.leaving >= 0,
          sameZone: tipZone === world.zone,
          underPointer: label !== undefined && under !== null && label.element.contains(under),
        };
      });
      for (const ground of world.ground) labelFor(world, ground);
      const boxes: RankedBox[] = [];
      const settled: RankedBox[] = [];
      const items: Map<number, ItemPoint> = new Map<number, ItemPoint>();
      const moved: Set<number> = new Set<number>();
      for (const [id, label] of labels) {
        if (label.leaving >= 0) {
          label.leaving -= dt;
          if (label.leaving <= 0) {
            label.element.remove();
            labels.delete(id);
            continue;
          }
        } else if (!world.ground.includes(label.ground)) {
          label.leaving = OVERLAYS.labelExit;
          label.element.classList.add('taken');
        }
        const near: boolean = Math.hypot(label.ground.pos.x - world.player.pos.x, label.ground.pos.z - world.player.pos.z) <= OVERLAYS.labelNear;
        const shown: boolean = showAll || near || label.rank >= OVERLAYS.labelShownRank;
        if (shown !== label.shown) {
          label.shown = shown;
          label.element.classList.toggle('dim', !shown);
        }
        const inner: Element | null = label.element.firstElementChild;
        if (inner instanceof HTMLElement && inner.offsetWidth > 0) {
          label.width = inner.offsetWidth;
          label.height = inner.offsetHeight;
        }
        camera.project(label.ground.pos.x, OVERLAYS.labelLift, label.ground.pos.z, point);
        if (shown) {
          const first: TagPlace = placeTag(point.x, point.y, label.width, label.height, view, hudRects);
          items.set(id, { x: point.x, y: point.y });
          if (first.away) moved.add(id);
          const box: RankedBox = { id, x: first.x, y: first.y, width: label.width, height: label.height, rank: label.rank };
          boxes.push(box);
          if (label.leaving < 0) settled.push(box);
        }
        else {
          anchor.copy(point);
          glidePlace(label.element, label.glide, anchor, point, dt);
        }
      }
      const folding: Folding = foldPiles(showAll ? [] : settled, OVERLAYS.pileReach, OVERLAYS.pileKeep);
      for (const [id, label] of labels) foldLabel(label, folding.folded.has(id), folding.more.get(id) ?? 0);
      const lifts: Map<number, number> = stackLabels(boxes.filter((box: RankedBox): boolean => !folding.folded.has(box.id)), OVERLAYS.labelGap);
      for (const box of boxes) {
        const label: LootLabel | undefined = labels.get(box.id);
        const item: ItemPoint | undefined = items.get(box.id);
        if (label === undefined || item === undefined) continue;
        const target: TagPlace = placeTag(box.x, box.y + (lifts.get(box.id) ?? 0), box.width, box.height, view, hudRects, item);
        anchor.set(item.x, item.y);
        point.set(target.x, target.y);
        glidePlace(label.element, label.glide, anchor, point, dt);
        const spot: TagPlace = { ...target, x: point.x, y: point.y, turn: Math.atan2(item.y - (point.y - box.height / 2), item.x - point.x) };
        const away: boolean = spot.away || moved.has(box.id);
        label.element.classList.toggle('away', away);
        if (away) {
          const reach: number = Math.min(box.width / 2 / Math.max(OVERLAYS.arrowFloor, Math.abs(Math.cos(spot.turn))), box.height / 2 / Math.max(OVERLAYS.arrowFloor, Math.abs(Math.sin(spot.turn))));
          label.element.style.setProperty('--tag-turn', `${spot.turn.toFixed(3)}rad`);
          label.element.style.setProperty('--tag-reach', `${(reach + OVERLAYS.arrowGap).toFixed(1)}px`);
          label.element.style.setProperty('--tag-mid', `${(-box.height / 2).toFixed(1)}px`);
        }
      }

    },
  };
}

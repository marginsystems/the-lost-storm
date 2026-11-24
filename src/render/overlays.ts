import { Vector2 } from 'three';
import { shownTitle } from '../hud/npc-title.ts';
import { anyUpgradeReady } from '../../sim/world/flask-tiers.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { stationAt } from '../../sim/world/trade.ts';
import { questPins } from '../../sim/world/quest-pins.ts';
import type { TargetSource } from '../../sim/world/objective.ts';
import { LIVE_TARGETS } from '../../sim/world/objective.ts';
import type { GroundItem, ItemInstance, NpcState, World, WorldEvent } from '../../sim/world/types.ts';
import { createTargetBar } from '../hud/target-bar.ts';
import type { TargetBar } from '../hud/target-bar.ts';
import { createHealthBars } from './health-bars.ts';
import type { HealthBars } from './health-bars.ts';
import type { IsoCamera } from './iso-camera.ts';
import { floorUp } from './terrain-lift.ts';
import { createLootTip } from './loot-tip.ts';
import type { LootTip, TipCheck } from './loot-tip.ts';
import { anchorInView, heldReach, keepApart, keepTagInView, LABEL_EDGE, placeTag, squaredDistance, stackAtEdges } from './label-edge.ts';
import type { EdgeStack, EdgeTag, ItemPoint, TagPlace, ViewSize } from './label-edge.ts';
import { foldPiles, settleLabels } from './label-stack.ts';
import { lootShown, pilesFold } from './loot-shown.ts';
import type { ItemNames } from './item-names.ts';
import { createItemNames, ITEM_NAMES, sessionFlag, watchItemNames } from './item-names.ts';
import type { LabelGlide } from './label-glide.ts';
import { createGlide, glideToward } from './label-glide.ts';
import type { Folding, LabelSpot, RankedBox, ScreenRect } from './label-stack.ts';
import type { TagSize, TagSizes } from './tag-sizes.ts';
import { createPanelCover } from './panel-cover.ts';
import type { PanelCover } from './panel-cover.ts';
import { browserTagMeasure, createTagSizes } from './tag-sizes.ts';
import { blockersIn, glideAt, glidePlace, place } from './overlay-place.ts';
import type { TagBound } from './overlay-place.ts';
import type { WorldTag } from './world-tag.ts';
import { createFloatingNumbers } from './floating-numbers.ts';
import { placeKey, zonePlaces } from '../../sim/content/markers.ts';
import type { FloatingNumbers } from './floating-numbers.ts';
import type { NumberKind } from './number-crowd.ts';

export const OVERLAYS = {
  pinGlyph: '!',
  chestHeight: 1.6,
  goldHeight: 1.2,
  labelLift: 1.35,
  findLift: 3.15,
  labelExit: 0.52,
  labelNear: 9,
  labelGap: 2,
  pileKeep: 3,
  pileReach: 36,
  labelHeight: 20,
  labelWidth: 90,
  labelShownRank: 1,
  arrowFloor: 0.001,
  arrowGap: 1,
  numberHeight: 0.75,
  exitLift: 2.6,
  npcLeave: 0.52,
  hudBlockers: ['.hud-bottom', '.hud-volume-wrap', '.hud-globe-group', '.hud-xp', '.tc-btn', '.tc-stick', '.tc-menu', '.minimap-corner', '.hud-quests', '.hud-target.visible', '.hud-boss.visible', '.hud-hint.visible', '.tc-stick.intro:not(.on) .tc-stick-hint', '.hud > .hud-banners'],
  hudReadSeconds: 0.25,
  waypointId: 'waypoint',
  stationId: 'station:',
  waypointName: 'Waypoint',
} as const;

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
  readonly lift: number;
  readonly glide: LabelGlide;
  readonly stack: LabelGlide;
  pinned: boolean;
}

interface HoveredLabel {
  readonly id: number;
  readonly element: HTMLElement;
}

interface NpcLabel {
  readonly element: HTMLDivElement;
  readonly npc: NpcState;
  pinned: boolean | null;
  upgrade: boolean | null;
  readonly glide: LabelGlide;
  readonly stack: LabelGlide;
}

interface PendingTag {
  readonly element: HTMLElement;
  readonly stack: LabelGlide;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reach: number;
  readonly offscreen: boolean;
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
  readonly findLabel: string;
  nameKeys(): readonly string[];
  heightOf(actorId: number): number;
  labelRiseOf(actorId: number, dt: number): number;
  onPickup(groundId: number): void;
  onLootEnter(item: ItemInstance, x: number, y: number): void;
  onLootMove(x: number, y: number): void;
  onLootLeave(): void;
  onTravel(exit: string): void;
  onTalk(npcId: number): void;
  onWaypoint(): void;
  onUse(prop: number): void;
}

export interface Overlays {
  readonly itemNames: ItemNames;
  handle(events: readonly WorldEvent[], world: World): void;
  readHud(dt: number): void;
  update(dt: number, world: World, hoveredId: number | null, tags?: readonly WorldTag[]): void;
  aimExit(exit: string | null): void;
  aimItem(groundId: number | null): void;
  labelHover(): number | null;
}

export function createOverlays(root: HTMLElement, camera: IsoCamera, hooks: OverlayHooks, targets: TargetSource = LIVE_TARGETS): Overlays {
  let hudRects: ScreenRect[] = [];
  let sinceHudRead: number = Infinity;
  const labels: Map<number, LootLabel> = new Map<number, LootLabel>();
  let exits: ExitLabel[] = [];
  let view: ViewSize = { width: root.clientWidth, height: root.clientHeight };
  new ResizeObserver((): void => {
    view = { width: root.clientWidth, height: root.clientHeight };
  }).observe(root);
  let labelHovered: HoveredLabel | null = null;
  let exitsOf: ZoneDef | null = null;
  let aimed: string | null = null;
  let aimedItem: number | null = null;
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
  const tagSizes: TagSizes<HTMLElement> = createTagSizes(browserTagMeasure());
  const tagRects: ScreenRect[] = [];
  const plateRects: ScreenRect[] = [];
  const keepClear = (element: HTMLElement): TagBound | null => {
    const tag: Element | null = element.firstElementChild;
    if (!(tag instanceof HTMLElement)) return null;
    const size: TagSize = tagSizes.size(tag);
    if (size.width === 0) return null;
    const spot: TagPlace = placeTag(point.x, point.y, size.width, size.height, view, tagRects);
    point.set(spot.x, spot.y);
    tagRects.push({ left: spot.x - size.width / 2, top: spot.y - size.height, right: spot.x + size.width / 2, bottom: spot.y });
    return { size, view };
  };
  const pending: PendingTag[] = [];
  const pinnedExits: Set<string> = new Set<string>();
  const pinnedNpcs: Set<number> = new Set<number>();
  const onGround: Set<GroundItem> = new Set<GroundItem>();
  const lootBlockers: ScreenRect[] = [];
  const boxes: RankedBox[] = [];
  const settled: RankedBox[] = [];
  const items: Map<number, ItemPoint> = new Map<number, ItemPoint>();
  const moved: Set<number> = new Set<number>();
  const reaches: WeakMap<HTMLElement, number> = new WeakMap<HTMLElement, number>();
  const settleTag = (element: HTMLElement, glide: LabelGlide, stack: LabelGlide, dt: number, shown: boolean): void => {
    const bound: TagBound | null = shown ? keepClear(element) : null;
    glideAt(glide, anchor, point, dt, bound);
    if (bound === null || !shown) {
      element.classList.remove('quiet');
      const plate: Element | null = element.firstElementChild;
      if (plate instanceof HTMLElement) plate.style.scale = '';
      place(element, point);
      return;
    }
    const reach: number = heldReach(reaches.get(element), Math.hypot(point.x - anchor.x, point.y - anchor.y));
    reaches.set(element, reach);
    pending.push({ element, stack, x: point.x, y: point.y, width: bound.size.width, height: bound.size.height, reach, offscreen: !anchorInView(anchor.x, anchor.y, view) });
  };
  const stackTags = (dt: number): void => {
    const stacked: EdgeStack = stackAtEdges(pending.map((tag: PendingTag, id: number): EdgeTag => ({ id, x: tag.x, y: tag.y, width: tag.width, height: tag.height, reach: tag.reach, offscreen: tag.offscreen })), view);
    const shown: EdgeTag[] = pending.map((tag: PendingTag, id: number): EdgeTag => {
      glideToward(tag.stack, 0, stacked.lift.get(id) ?? 0, dt);
      const quiet: boolean = stacked.quiet.has(id);
      tag.element.classList.toggle('quiet', quiet);
      const plate: Element | null = tag.element.firstElementChild;
      if (plate instanceof HTMLElement) plate.style.scale = quiet ? String(LABEL_EDGE.quietScale) : '';
      const scale: number = quiet ? LABEL_EDGE.quietScale : 1;
      return { id, x: tag.x, y: tag.y + tag.stack.y, width: tag.width * scale, height: tag.height * scale, reach: tag.reach, offscreen: tag.offscreen };
    });
    const apart: ReadonlyMap<number, number> = keepApart(shown, hudRects, view);
    for (const tag of shown) {
      const element: HTMLElement | undefined = pending[tag.id]?.element;
      if (element === undefined) continue;
      const [x, y] = keepTagInView(tag.x, tag.y + (apart.get(tag.id) ?? 0), tag.width, tag.height, view);
      plateRects.push({ left: x - tag.width / 2, top: y - tag.height, right: x + tag.width / 2, bottom: y });
      point.set(x, y);
      place(element, point);
    }
    pending.length = 0;
  };
  const labelLayer: HTMLDivElement = document.createElement('div');
  const numberLayer: HTMLDivElement = document.createElement('div');
  for (const layer of [labelLayer, numberLayer]) {
    layer.className = 'world-layer';
    root.append(layer);
  }
  const itemNames: ItemNames = createItemNames((): readonly string[] => hooks.nameKeys(), sessionFlag(ITEM_NAMES.sessionKey));
  watchItemNames(itemNames, window);
  const healthBars: HealthBars = createHealthBars(root, camera);
  const panelCover: PanelCover = createPanelCover(root);
  const targetBar: TargetBar = createTargetBar(root);
  const floating: FloatingNumbers = createFloatingNumbers(numberLayer, camera);

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
    element.className = ground.find === null ? 'loot-label' : 'loot-label find';
    const inner: HTMLSpanElement = document.createElement('span');
    const arrow: HTMLElement = document.createElement('i');
    arrow.className = 'loot-arrow';
    inner.textContent = ground.find === null ? itemName(world.content, ground.content.item) : hooks.findLabel;
    if (ground.find === null) inner.style.color = rarityOf(world.content, ground.content.item).color;
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
    const lifts: Map<string, number> = new Map<string, number>();
    for (const marked of zonePlaces(world.content, world.zone)) if (marked.kind.label > 0) lifts.set(placeKey(marked.ref), marked.kind.label);
    exits = world.zone.exits.map((exit): ExitLabel => {
      const element: HTMLDivElement = document.createElement('div');
      element.className = world.zone.kind === 'void' ? 'exit-label distant' : 'exit-label';
      const inner: HTMLSpanElement = document.createElement('span');
      inner.textContent = world.content.zones.get(exit.to)?.name ?? exit.to;
      const pin: HTMLElement = document.createElement('i');
      pin.textContent = OVERLAYS.pinGlyph;
      inner.append(pin);
      element.append(inner);
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTravel(exit.id);
      });
      labelLayer.append(element);
      return { element, id: exit.id, x: exit.x, z: exit.z, open: (current: World): boolean => allHold(current, exit.requires), secret: exit.hiddenWhenLocked, lift: lifts.get(placeKey({ type: 'exit', exit: exit.id })) ?? OVERLAYS.exitLift, glide: createGlide(), stack: createGlide(), pinned: false };
    });
    world.zone.props.forEach((placed, index: number): void => {
      const name: string | null = world.content.props.get(placed.prop)?.label ?? null;
      if (name === null) return;
      const element: HTMLDivElement = document.createElement('div');
      element.className = 'exit-label station';
      const inner: HTMLSpanElement = document.createElement('span');
      inner.textContent = name;
      element.append(inner);
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onUse(index);
      });
      labelLayer.append(element);
      exits.push({ element, id: `${OVERLAYS.stationId}${index}`, x: placed.x, z: placed.z, open: (current: World): boolean => stationAt(current, index) !== null, secret: true, lift: OVERLAYS.exitLift, glide: createGlide(), stack: createGlide(), pinned: false });
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
    exits.push({ element, id: OVERLAYS.waypointId, x: waypoint.x, z: waypoint.z, open: (current: World): boolean => current.waypoints.includes(current.zone.id), secret: false, lift: lifts.get(placeKey({ type: 'waypoint' })) ?? OVERLAYS.exitLift, glide: createGlide(), stack: createGlide(), pinned: false });
  };

  const showPeople = (world: World): void => {
    const sameZone: boolean = peopleZone === world.zone;
    if (!sameZone) {
      for (const label of leaving) label.element.remove();
      leaving = [];
      labelHovered = null;
    }
    for (const label of people) {
      if (world.npcs.includes(label.npc)) continue;
      if (!sameZone) {
        label.element.remove();
        continue;
      }
      label.element.classList.add('leaving');
      leaving.push({ element: label.element, x: label.npc.pos.x, y: floorUp(label.npc.pos.x, hooks.labelRiseOf(label.npc.id, 0), label.npc.pos.z), z: label.npc.pos.z, left: OVERLAYS.npcLeave, glide: label.glide });
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
      const pin: HTMLElement = document.createElement('i');
      pin.textContent = OVERLAYS.pinGlyph;
      const name: HTMLElement = document.createElement('b');
      name.textContent = npc.def.name;
      const mark: HTMLElement = document.createElement('em');
      mark.textContent = OVERLAYS.pinGlyph;
      mark.setAttribute('aria-hidden', 'true');
      name.append(mark);
      const title: HTMLElement = document.createElement('small');
      title.textContent = shownTitle(npc.def);
      inner.append(pin, name, title);
      element.append(inner);
      element.addEventListener('pointerenter', (): void => {
        labelHovered = { id: npc.id, element };
      });
      element.addEventListener('pointerleave', (): void => {
        if (labelHovered?.element === element) labelHovered = null;
      });
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTalk(npc.id);
      });
      labelLayer.append(element);
      return { element, npc, pinned: null, upgrade: null, glide: createGlide(), stack: createGlide() };
    });
  };

  return {
    itemNames,
    aimItem(groundId: number | null): void {
      if (groundId === aimedItem) return;
      aimedItem = groundId;
      for (const [id, label] of labels) label.element.classList.toggle('aimed', id === groundId);
    },
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
            if (event.amount === 0 && event.targetTeam === 'monster') break;
            const y: number = floorUp(event.pos.x, hooks.heightOf(event.targetId) * OVERLAYS.numberHeight, event.pos.z);
            const kind: NumberKind = event.burn ? 'burn' : event.targetId === world.player.id ? 'hurt' : event.crit ? 'crit' : 'plain';
            floating.show({ amount: event.amount, kind, key: event.targetId, x: event.pos.x, y, z: event.pos.z });
            break;
          }
          case 'heal': {
            const y: number = floorUp(event.pos.x, hooks.heightOf(event.targetId) * OVERLAYS.numberHeight, event.pos.z);
            floating.show({ amount: Math.max(1, Math.round(event.amount)), kind: 'heal', key: event.targetId, x: event.pos.x, y, z: event.pos.z });
            break;
          }
          case 'drop':
            labelFor(world, event.ground);
            break;
          case 'chest_opened':
          case 'cache_opened':
            if (event.gold > 0) floating.show({ amount: event.gold, kind: 'gold', key: null, x: event.pos.x, y: OVERLAYS.chestHeight, z: event.pos.z });
            break;
          case 'pickup': {
            const label: LootLabel | undefined = labels.get(event.ground.id);
            if (label !== undefined) {
              label.leaving = OVERLAYS.labelExit;
              label.element.classList.add('taken');
            }
            if (event.ground.content.kind === 'gold') floating.show({ amount: event.ground.content.amount, kind: 'gold', key: null, x: event.ground.pos.x, y: OVERLAYS.goldHeight, z: event.ground.pos.z });
            break;
          }
          case 'area':
          case 'chain':
          case 'beam':
          case 'blink':
          case 'burn':
          case 'soak':
          case 'stun':
          case 'mend':
          case 'brand':
          case 'tailwind_rise':
          case 'tailwind_end':
          case 'skill_unlocked':
          case 'chart_point':
          case 'xp':
          case 'skill_start':
          case 'skill_impact':
          case 'hazard':
          case 'guarded':
          case 'skill_interrupt':
          case 'channel_end':
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
          case 'armed':
          case 'notice':
          case 'portal':
          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'unison_look':
          case 'unison_flinch':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'item_found':
          case 'item_identified':
          case 'moment_gone':
          case 'moment_chest':
          case 'run_set':
          case 'run_ended':
          case 'path_marked':
          case 'character_changed':
          case 'zone_changed':
          case 'checkpoint':
          case 'hero_step':
          case 'wake':
          case 'encounter_nearing':
          case 'encounter_shown':
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
          case 'boss_defeated':
          case 'bark':
          case 'scene_lead':
          case 'scene_ward':
          case 'flask_used':
          case 'revive':
          case 'boss_held':
          case 'count_broken':
          case 'piece_unsealed':
          case 'flask_upgraded':
          case 'flasks_refilled':
            break;
        }
      }
    },
    labelHover(): number | null {
      if (labelHovered === null) return null;
      if (labelHovered.element.isConnected && labelHovered.element.matches(':hover')) return labelHovered.id;
      labelHovered = null;
      return null;
    },
    readHud(dt: number): void {
      sinceHudRead += dt;
      if (sinceHudRead < OVERLAYS.hudReadSeconds) return;
      hudRects = blockersIn(root, OVERLAYS.hudBlockers);
      sinceHudRead = 0;
    },
    update(dt: number, world: World, hoveredId: number | null, tags: readonly WorldTag[] = []): void {
      if (exitsOf !== world.zone) showExits(world);
      tagRects.length = 0;
      plateRects.length = 0;
      for (const rect of hudRects) tagRects.push(rect);
      pinnedExits.clear();
      pinnedNpcs.clear();
      for (const pin of questPins(world, targets.objective(world))) {
        switch (pin.kind) {
          case 'exit':
            pinnedExits.add(pin.exit);
            break;
          case 'npc':
            pinnedNpcs.add(pin.npcId);
            break;
        }
      }
      for (const label of exits) {
        const pinned: boolean = pinnedExits.has(label.id);
        if (pinned !== label.pinned) {
          label.pinned = pinned;
          label.element.classList.toggle('pinned', pinned);
        }
        const open: boolean = label.open(world);
        label.element.classList.toggle('locked', !open);
        label.element.classList.toggle('secret', !open && label.secret);
        camera.project(label.x, floorUp(label.x, label.lift, label.z), label.z, point);
        anchor.copy(point);
        const edge: boolean = !anchorInView(point.x, point.y, view);
        label.element.classList.toggle('edge', edge);
        settleTag(label.element, label.glide, label.stack, dt, !edge && (open || !label.secret));
      }
      if (peopleOf !== world.npcs) showPeople(world);
      const upgradeReady: boolean = anyUpgradeReady(world.content, world.player);
      for (const label of people) {
        const pinned: boolean = pinnedNpcs.has(label.npc.id);
        if (pinned !== label.pinned) {
          label.pinned = pinned;
          label.element.classList.toggle('pinned', pinned);
        }
        const upgrade: boolean = upgradeReady && label.npc.def.service === 'vendor';
        if (upgrade !== label.upgrade) {
          label.upgrade = upgrade;
          label.element.classList.toggle('upgrade', upgrade);
        }
        label.element.classList.toggle('aimed', label.npc.id === hoveredId);
        camera.project(label.npc.pos.x, floorUp(label.npc.pos.x, hooks.labelRiseOf(label.npc.id, dt), label.npc.pos.z), label.npc.pos.z, point);
        anchor.copy(point);
        settleTag(label.element, label.glide, label.stack, dt, true);
      }
      for (const tag of tags) {
        camera.project(tag.x, tag.y, tag.z, point);
        anchor.copy(point);
        settleTag(tag.element, tag.glide, tag.stack, dt, tag.shown && (tag.edge || anchorInView(point.x, point.y, view)));
      }
      stackTags(dt);
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

      floating.update(dt);

      healthBars.update(dt, world, (actorId: number): number => hooks.heightOf(actorId));
      targetBar.update(dt, world, hoveredId);

      seenZone = world.zone;
      onGround.clear();
      for (const ground of world.ground) onGround.add(ground);
      tip.check((id: number): TipCheck => {
        const label: LootLabel | undefined = labels.get(id);
        const under: Element | null = document.elementFromPoint(pointer.x, pointer.y);
        return {
          present: label !== undefined && onGround.has(label.ground),
          leaving: label === undefined || label.leaving >= 0,
          sameZone: tipZone === world.zone,
          underPointer: label !== undefined && under !== null && label.element.contains(under),
        };
      });
      for (const ground of world.ground) labelFor(world, ground);
      lootBlockers.length = 0;
      for (const rect of hudRects) lootBlockers.push(rect);
      for (const rect of plateRects) lootBlockers.push(rect);
      boxes.length = 0;
      settled.length = 0;
      items.clear();
      moved.clear();
      const all: boolean = itemNames.shown();
      for (const [id, label] of labels) {
        if (label.leaving >= 0) {
          label.leaving -= dt;
          if (label.leaving <= 0) {
            label.element.remove();
            labels.delete(id);
            continue;
          }
        } else if (!onGround.has(label.ground)) {
          label.leaving = OVERLAYS.labelExit;
          label.element.classList.add('taken');
        }
        const near: boolean = squaredDistance(label.ground.pos.x - world.player.pos.x, label.ground.pos.z - world.player.pos.z) <= OVERLAYS.labelNear * OVERLAYS.labelNear;
        camera.project(label.ground.pos.x, floorUp(label.ground.pos.x, label.ground.find === null ? OVERLAYS.labelLift : OVERLAYS.findLift, label.ground.pos.z), label.ground.pos.z, point);
        const shown: boolean = lootShown({ all, near, find: label.ground.find !== null, rank: label.rank, shownRank: OVERLAYS.labelShownRank, inView: anchorInView(point.x, point.y, view) });
        if (shown !== label.shown) {
          label.shown = shown;
          label.element.classList.toggle('dim', !shown);
        }
        const inner: Element | null = label.element.firstElementChild;
        const size: TagSize | null = inner instanceof HTMLElement ? tagSizes.size(inner) : null;
        if (size !== null && size.width > 0) {
          label.width = size.width;
          label.height = size.height;
        }
        if (shown) {
          const first: TagPlace = placeTag(point.x, point.y, label.width, label.height, view, lootBlockers);
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
      const folding: Folding = foldPiles(pilesFold(all) ? settled : [], OVERLAYS.pileReach, OVERLAYS.pileKeep);
      for (const [id, label] of labels) foldLabel(label, folding.folded.has(id), folding.more.get(id) ?? 0);
      const spots: Map<number, LabelSpot> = settleLabels(boxes.filter((box: RankedBox): boolean => !folding.folded.has(box.id)), OVERLAYS.labelGap, view, lootBlockers);
      for (const box of boxes) {
        const label: LootLabel | undefined = labels.get(box.id);
        const item: ItemPoint | undefined = items.get(box.id);
        if (label === undefined || item === undefined) continue;
        const target: LabelSpot = spots.get(box.id) ?? box;
        anchor.set(item.x, item.y);
        point.set(target.x, target.y);
        glidePlace(label.element, label.glide, anchor, point, dt);
        const spot: TagPlace = { x: point.x, y: point.y, away: Math.abs(target.x - box.x) > LABEL_EDGE.awayDistance || target.y - box.y > LABEL_EDGE.awayDistance, turn: Math.atan2(item.y - (point.y - box.height / 2), item.x - point.x) };
        const away: boolean = spot.away || moved.has(box.id);
        label.element.classList.toggle('away', away);
        if (away) {
          const reach: number = Math.min(box.width / 2 / Math.max(OVERLAYS.arrowFloor, Math.abs(Math.cos(spot.turn))), box.height / 2 / Math.max(OVERLAYS.arrowFloor, Math.abs(Math.sin(spot.turn))));
          label.element.style.setProperty('--tag-turn', `${spot.turn.toFixed(3)}rad`);
          label.element.style.setProperty('--tag-reach', `${(reach + OVERLAYS.arrowGap).toFixed(1)}px`);
          label.element.style.setProperty('--tag-mid', `${(-box.height / 2).toFixed(1)}px`);
        }
      }
      panelCover.cover();

    },
  };
}

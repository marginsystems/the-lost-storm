import { actOf } from '../../sim/content/atlas.ts';
import type { ActDef, AtlasRoad, MapPlace, ZoneDef } from '../../sim/content/types.ts';
import { placeState, roadState, zoneMark } from '../../sim/world/atlas.ts';
import type { PlaceState, RoadState, ZoneMark } from '../../sim/world/atlas.ts';
import type { World } from '../../sim/world/types.ts';
import { canTeleport, onWaypoint } from '../../sim/world/waypoints.ts';
import { drawAtlasArt } from './atlas-art.ts';
import { smoothPath } from './atlas-geometry.ts';
import { drawNode, NODE } from './atlas-nodes.ts';
import type { NodeParts } from './atlas-nodes.ts';
import { atRest, clampView, openView, panBy, pinchTo, settleView, stepMotion, still, toScreen, zoomAt } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, Pinch, ScreenPoint } from './atlas-view.ts';
import { ATLAS_VIEW } from './atlas-view.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import { svg } from './svg.ts';

const MAP = {
  fogRadius: 235,
  dragThreshold: 5,
  wheelLine: 16,
  velocityBlend: 0.35,
  tipGap: 10,
  legendSize: 44,
  unknownName: 'Unknown',
  hintAway: 'Stand on a waypoint to travel',
  hintReady: 'Choose a lit waypoint to travel',
  hintNone: 'No other waypoint found yet',
  ids: { fog: 'atlas-fog-mask', clear: 'atlas-fog-clear', grain: 'atlas-grain' },
  markNames: { town: 'Town', wild: 'Wilds', boss: 'Boss lair' },
  stateNames: { here: 'You are here', travel: 'Travel here', found: 'Waypoint found', unfound: 'Waypoint not yet found', none: 'No waypoint', reachable: 'Unexplored', locked: 'The way is barred', unknown: 'Undiscovered' },
} as const;

const PLACE_STATES: readonly PlaceState[] = ['here', 'visited', 'reachable', 'locked', 'unknown'];
const ROAD_STATES: readonly RoadState[] = ['open', 'locked', 'hidden'];
const LEGEND: readonly { readonly mark: ZoneMark; readonly waypoint: boolean; readonly state: string; readonly text: string }[] = [
  { mark: 'town', waypoint: false, state: 'visited', text: 'Town' },
  { mark: 'wild', waypoint: false, state: 'visited', text: 'Wilds' },
  { mark: 'boss', waypoint: false, state: 'visited', text: 'Boss lair' },
  { mark: 'wild', waypoint: true, state: 'visited found', text: 'Waypoint' },
  { mark: 'wild', waypoint: false, state: 'here', text: 'You are here' },
  { mark: 'wild', waypoint: false, state: 'reachable', text: 'Unexplored' },
];

interface NodeView {
  readonly zone: ZoneDef;
  readonly place: MapPlace;
  readonly mark: ZoneMark;
  readonly parts: NodeParts;
  readonly clear: SVGCircleElement;
  state: PlaceState | null;
}

interface RoadView {
  readonly road: AtlasRoad;
  readonly group: SVGGElement;
  state: RoadState | null;
}

interface ActView {
  readonly act: ActDef;
  readonly nodes: readonly NodeView[];
  readonly roads: readonly RoadView[];
}

interface Drag {
  readonly pressed: NodeView | null;
  x: number;
  y: number;
  travelled: number;
  time: number;
  vx: number;
  vy: number;
}

export interface MapPanel extends PanelView {
  update(dt: number): void;
}

function retriggerSvg(node: SVGElement, className: string): void {
  node.classList.remove(className);
  node.getBoundingClientRect();
  node.classList.add(className);
}

function setState<T extends string>(node: Element, states: readonly T[], state: T): void {
  for (const each of states) node.classList.toggle(each, each === state);
}

export function createMapPanel(parent: HTMLElement, context: HudContext, close: () => void): MapPanel {
  const world: World = context.api.world;
  const element: HTMLDivElement = el('div', 'atlas', parent);
  const chart: SVGSVGElement = svg('svg', 'atlas-chart', element, {});
  const defs: SVGDefsElement = svg('defs', '', chart, {});
  const sheet: SVGGElement = svg('g', 'atlas-sheet', chart, {});
  el('div', 'atlas-vignette', element);
  const head: HTMLDivElement = el('div', 'atlas-head', element);
  const actTitle: HTMLDivElement = label('atlas-act', '', head);
  const actName: HTMLDivElement = label('atlas-title', '', head);
  const hint: HTMLDivElement = el('div', 'atlas-hint', head);
  const legend: HTMLDivElement = el('div', 'atlas-legend', element);
  for (const entry of LEGEND) {
    const row: HTMLDivElement = el('div', 'atlas-key', legend);
    const icon: SVGSVGElement = svg('svg', '', row, { viewBox: `${-MAP.legendSize / 2} ${-MAP.legendSize / 2} ${MAP.legendSize} ${MAP.legendSize}` });
    drawNode(icon, entry.mark, entry.waypoint, 0, 0).group.setAttribute('class', `atlas-node ${entry.mark} ${entry.state}`);
    label('', entry.text, row);
  }
  const tip: HTMLDivElement = el('div', 'atlas-tip', element);
  const tipName: HTMLDivElement = el('div', 'atlas-tip-name', tip);
  const tipMeta: HTMLDivElement = el('div', 'atlas-tip-meta', tip);
  const tipState: HTMLDivElement = el('div', 'atlas-tip-state', tip);

  let view: ActView | null = null;
  let frame: AtlasFrame = { width: 1, height: 1, mapWidth: 1, mapHeight: 1 };
  let target: AtlasView = { x: 0, y: 0, scale: 1 };
  let motion: AtlasMotion = still(target);
  let drawn: string = '';
  let drag: Drag | null = null;
  let hovered: NodeView | null = null;
  const fingers: Map<number, ScreenPoint> = new Map<number, ScreenPoint>();
  let pinch: Pinch | null = null;

  const build = (act: ActDef): ActView => {
    defs.replaceChildren();
    sheet.replaceChildren();
    drawAtlasArt(act.atlas, sheet, defs, MAP.ids.grain);
    const gradient: SVGRadialGradientElement = svg('radialGradient', '', defs, { id: MAP.ids.clear });
    svg('stop', '', gradient, { offset: 0.25, 'stop-color': '#000', 'stop-opacity': 1 });
    svg('stop', '', gradient, { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 });
    const mask: SVGMaskElement = svg('mask', '', defs, { id: MAP.ids.fog, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: act.atlas.width, height: act.atlas.height });
    svg('rect', '', mask, { x: 0, y: 0, width: act.atlas.width, height: act.atlas.height, fill: '#fff' });
    const roadLayer: SVGGElement = svg('g', 'atlas-roads', sheet, {});
    svg('rect', 'atlas-fog', sheet, { x: 0, y: 0, width: act.atlas.width, height: act.atlas.height, mask: `url(#${MAP.ids.fog})` });
    const nodeLayer: SVGGElement = svg('g', 'atlas-nodes', sheet, {});
    const placeOf = (zoneId: string): MapPlace | undefined => act.atlas.places.find((place: MapPlace): boolean => place.zone === zoneId);
    const roads: RoadView[] = [];
    for (const road of act.atlas.roads) {
      const from: MapPlace | undefined = placeOf(road.from);
      const to: MapPlace | undefined = placeOf(road.to);
      if (from === undefined || to === undefined) continue;
      const shape: string = smoothPath([from, ...road.via, to], false);
      const group: SVGGElement = svg('g', 'atlas-road', roadLayer, {});
      svg('path', 'atlas-road-bed', group, { d: shape });
      svg('path', 'atlas-road-line', group, { d: shape });
      roads.push({ road, group, state: null });
    }
    const nodes: NodeView[] = [];
    for (const place of act.atlas.places) {
      const zone: ZoneDef | undefined = world.content.zones.get(place.zone);
      if (zone === undefined) continue;
      const mark: ZoneMark = zoneMark(world.content, zone);
      const clear: SVGCircleElement = svg('circle', 'atlas-clear', mask, { cx: place.x, cy: place.y, r: MAP.fogRadius, fill: `url(#${MAP.ids.clear})` });
      nodes.push({ zone, place, mark, parts: drawNode(nodeLayer, mark, zone.waypoint !== null, place.x, place.y), clear, state: null });
    }
    setText(actTitle, act.title, false);
    setText(actName, act.name, false);
    return { act, nodes, roads };
  };

  const measure = (): void => {
    if (view === null) return;
    frame = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), mapWidth: view.act.atlas.width, mapHeight: view.act.atlas.height };
  };

  const describe = (node: NodeView): void => {
    const state: PlaceState = placeState(world, node.zone.id);
    const known: boolean = state === 'here' || state === 'visited';
    setText(tipName, known ? node.zone.name : MAP.unknownName, false);
    setText(tipMeta, known ? `${MAP.markNames[node.mark]} · Level ${node.zone.level}` : '', false);
    tipMeta.classList.toggle('empty', !known);
    let line: string = MAP.stateNames.unknown;
    if (state === 'here') line = MAP.stateNames.here;
    else if (state === 'reachable') line = MAP.stateNames.reachable;
    else if (state === 'locked') line = MAP.stateNames.locked;
    else if (state === 'visited') {
      if (canTeleport(world, node.zone.id)) line = MAP.stateNames.travel;
      else if (node.zone.waypoint === null) line = MAP.stateNames.none;
      else line = world.waypoints.includes(node.zone.id) ? MAP.stateNames.found : MAP.stateNames.unfound;
    }
    setText(tipState, line, false);
  };

  const placeTip = (): void => {
    if (hovered === null) return;
    const at: ScreenPoint = toScreen(motion.view, frame, hovered.place);
    const reach: number = (hovered.parts.radius + NODE.wayGap) * motion.view.scale + MAP.tipGap;
    const left: boolean = at.x + reach + tip.offsetWidth > frame.width;
    tip.style.transform = `translate(${Math.round(left ? at.x - reach - tip.offsetWidth : at.x + reach)}px, ${Math.round(at.y - tip.offsetHeight / 2)}px)`;
  };

  const hover = (node: NodeView | null): void => {
    if (node === hovered) return;
    hovered = node;
    tip.classList.toggle('visible', node !== null);
    if (node === null) return;
    describe(node);
    placeTip();
  };

  const apply = (): void => {
    const { x, y, scale } = motion.view;
    const next: string = `translate(${(frame.width / 2 - x * scale).toFixed(2)} ${(frame.height / 2 - y * scale).toFixed(2)}) scale(${scale.toFixed(4)})`;
    if (next === drawn) return;
    drawn = next;
    sheet.setAttribute('transform', next);
    placeTip();
  };

  const sync = (): void => {
    if (view === null) return;
    const standing: boolean = onWaypoint(world);
    let reachable: number = 0;
    for (const node of view.nodes) {
      const state: PlaceState = placeState(world, node.zone.id);
      const travel: boolean = canTeleport(world, node.zone.id);
      if (travel) reachable += 1;
      node.parts.group.classList.toggle('travel', travel);
      node.parts.group.classList.toggle('found', world.waypoints.includes(node.zone.id));
      if (state === node.state) continue;
      node.state = state;
      setState(node.parts.group, PLACE_STATES, state);
      setState(node.clear, PLACE_STATES, state);
      const name: string = state === 'here' || state === 'visited' ? node.zone.name : state === 'unknown' ? '' : MAP.unknownName;
      if (node.parts.name.textContent !== name) {
        node.parts.name.textContent = name;
        retriggerSvg(node.parts.name, 'tick');
      }
    }
    for (const road of view.roads) {
      const state: RoadState = roadState(world, road.road);
      if (state === road.state) continue;
      road.state = state;
      setState(road.group, ROAD_STATES, state);
    }
    element.classList.toggle('travel', standing);
    setText(hint, !standing ? MAP.hintAway : reachable > 0 ? MAP.hintReady : MAP.hintNone, true);
    if (hovered !== null) describe(hovered);
  };

  const nodeAt = (under: EventTarget | null): NodeView | null => {
    if (!(under instanceof Element) || view === null) return null;
    const group: Element | null = under.closest('.atlas-node');
    return view.nodes.find((node: NodeView): boolean => node.parts.group === group) ?? null;
  };

  const local = (event: MouseEvent): ScreenPoint => {
    const box: DOMRect = element.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const fingerPinch = (): Pinch | null => {
    const [a, b] = [...fingers.values()];
    if (a === undefined || b === undefined) return null;
    const box: DOMRect = element.getBoundingClientRect();
    return { a: { x: a.x - box.left, y: a.y - box.top }, b: { x: b.x - box.left, y: b.y - box.top } };
  };

  const endDrag = (): void => {
    drag = null;
    element.classList.remove('dragging');
  };

  element.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size >= 2) {
      endDrag();
      hover(null);
      pinch = fingerPinch();
      return;
    }
    drag = { pressed: nodeAt(event.target), x: event.clientX, y: event.clientY, travelled: 0, time: event.timeStamp, vx: 0, vy: 0 };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', (event: PointerEvent): void => {
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch !== null) {
      const next: Pinch | null = fingerPinch();
      if (next === null) return;
      target = pinchTo(target, frame, pinch, next);
      motion = still(pinchTo(motion.view, frame, pinch, next));
      pinch = next;
      apply();
      return;
    }
    if (drag === null) {
      hover(nodeAt(event.target));
      return;
    }
    const dx: number = event.clientX - drag.x;
    const dy: number = event.clientY - drag.y;
    const seconds: number = Math.max(ATLAS_VIEW.maxStep, (event.timeStamp - drag.time) / 1000);
    drag.travelled += Math.hypot(dx, dy);
    drag.vx += (dx / seconds - drag.vx) * MAP.velocityBlend;
    drag.vy += (dy / seconds - drag.vy) * MAP.velocityBlend;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = event.timeStamp;
    if (drag.travelled < MAP.dragThreshold) return;
    element.classList.add('dragging');
    hover(null);
    target = panBy(target, frame, dx, dy);
    motion = { ...motion, view: panBy(motion.view, frame, dx, dy) };
    apply();
  });
  const release = (event: PointerEvent): void => {
    fingers.delete(event.pointerId);
    if (pinch !== null) {
      pinch = fingerPinch();
      const [left] = [...fingers.values()];
      if (pinch === null && left !== undefined) drag = { pressed: null, x: left.x, y: left.y, travelled: MAP.dragThreshold, time: event.timeStamp, vx: 0, vy: 0 };
      return;
    }
    if (drag === null) return;
    const ended: Drag = drag;
    endDrag();
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (ended.travelled >= MAP.dragThreshold) {
      target = panBy(target, frame, ended.vx * ATLAS_VIEW.flingSeconds, ended.vy * ATLAS_VIEW.flingSeconds);
      return;
    }
    if (event.type !== 'pointerup' || ended.pressed === null || !canTeleport(world, ended.pressed.zone.id)) return;
    context.api.playUi('click');
    context.api.send({ type: 'teleport', zone: ended.pressed.zone.id });
    close();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('pointerleave', (): void => {
    if (drag === null) hover(null);
  });
  element.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      target = zoomAt(target, frame, local(event), event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * MAP.wheelLine : event.deltaY);
    },
    { passive: false },
  );
  new ResizeObserver((): void => {
    measure();
    target = clampView(target, frame);
    motion = still(clampView(motion.view, frame));
    apply();
  }).observe(element);

  const refresh = (): void => {
    fingers.clear();
    endDrag();
    pinch = null;
    const act: ActDef | undefined = actOf(world.content, world.zone.id);
    if (act === undefined) return;
    if (view?.act !== act) view = build(act);
    measure();
    const here: MapPlace | undefined = act.atlas.places.find((place: MapPlace): boolean => place.zone === world.zone.id);
    target = openView(frame, here?.x ?? act.atlas.width / 2, here?.y ?? act.atlas.height / 2);
    motion = still(settleView(target, frame));
    hover(null);
    sync();
    apply();
  };

  return {
    element,
    refresh,
    update(dt: number): void {
      sync();
      if (atRest(motion, target)) return;
      motion = stepMotion(motion, target, dt);
      apply();
    },
  };
}

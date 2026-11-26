import type { ChartPath, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { refundBlock, refundCost, refundState, respecCost, respecState } from '../../sim/progression.ts';
import type { ChartChange } from '../../sim/progression.ts';
import { ATLAS_VIEW, atRest, stepMotion, still, toMap, toScreen } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, ScreenPoint } from './atlas-view.ts';
import { abilityCard } from './chart-ability.ts';
import { createChartSky } from './chart-sky.ts';
import type { ChartSky, SkyArm } from './chart-sky.ts';
import { armShape, hexColour } from './chart-storm.ts';
import type { AbilityCard } from './chart-ability.ts';
import { chartBounds, chartHere, chartRoute, pathLabels, placeTint } from './chart-model.ts';
import { FRESH_RASTER, stepRaster } from './chart-raster.ts';
import type { RasterState, RasterStep } from './chart-raster.ts';
import { writeView } from './chart-frame.ts';
import type { FrameTargets } from './chart-frame.ts';
import { createFrameTargets, createNameView } from './chart-label.ts';
import { createSpecialtyNames, markSpecialtyNames, placeHome, specialtyLine } from './tree-specialty.ts';
import type { SpecialtyName } from './tree-specialty.ts';
import { kindWord, reachable } from './chart-parts.ts';
import { createChangeSegment } from './change-segment.ts';
import type { ChangeSegment } from './change-segment.ts';
import { placeOff } from './place-off.ts';
import { familyRow, needLine, pathFamily, placeFamily, placeWeaponLine } from './weapon-family.ts';
import type { PlaceOff } from './place-off.ts';
import { changesShape, placeChanges } from './skill-changes.ts';
import type { SkillChanges } from './skill-changes.ts';
import type { Drag } from './chart-parts.ts';
import type { NameView } from './chart-label.ts';
import { captionFoot, CHART_VIEW, clampChart, easeFoot, frameChart, panChart, reopenChart, sameFrame, zoomChart } from './chart-view.ts';
import type { LabelBox } from './chart-view.ts';
import type { ChartBounds, ChartPoint, PathLabel } from './chart-model.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { slotAction } from '../settings/bindings.ts';
import { cardSpot, nodeAt, nodeDiameter, nodeFace, TREE_NODES } from './tree-nodes.ts';
import type { OverviewPlace } from './chart-overview.ts';
import { buildTreeLinks } from './tree-links.ts';
import type { LinkView, TreeLinks } from './tree-links.ts';
import { wireTreeSearch } from './tree-search.ts';
import type { SearchPlace } from './tree-search.ts';
import { createTreeFar } from './tree-far.ts';
import type { FarChange, TreeFar } from './tree-far.ts';
import { createSocket, createTreeIcons } from './tree-sockets.ts';
import type { TreeIcons } from './tree-sockets.ts';
import type { CardSize, CardSpot, NodeSpot } from './tree-nodes.ts';
import { lockedLine, pointsPrompt, statusLine, takenLine, TREE_NODE_COST, treeNodeStatus } from './tree-status.ts';
import type { TreeNodeStatus } from './tree-status.ts';
import { cardNode, CLOSED_CARD, glidesFrom, HIDDEN_PRESENCE, stepCard, stepPresence, viewIsMoving } from './tree-card.ts';
import type { CardEvent, CardPresence, CardState, CardWish } from './tree-card.ts';
import { createTreeHead } from './tree-head.ts';
import type { TreeHead } from './tree-head.ts';

const CHART = {
  unit: TREE_NODES.unit,
  margin: 4,
  dragThreshold: 5,
  velocityBlend: 0.35,
  wheelLine: 32,
  zoomStep: 360,
  findZoom: 1.2,
  hitFloor: 6,
  confirmMs: 3200,
  cardGap: 12,
  cardEdge: 10,
  warmFrames: 3,
  svgNamespace: 'http://www.w3.org/2000/svg',
  emptyLine: 'No points yet. Moments in the storm and each new level bring them.',
} as const;

const STATUS_CLASSES: readonly TreeNodeStatus['kind'][] = ['allocated', 'available', 'no_points', 'locked', 'closed'];

export interface ChartPanel extends PanelView {
  update(dt: number): void;
  warm(): boolean;
}

interface NodeView {
  readonly def: SkillTreeNodeDef;
  readonly button: HTMLButtonElement;
}

export function createTreePanel(parent: HTMLElement, context: HudContext, close: () => void): ChartPanel {
  const content = context.api.world.content;
  const element: HTMLDivElement = el('div', 'hud-panel left tree-panel', parent);
  const { points, pointCount, pointWord, search, zoomOut, zoomIn, recentre, restart }: TreeHead = createTreeHead(element, content.chart.title, close);

  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  const bounds: ChartBounds = chartBounds(nodes);
  const mapWidth: number = (bounds.right - bounds.left + CHART.margin * 2) * CHART.unit;
  const mapHeight: number = (bounds.bottom - bounds.top + CHART.margin * 2) * CHART.unit;
  const place = (point: ChartPoint): ChartPoint => ({ x: (point.x - bounds.left + CHART.margin) * CHART.unit, y: (point.y - bounds.top + CHART.margin) * CHART.unit });
  const centreOf = (node: SkillTreeNodeDef): ChartPoint => place({ x: node.column, y: node.row });
  const eye: ChartPoint = place({ x: 0, y: 0 });

  const viewport: HTMLDivElement = el('div', 'tree-viewport', element);
  const board: HTMLDivElement = el('div', 'tree-board', viewport);
  board.style.width = `${mapWidth}px`;
  board.style.height = `${mapHeight}px`;
  const svg: SVGSVGElement = document.createElementNS(CHART.svgNamespace, 'svg');
  svg.setAttribute('class', 'tree-links');
  svg.setAttribute('viewBox', `0 0 ${mapWidth} ${mapHeight}`);
  board.appendChild(svg);

  const sky: ChartSky | null = createChartSky(viewport, {
    eyeX: eye.x,
    eyeY: eye.y,
    unit: CHART.unit,
    twist: content.chart.twist,
    arms: content.chart.paths.map((arm: ChartPath): SkyArm => ({ shape: armShape(content, arm.id), tint: hexColour(arm.tint) })),
  });

  const byId: ReadonlyMap<string, SkillTreeNodeDef> = new Map<string, SkillTreeNodeDef>(nodes.map((node: SkillTreeNodeDef): [string, SkillTreeNodeDef] => [node.id, node]));
  const builtLinks: TreeLinks = buildTreeLinks(svg, content, centreOf, eye, CHART.unit);
  const links: readonly LinkView[] = builtLinks.views;
  const treeFar: TreeFar = createTreeFar(
    viewport,
    board,
    nodes.map((node: SkillTreeNodeDef): OverviewPlace => ({ id: node.id, ...centreOf(node), radius: nodeFace(node) / 2, tint: placeTint(content, node) })),
    builtLinks.far,
  );

  const specialtyNames: readonly SpecialtyName[] = createSpecialtyNames(content, viewport, place);
  const names: NameView[] = [...pathLabels(content).map((entry: PathLabel): NameView => createNameView(viewport, entry.path.name, entry.path.tint, place(entry.at), pathFamily(content, entry.path.id))), ...specialtyNames.map((entry: SpecialtyName): NameView => entry.view)];
  const prompt: HTMLDivElement = el('div', 'chart-prompt', viewport);
  const card: HTMLDivElement = el('div', 'chart-card', viewport);
  const cardBody: HTMLDivElement = el('div', 'chart-card-body', card);
  const action: HTMLButtonElement = el('button', 'chart-action', card);
  action.type = 'button';
  card.classList.toggle('touch', context.api.touch);

  const player = (): PlayerState => context.api.world.player;
  const statusOf = (node: SkillTreeNodeDef): TreeNodeStatus => treeNodeStatus(content, player().allocated, player().skillPoints, node);
  const goldFor = (count: number): number => refundCost(content, player().level, count);

  let cardState: CardState = CLOSED_CARD;
  let presence: CardPresence = HIDDEN_PRESENCE;
  let hiddenAt: number = Number.NEGATIVE_INFINITY;
  let movedAt: number = Number.NEGATIVE_INFINITY;
  let shownCard: string = '';
  let segments: readonly ChangeSegment[] = [];
  let pinnedButton: HTMLButtonElement | null = null;
  const cardView = (): NodeView | null => {
    return presence.node === null ? null : (viewOf.get(presence.node) ?? null);
  };
  const wish = (): CardWish => ({ now: performance.now(), open: cardState.open, wanted: cardNode(cardState), movedAt });

  const costLine = (node: SkillTreeNodeDef, status: TreeNodeStatus): string => {
    if (status.kind === 'allocated') return takenLine(refundBlock(content, player().allocated, node.id));
    const steps: number = chartRoute(content, player().allocated, node.id).length;
    if (status.kind === 'available') return `${statusLine(status, context.api.touch)} · ${TREE_NODE_COST} point`;
    if (status.kind === 'no_points') return `Needs ${TREE_NODE_COST} point · you have none`;
    return lockedLine(status, steps, context.api.touch);
  };

  const showRoute = (target: string | null): void => {
    const route: ReadonlySet<string> = new Set<string>(target === null ? [] : chartRoute(content, player().allocated, target));
    const taken: readonly string[] = player().allocated;
    viewport.classList.toggle('routing', route.size > 0);
    for (const view of views) view.button.classList.toggle('route', route.has(view.def.id));
    treeFar.route(route);
    for (const link of links) {
      const onRoute: boolean = (route.has(link.from) || taken.includes(link.from)) && (route.has(link.to) || taken.includes(link.to)) && (route.has(link.from) || route.has(link.to));
      link.track.classList.toggle('route', onRoute);
    }
  };

  const fillCard = (): void => {
    const before: CardPresence = presence;
    const asked: CardWish = wish();
    presence = stepPresence(before, asked);
    const view: NodeView | null = cardView();
    if (before.visible && !presence.visible) hiddenAt = asked.now;
    card.classList.toggle('gliding', glidesFrom(before, hiddenAt, asked.now, asked.movedAt));
    card.classList.toggle('visible', presence.visible);
    if (view === null || !presence.visible) {
      if (view === null) shownCard = '';
      showRoute(null);
      return;
    }
    const node: SkillTreeNodeDef = view.def;
    const status: TreeNodeStatus = statusOf(node);
    const refund: ChartChange = refundState(content, player(), node.id);
    const refundable: boolean = status.kind === 'allocated' && refund !== 'not_allowed';
    const ability: AbilityCard | null = abilityCard(content, node, player().bar);
    const off: PlaceOff | null = placeOff(content, node, player().equipped);
    const changes: readonly SkillChanges[] = placeChanges(content, player(), node);
    const key: string = `${node.id}:${status.kind}:${refundable ? goldFor(1) : -1}:${player().skillPoints}:${ability?.slot ?? -1}:${off?.holding ?? ''}:${changesShape(changes)}`;
    showRoute(node.id);
    card.style.setProperty('--tint', placeTint(content, node));
    action.classList.toggle('shown', refundable);
    if (refundable) setText(action, `${context.api.touch ? 'Give back' : 'Right-click to give back'} · ${goldFor(1)} gold`, false);
    action.classList.toggle('short', refundable && refund === 'no_gold');
    if (key === shownCard) {
      changes.forEach((entry: SkillChanges, index: number): void => segments[index]?.refresh(entry));
      measureCard();
      placeCard();
      return;
    }
    shownCard = key;
    const body: HTMLDivElement = el('div', before.visible ? 'chart-card-inner refill' : 'chart-card-inner', null);
    label('chart-card-path', `${placeHome(content, node)} · ${kindWord(node)}`, body);
    const specialtyNote: string | null = specialtyLine(content, node);
    if (specialtyNote !== null) label('tree-tip-specialty', specialtyNote, body);
    const family: WeaponGroup | null = placeFamily(content, node);
    if (family !== null) familyRow(family, off === null ? 'chart-card-family' : 'chart-card-family unheld', needLine(family), body);
    else if (node.weapon !== null) label('chart-card-family', placeWeaponLine(content, node), body);
    label('tree-tip-name', node.name, body);
    if (ability !== null) label('chart-card-tags', ability.tags, body);
    label('tree-tip-effect', node.description, body);
    for (const dropped of off?.lines ?? []) label('tree-tip-off', dropped, body);
    if (ability !== null) label('chart-card-cost', `${ability.cost}${slotWords(ability.slot)}`, body);
    segments = changes.map((entry: SkillChanges): ChangeSegment => createChangeSegment(body, entry, (skill: string, becomes: string): void => context.api.send({ type: 'choose_change', skill, becomes })));
    label(`tree-tip-status ${status.kind}`, costLine(node, status), body);
    if (off !== null) label('tree-tip-off-need', off.need, body);
    if (off !== null) label('tree-tip-holding', off.holding, body);
    cardBody.replaceChildren(body);
    measureCard();
    placeCard();
  };

  const slotWords = (slot: number | null): string => {
    if (slot === null) return ' · bar full';
    return context.api.touch ? ` · slot ${slot + 1}` : ` · on ${context.api.settings.keys().labelOf(slotAction(slot))}`;
  };

  const tickCard = (): void => {
    const next: CardPresence = stepPresence(presence, wish());
    if (next.node !== presence.node || next.visible !== presence.visible) fillCard();
    else presence = next;
  };
  const markMoved = (): void => {
    movedAt = performance.now();
    tickCard();
  };

  const sendCard = (event: CardEvent): void => {
    cardState = stepCard(cardState, event);
    const pinned: HTMLButtonElement | null = cardState.pinned === null ? null : (viewOf.get(cardState.pinned)?.button ?? null);
    if (pinned !== pinnedButton) {
      pinnedButton?.classList.remove('selected');
      pinned?.classList.add('selected');
      pinnedButton = pinned;
    }
    fillCard();
  };
  action.addEventListener('transitionend', (): void => {
    measureCard();
    placeCard();
  });

  const giveBack = (id: string, denied: HTMLElement): void => {
    const state: ChartChange = refundState(content, player(), id);
    if (state === 'no_gold') for (const shown of new Set<HTMLElement>([denied, action])) retrigger(shown, 'deny');
    else if (state !== 'not_allowed') context.api.send({ type: 'refund', node: id });
  };
  action.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const view: NodeView | null = cardView();
    if (view !== null && presence.visible) giveBack(view.def.id, action);
  });

  let confirmUntil: number = 0;
  const restartLabel = (): string => {
    const price: number = respecCost(content, player());
    const cost: string = price === 0 ? 'free' : `${price} gold`;
    return performance.now() < confirmUntil ? `Again to start over · ${cost}` : `Start over · ${cost}`;
  };
  restart.addEventListener('click', (): void => {
    const count: number = player().allocated.length;
    if (count === 0) return;
    if (performance.now() >= confirmUntil) {
      confirmUntil = performance.now() + CHART.confirmMs;
      restart.classList.add('confirm');
      setText(restart, restartLabel(), true);
      return;
    }
    confirmUntil = 0;
    restart.classList.remove('confirm');
    if (respecState(content, player()) === 'no_gold') {
      retrigger(restart, 'deny');
      return;
    }
    context.api.send({ type: 'respec' });
  });

  let frame: AtlasFrame = { width: 1, height: 1, mapWidth, mapHeight };
  let target: AtlasView = { x: mapWidth / 2, y: mapHeight / 2, scale: 1 };
  let foot: number = CHART_VIEW.labelFoot;
  let motion: AtlasMotion = still(target);
  const pointers: Map<number, ScreenPoint> = new Map<number, ScreenPoint>();
  let drag: Drag | null = null;
  let pinch: number = 0;
  let suppressClick: boolean = false;
  let lastView: AtlasView | null = null;
  let raster: RasterState = FRESH_RASTER;
  let warmed: boolean = false;
  let holding: boolean = false;
  let pointerAt: ScreenPoint | null = null;
  let wasMoving: boolean = false;

  let frameDirty: boolean = true;
  let remeasure: boolean = true;
  new ResizeObserver((): void => {
    frameDirty = true;
  }).observe(viewport);
  const measured = (): AtlasFrame => {
    const box: DOMRect = viewport.getBoundingClientRect();
    return { width: Math.max(1, box.width), height: Math.max(1, box.height), mapWidth, mapHeight };
  };
  const onScreen = (spot: NodeSpot): NodeSpot => {
    const at: ScreenPoint = toScreen(motion.view, frame, spot);
    return { id: spot.id, x: at.x, y: at.y, radius: spot.radius * motion.view.scale };
  };
  let cardSize: CardSize = { width: 0, height: 0 };
  const measureCard = (): void => {
    cardSize = { width: card.offsetWidth, height: card.offsetHeight };
  };
  const measureNames = (): void => {
    for (const name of names) name.measure();
  };
  const drawSky = (): void => {
    const corner: ScreenPoint = toScreen(motion.view, frame, { x: 0, y: 0 });
    sky?.draw({ cornerX: corner.x, cornerY: corner.y, scale: motion.view.scale }, performance.now() / 1000);
  };
  let shownLabels: readonly LabelBox[] = [];
  const placeCard = (): void => {
    const view: NodeView | null = cardView();
    if (view === null || !presence.visible) return;
    const own: NodeSpot | undefined = spots.find((spot: NodeSpot): boolean => spot.id === view.def.id);
    if (own === undefined) return;
    const reach: number = TREE_NODES.neighbourReach * CHART.unit;
    const near: readonly NodeSpot[] = spots.filter((spot: NodeSpot): boolean => spot !== own && Math.hypot(spot.x - own.x, spot.y - own.y) <= reach).map(onScreen);
    const at: CardSpot = cardSpot(onScreen(own), cardSize, near, { width: frame.width, height: frame.height, edge: CHART.cardEdge, gap: CHART.cardGap }, shownLabels);
    card.style.translate = `${Math.round(at.x)}px ${Math.round(at.y)}px`;
  };
  let wantedFoot: number = CHART_VIEW.labelFoot;
  const measureFoot = (): void => {
    wantedFoot = captionFoot(prompt.offsetTop, prompt.offsetHeight, frame.height);
  };
  const frameTargets: FrameTargets = createFrameTargets(board, names);
  const apply = (): void => {
    shownLabels = writeView(frameTargets, motion.view, frame, foot);
    placeCard();
    drawSky();
    const corner: ScreenPoint = toScreen(motion.view, frame, { x: 0, y: 0 });
    const change: FarChange = treeFar.move({ cornerX: corner.x, cornerY: corner.y, scale: motion.view.scale });
    if (change !== 'left') return;
    raster = FRESH_RASTER;
    holding = false;
    board.classList.add('releasing');
  };
  const local = (event: MouseEvent): ScreenPoint => {
    const box: DOMRect = viewport.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const spread = (): number => {
    const [first, second] = [...pointers.values()];
    return first === undefined || second === undefined ? 0 : Math.hypot(first.x - second.x, first.y - second.y);
  };

  viewport.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (pointers.size === 0) suppressClick = false;
    if (event.button !== 0 || card.contains(event.target instanceof Node ? event.target : null)) return;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 2) {
      pinch = spread();
      drag = null;
      return;
    }
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, travelled: 0, vx: 0, vy: 0 };
  });
  viewport.addEventListener('pointermove', (event: PointerEvent): void => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, local(event));
    if (pointers.size === 2 && pinch > 0) {
      const now: number = spread();
      const [first, second] = [...pointers.values()];
      if (first === undefined || second === undefined || now <= 0) return;
      const middle: ScreenPoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      target = zoomChart(target, frame, middle, -Math.log(now / pinch) / ATLAS_VIEW.wheelRate);
      motion = still(target);
      pinch = now;
      suppressClick = true;
      markMoved();
      apply();
      return;
    }
    if (drag === null || drag.pointer !== event.pointerId) return;
    const dx: number = event.clientX - drag.x;
    const dy: number = event.clientY - drag.y;
    const seconds: number = Math.max(ATLAS_VIEW.maxStep, (event.timeStamp - drag.time) / 1000);
    drag.travelled += Math.hypot(dx, dy);
    drag.vx += (dx / seconds - drag.vx) * CHART.velocityBlend;
    drag.vy += (dy / seconds - drag.vy) * CHART.velocityBlend;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = event.timeStamp;
    if (drag.travelled < CHART.dragThreshold) return;
    if (!viewport.classList.contains('dragging')) {
      viewport.classList.add('dragging');
      viewport.setPointerCapture(event.pointerId);
      sendCard({ type: 'clear' });
    }
    target = panChart(target, frame, dx, dy);
    motion = { ...motion, view: panChart(motion.view, frame, dx, dy) };
    markMoved();
    apply();
  });
  const release = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag === null || drag.pointer !== event.pointerId) return;
    const ended: Drag = drag;
    drag = null;
    viewport.classList.remove('dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (ended.travelled < CHART.dragThreshold) return;
    suppressClick = true;
    target = panChart(target, frame, ended.vx * ATLAS_VIEW.flingSeconds, ended.vy * ATLAS_VIEW.flingSeconds);
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener(
    'click',
    (event: MouseEvent): void => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
    },
    true,
  );
  viewport.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      target = zoomChart(target, frame, local(event), event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * CHART.wheelLine : event.deltaY);
      markMoved();
    },
    { passive: false },
  );
  const zoomBy = (delta: number): void => {
    target = zoomChart(target, frame, { x: frame.width / 2, y: frame.height / 2 }, delta);
    markMoved();
  };
  zoomIn.addEventListener('click', (): void => zoomBy(-CHART.zoomStep));
  zoomOut.addEventListener('click', (): void => zoomBy(CHART.zoomStep));
  recentre.addEventListener('click', (): void => {
    target = frameChart(frame, openingView());
    markMoved();
  });

  const press = (view: NodeView): void => {
    const node: SkillTreeNodeDef = view.def;
    sendCard({ type: 'pin', node: node.id });
    const status: TreeNodeStatus = statusOf(node);
    switch (status.kind) {
      case 'available':
        context.api.send({ type: 'allocate', node: node.id });
        break;
      case 'no_points':
      case 'locked':
      case 'closed':
        retrigger(view.button, 'deny');
        retrigger(card, 'deny');
        break;
      case 'allocated':
        break;
    }
    fillCard();
  };
  const takeBack = (view: NodeView): void => {
    if (!context.api.touch && statusOf(view.def).kind === 'allocated') giveBack(view.def.id, view.button);
  };

  const icons: TreeIcons = createTreeIcons();
  const views: NodeView[] = [];
  for (const node of nodes) {
    const button: HTMLButtonElement = createSocket(board, content, node, centreOf(node), icons);
    const view: NodeView = { def: node, button };
    button.addEventListener('click', (): void => press(view));
    button.addEventListener('contextmenu', (event: MouseEvent): void => {
      event.preventDefault();
      takeBack(view);
    });
    views.push(view);
  }
  const spots: readonly NodeSpot[] = views.map((view: NodeView): NodeSpot => ({ id: view.def.id, ...centreOf(view.def), radius: nodeDiameter(view.def) / 2 }));
  const viewOf: ReadonlyMap<string, NodeView> = new Map<string, NodeView>(views.map((view: NodeView): [string, NodeView] => [view.def.id, view]));
  const hitAt = (at: ScreenPoint): string | null => nodeAt(spots, at.x, at.y, CHART.hitFloor / motion.view.scale);
  const rehit = (): void => {
    if (pointerAt === null || viewport.classList.contains('dragging')) return;
    const at: ScreenPoint = toMap(motion.view, frame, pointerAt);
    sendCard({ type: 'settle', node: hitAt(at) });
  };
  viewport.addEventListener('pointermove', (event: PointerEvent): void => {
    pointerAt = event.pointerType === 'touch' ? null : local(event);
    if (pointerAt === null || viewport.classList.contains('dragging')) return;
    const at: ScreenPoint = toMap(motion.view, frame, pointerAt);
    sendCard({ type: 'point', node: hitAt(at) });
  });
  const farView = (event: MouseEvent): NodeView | null => {
    if (!treeFar.isFar()) return null;
    const id: string | null = hitAt(toMap(motion.view, frame, local(event)));
    return id === null ? null : (viewOf.get(id) ?? null);
  };
  viewport.addEventListener('click', (event: MouseEvent): void => {
    const clicked: EventTarget | null = event.target;
    if (clicked instanceof Element && (clicked.closest('button, input') !== null || card.contains(clicked))) return;
    const hit: NodeView | null = farView(event);
    if (hit !== null) press(hit);
    else if (cardState.pinned !== null) sendCard({ type: 'clear' });
  });
  viewport.addEventListener('contextmenu', (event: MouseEvent): void => {
    const hit: NodeView | null = farView(event);
    if (hit === null) return;
    event.preventDefault();
    takeBack(hit);
  });
  viewport.addEventListener('pointerleave', (event: PointerEvent): void => {
    pointerAt = null;
    if (event.pointerType !== 'touch') sendCard({ type: 'point', node: null });
  });

  wireTreeSearch(search, viewport, content, views.map((view: NodeView): SearchPlace => ({ id: view.def.id, button: view.button })), (id: string): void => {
    const node: SkillTreeNodeDef | undefined = byId.get(id);
    if (node === undefined) return;
    const at: ChartPoint = centreOf(node);
    target = clampChart({ x: at.x, y: at.y, scale: Math.max(target.scale, CHART.findZoom) }, frame);
    markMoved();
    sendCard({ type: 'pin', node: id });
  });

  let wasOpen: boolean = false;
  new MutationObserver((): void => {
    const open: boolean = element.classList.contains('open');
    parent.classList.toggle('chart-open', open);
    if (open) {
      if (!cardState.open) sendCard({ type: 'open' });
      if (!wasOpen) opened();
      return;
    }
    if (wasOpen) lastView = target;
    wasOpen = false;
    sendCard({ type: 'close' });
  }).observe(element, { attributes: true, attributeFilter: ['class'] });
  const openingView = (): ChartPoint[] => {
    const at: string | null = chartHere(content, player().allocated);
    const hereNode: SkillTreeNodeDef | undefined = at === null ? undefined : byId.get(at);
    const open: ChartPoint[] = nodes.filter((node: SkillTreeNodeDef): boolean => reachable(statusOf(node))).map(centreOf);
    if (hereNode === undefined) return open.length > 0 ? [eye, ...open] : [eye];
    return [centreOf(hereNode), ...open];
  };

  const opened = (): void => {
    wasOpen = true;
    icons.bake();
    frame = measured();
    frameDirty = false;
    remeasure = true;
    if (raster.phase !== 'held') {
      raster = FRESH_RASTER;
      holding = false;
      board.classList.add('releasing');
    }
    target = reopenChart(frame, { last: lastView, points: openingView() });
    motion = still(target);
    measureNames();
    apply();
  };

  const sync = (): void => {
    const you = player();
    setText(pointCount, String(you.skillPoints), true);
    setText(pointWord, you.skillPoints === 1 ? 'point' : 'points', false);
    points.classList.toggle('spendable', you.skillPoints > 0);
    viewport.classList.toggle('choosing', you.skillPoints > 0);
    const fresh: boolean = you.skillPoints === 0 && you.allocated.length === 0;
    prompt.classList.toggle('shown', you.skillPoints > 0 || fresh);
    prompt.classList.toggle('empty', fresh);
    if (you.skillPoints > 0) setText(prompt, pointsPrompt(you.skillPoints, you.allocated.length), true);
    else if (fresh) setText(prompt, CHART.emptyLine, false);
    restart.classList.toggle('shown', you.allocated.length > 0);
    restart.classList.toggle('free', you.freeReset);
    if (performance.now() >= confirmUntil) restart.classList.remove('confirm');
    setText(restart, restartLabel(), true);
    const closed: Set<string> = new Set<string>();
    for (const view of views) {
      const status: TreeNodeStatus = statusOf(view.def);
      treeFar.status(view.def.id, status.kind);
      if (status.kind === 'closed') closed.add(view.def.id);
      for (const name of STATUS_CLASSES) view.button.classList.toggle(name, name === status.kind);
      view.button.classList.toggle('unheld', placeOff(content, view.def, you.equipped) !== null);
    }
    markSpecialtyNames(content, specialtyNames, you.allocated);
    for (const link of links) {
      const fromTaken: boolean = you.allocated.includes(link.from);
      const toTaken: boolean = you.allocated.includes(link.to);
      const shut: boolean = closed.has(link.from) || closed.has(link.to);
      link.path.classList.toggle('lit', fromTaken && toTaken);
      link.path.classList.toggle('open', fromTaken !== toTaken);
      link.path.classList.toggle('closed', shut);
      link.track.classList.toggle('closed', shut);
    }
    treeFar.remark();
    measureFoot();
    fillCard();
  };

  return {
    element,
    refresh(): void {
      sync();
    },
    warm(): boolean {
      if (warmed || element.classList.contains('open')) return true;
      if (viewport.offsetWidth === 0) return false;
      warmed = true;
      icons.bake();
      frame = measured();
      frameDirty = false;
      target = reopenChart(frame, { last: lastView, points: openingView() });
      motion = still(target);
      sync();
      measureNames();
      measureCard();
      measureFoot();
      element.classList.add('warming');
      apply();
      raster = { phase: 'held', scale: motion.view.scale };
      holding = true;
      let left: number = CHART.warmFrames;
      const settle = (): void => {
        left -= 1;
        if (left > 0) {
          requestAnimationFrame(settle);
          return;
        }
        element.classList.remove('warming');
      };
      requestAnimationFrame(settle);
      return true;
    },
    update(dt: number): void {
      if (performance.now() >= confirmUntil && restart.classList.contains('confirm')) sync();
      if (remeasure) {
        remeasure = false;
        measureNames();
        measureCard();
        measureFoot();
        apply();
      }
      if (frameDirty) {
        frameDirty = false;
        const now: AtlasFrame = measured();
        if (!sameFrame(now, frame)) {
          frame = now;
          movedAt = performance.now();
          target = clampChart(target, frame);
          motion = still(clampChart(motion.view, frame));
          measureNames();
          measureCard();
          measureFoot();
          apply();
        }
      }
      const shifting: boolean = foot !== wantedFoot;
      if (shifting) foot = easeFoot(foot, wantedFoot, dt);
      const resting: boolean = atRest(motion, target);
      const clock: number = performance.now();
      if (!resting) movedAt = clock;
      const moving: boolean = viewIsMoving(clock, movedAt);
      if (wasMoving && !moving) rehit();
      wasMoving = moving;
      tickCard();
      if (!treeFar.isFar()) {
        const step: RasterStep = stepRaster(raster, motion.view.scale, resting);
        raster = step.state;
        if (step.hold !== holding) {
          holding = step.hold;
          board.classList.toggle('releasing', !holding);
        }
      }
      if (resting) {
        if (shifting) apply();
        else drawSky();
        return;
      }
      motion = stepMotion(motion, target, dt);
      apply();
    },
  };
}

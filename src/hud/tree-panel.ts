import type { ChartPath, SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { canRefund, refundCost } from '../../sim/progression.ts';
import { ATLAS_VIEW, atRest, stepMotion, still, toScreen } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, ScreenPoint } from './atlas-view.ts';
import { abilityCard } from './chart-ability.ts';
import type { AbilityCard } from './chart-ability.ts';
import { chartBounds, chartHere, chartMatches, chartRoute, pathLabels, pathTint } from './chart-model.ts';
import { clampChart, frameChart, panChart, pinLabel, spreadLabels, zoomChart } from './chart-view.ts';
import type { LabelBox, PinnedLabel } from './chart-view.ts';
import type { ChartBounds, ChartPoint, PathLabel } from './chart-model.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { slotAction } from '../settings/bindings.ts';
import { placeGlyph } from './tree-glyphs.ts';
import { statusLine, TREE_NODE_COST, treeNodeStatus } from './tree-status.ts';
import type { TreeNodeStatus } from './tree-status.ts';

const CHART = {
  unit: 46,
  margin: 4,
  dragThreshold: 5,
  velocityBlend: 0.35,
  wheelLine: 32,
  zoomStep: 360,
  findZoom: 1.2,
  confirmMs: 3200,
  hoverGraceMs: 700,
  cardGap: 26,
  cardEdge: 10,
  svgNamespace: 'http://www.w3.org/2000/svg',
} as const;

const STATUS_CLASSES: readonly TreeNodeStatus['kind'][] = ['allocated', 'available', 'no_points', 'locked'];

export interface ChartPanel extends PanelView {
  update(dt: number): void;
}

interface NodeView {
  readonly def: SkillTreeNodeDef;
  readonly button: HTMLButtonElement;
}

interface LinkView {
  readonly path: SVGLineElement;
  readonly track: SVGLineElement;
  readonly from: string;
  readonly to: string;
}

interface NameView {
  readonly element: HTMLDivElement;
  readonly at: ChartPoint;
}

interface Drag {
  readonly pointer: number;
  x: number;
  y: number;
  time: number;
  travelled: number;
  vx: number;
  vy: number;
}

function reachable(status: TreeNodeStatus): boolean {
  return status.kind === 'available' || status.kind === 'no_points';
}

function kindWord(node: SkillTreeNodeDef): string {
  if (node.unlock !== null) return 'ability';
  if (node.kind === 'keystone') return 'keystone';
  if (node.variant !== null) return 'changes a skill';
  return node.kind === 'notable' ? 'named place' : 'place';
}

function line(svg: SVGSVGElement, from: ChartPoint, to: ChartPoint, className: string, tint: string): SVGLineElement {
  const shape: SVGLineElement = document.createElementNS(CHART.svgNamespace, 'line');
  shape.setAttribute('class', className);
  shape.setAttribute('x1', String(from.x));
  shape.setAttribute('y1', String(from.y));
  shape.setAttribute('x2', String(to.x));
  shape.setAttribute('y2', String(to.y));
  shape.setAttribute('pathLength', '1');
  shape.style.setProperty('--tint', tint);
  svg.appendChild(shape);
  return shape;
}

export function createTreePanel(parent: HTMLElement, context: HudContext, close: () => void): ChartPanel {
  const content = context.api.world.content;
  const element: HTMLDivElement = el('div', 'hud-panel left tree-panel', parent);
  const head: HTMLDivElement = el('div', 'tree-head', element);
  label('tree-title', content.chart.title, head);
  const points: HTMLDivElement = el('div', 'tree-points', head);
  const pointCount: HTMLSpanElement = el('span', 'tree-points-count', points);
  const pointWord: HTMLSpanElement = el('span', 'tree-points-word', points);
  const search: HTMLInputElement = el('input', 'chart-search', head);
  search.type = 'search';
  search.placeholder = 'Find a place';
  search.setAttribute('aria-label', 'Find a place on the chart');
  const zoomOut: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomOut.type = 'button';
  zoomOut.textContent = '−';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomIn.type = 'button';
  zoomIn.textContent = '+';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const restart: HTMLButtonElement = el('button', 'chart-restart', head);
  restart.type = 'button';
  const shut: HTMLButtonElement = el('button', 'chart-close', head);
  shut.type = 'button';
  shut.textContent = '×';
  shut.setAttribute('aria-label', 'Close the chart');
  shut.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    close();
  });

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

  const byId: ReadonlyMap<string, SkillTreeNodeDef> = new Map<string, SkillTreeNodeDef>(nodes.map((node: SkillTreeNodeDef): [string, SkillTreeNodeDef] => [node.id, node]));
  const links: LinkView[] = [];
  for (const node of nodes) {
    for (const requiredId of node.requires) {
      const from: SkillTreeNodeDef | undefined = byId.get(requiredId);
      if (from === undefined) continue;
      const tint: string = pathTint(content, node.path === from.path ? node.path : from.path);
      const track: SVGLineElement = line(svg, centreOf(from), centreOf(node), 'tree-track', tint);
      links.push({ track, path: line(svg, centreOf(from), centreOf(node), 'tree-flow', tint), from: requiredId, to: node.id });
    }
  }

  const names: NameView[] = pathLabels(content).map((entry: PathLabel): NameView => {
    const name: HTMLDivElement = label('chart-path-name', entry.path.name, viewport);
    name.style.setProperty('--tint', entry.path.tint);
    return { element: name, at: place(entry.at) };
  });
  const here: HTMLDivElement = el('div', 'chart-here', board);
  el('span', 'chart-here-ring', here);
  label('chart-here-word', 'You are here', here);
  const prompt: HTMLDivElement = el('div', 'chart-prompt', viewport);
  const card: HTMLDivElement = el('div', 'chart-card', viewport);
  const cardBody: HTMLDivElement = el('div', 'chart-card-body', card);
  const action: HTMLButtonElement = el('button', 'chart-action', card);
  action.type = 'button';

  const player = (): PlayerState => context.api.world.player;
  const statusOf = (node: SkillTreeNodeDef): TreeNodeStatus => treeNodeStatus(content, player().allocated, player().skillPoints, node);
  const goldFor = (count: number): number => refundCost(content, player().level, count);

  let hovered: NodeView | null = null;
  let selected: NodeView | null = null;
  let shownCard: string = '';
  let unhover: number | undefined;

  const costLine = (node: SkillTreeNodeDef, status: TreeNodeStatus): string => {
    if (status.kind === 'allocated') return canRefund(content, player().allocated, node.id) ? 'Taken' : 'Taken · places after it hold on to it';
    const steps: number = chartRoute(content, player().allocated, node.id).length;
    if (status.kind === 'available') return `${statusLine(status, context.api.touch)} · ${TREE_NODE_COST} point`;
    if (status.kind === 'no_points') return `Needs ${TREE_NODE_COST} point · you have none`;
    return steps > 0 ? `${steps * TREE_NODE_COST} points along the lit route` : statusLine(status, context.api.touch);
  };

  const showRoute = (target: string | null): void => {
    const route: ReadonlySet<string> = new Set<string>(target === null ? [] : chartRoute(content, player().allocated, target));
    const taken: readonly string[] = player().allocated;
    viewport.classList.toggle('routing', route.size > 0);
    for (const view of views) view.button.classList.toggle('route', route.has(view.def.id));
    for (const link of links) {
      const onRoute: boolean = (route.has(link.from) || taken.includes(link.from)) && (route.has(link.to) || taken.includes(link.to)) && (route.has(link.from) || route.has(link.to));
      link.track.classList.toggle('route', onRoute);
    }
  };

  const fillCard = (): void => {
    const view: NodeView | null = hovered ?? selected;
    card.classList.toggle('visible', view !== null);
    if (view === null) {
      shownCard = '';
      showRoute(null);
      return;
    }
    const node: SkillTreeNodeDef = view.def;
    const status: TreeNodeStatus = statusOf(node);
    const refundable: boolean = status.kind === 'allocated' && canRefund(content, player().allocated, node.id);
    const ability: AbilityCard | null = abilityCard(content, node, player().bar);
    const key: string = `${node.id}:${status.kind}:${refundable ? goldFor(1) : -1}:${player().skillPoints}:${ability?.slot ?? -1}`;
    showRoute(node.id);
    card.style.setProperty('--tint', pathTint(content, node.path));
    action.classList.toggle('shown', refundable);
    if (refundable) setText(action, `Give back · ${goldFor(1)} gold`, false);
    action.classList.toggle('short', refundable && player().gold < goldFor(1));
    if (key === shownCard) {
      placeCard();
      return;
    }
    shownCard = key;
    const body: HTMLDivElement = el('div', 'chart-card-inner', null);
    const path: ChartPath | undefined = content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path);
    label('chart-card-path', path === undefined ? node.kind : `${path.name} · ${kindWord(node)}`, body);
    label('tree-tip-name', node.name, body);
    if (ability !== null) label('chart-card-tags', ability.tags, body);
    label('tree-tip-effect', node.description, body);
    if (ability !== null) label('chart-card-cost', `${ability.cost}${slotWords(ability.slot)}`, body);
    label(`tree-tip-status ${status.kind}`, costLine(node, status), body);
    cardBody.replaceChildren(body);
    placeCard();
  };

  const slotWords = (slot: number | null): string => {
    if (slot === null) return '';
    return context.api.touch ? ` · slot ${slot + 1}` : ` · on ${context.api.settings.keys().labelOf(slotAction(slot))}`;
  };

  const leaveHover = (): void => {
    window.clearTimeout(unhover);
    unhover = window.setTimeout((): void => {
      hovered = null;
      fillCard();
    }, CHART.hoverGraceMs);
  };
  card.addEventListener('pointerenter', (): void => window.clearTimeout(unhover));
  card.addEventListener('pointerleave', (): void => {
    if (hovered !== null) leaveHover();
  });

  action.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const view: NodeView | null = hovered ?? selected;
    if (view === null) return;
    if (player().gold < goldFor(1)) {
      retrigger(action, 'deny');
      return;
    }
    context.api.send({ type: 'refund', node: view.def.id });
  });

  let confirmUntil: number = 0;
  const restartLabel = (): string => {
    const count: number = player().allocated.length;
    return performance.now() < confirmUntil ? `Again to start over · ${goldFor(count)} gold` : `Start over · ${goldFor(count)} gold`;
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
    if (player().gold < goldFor(count)) {
      retrigger(restart, 'deny');
      return;
    }
    context.api.send({ type: 'respec' });
  });

  let frame: AtlasFrame = { width: 1, height: 1, mapWidth, mapHeight };
  let target: AtlasView = { x: mapWidth / 2, y: mapHeight / 2, scale: 1 };
  let motion: AtlasMotion = still(target);
  const pointers: Map<number, ScreenPoint> = new Map<number, ScreenPoint>();
  let drag: Drag | null = null;
  let pinch: number = 0;
  let suppressClick: boolean = false;

  const measure = (): void => {
    frame = { width: Math.max(1, viewport.clientWidth), height: Math.max(1, viewport.clientHeight), mapWidth, mapHeight };
  };
  const placeCard = (): void => {
    const view: NodeView | null = hovered ?? selected;
    if (view === null) return;
    const at: ScreenPoint = toScreen(motion.view, frame, centreOf(view.def));
    const width: number = card.offsetWidth;
    const height: number = card.offsetHeight;
    const right: boolean = at.x + CHART.cardGap + width + CHART.cardEdge <= frame.width;
    const x: number = right ? at.x + CHART.cardGap : Math.max(CHART.cardEdge, at.x - CHART.cardGap - width);
    const y: number = Math.max(CHART.cardEdge, Math.min(at.y - height / 2, frame.height - height - CHART.cardEdge));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  };
  const apply = (): void => {
    placeCard();
    const corner: ScreenPoint = toScreen(motion.view, frame, { x: 0, y: 0 });
    board.style.transform = `translate(${corner.x}px, ${corner.y}px) scale(${motion.view.scale})`;
    viewport.style.setProperty('--zoom', String(motion.view.scale));
    const pins: readonly PinnedLabel[] = names.map((name: NameView): PinnedLabel => pinLabel(toScreen(motion.view, frame, name.at), name.element.offsetWidth / 2, name.element.offsetHeight / 2, frame));
    const boxes: readonly LabelBox[] = spreadLabels(
      pins.map((pin: PinnedLabel, index: number): LabelBox => ({ x: pin.x, y: pin.y, halfWidth: (names[index]?.element.offsetWidth ?? 0) / 2, halfHeight: (names[index]?.element.offsetHeight ?? 0) / 2 })),
      frame,
    );
    names.forEach((name: NameView, index: number): void => {
      const box: LabelBox | undefined = boxes[index];
      if (box === undefined) return;
      name.element.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px) translate(-50%, -50%)`;
      name.element.classList.toggle('pinned', pins[index]?.pinned ?? false);
    });
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
      hovered = null;
      fillCard();
    }
    target = panChart(target, frame, dx, dy);
    motion = { ...motion, view: panChart(motion.view, frame, dx, dy) };
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
    },
    { passive: false },
  );
  const zoomBy = (delta: number): void => {
    target = zoomChart(target, frame, { x: frame.width / 2, y: frame.height / 2 }, delta);
  };
  zoomIn.addEventListener('click', (): void => zoomBy(-CHART.zoomStep));
  zoomOut.addEventListener('click', (): void => zoomBy(CHART.zoomStep));

  const views: NodeView[] = [];
  for (const node of nodes) {
    const centre: ChartPoint = centreOf(node);
    const button: HTMLButtonElement = el('button', `tree-socket ${node.kind} locked`, board);
    button.type = 'button';
    button.setAttribute('aria-label', node.name);
    button.style.left = `${centre.x}px`;
    button.style.top = `${centre.y}px`;
    button.style.setProperty('--tint', pathTint(content, node.path));
    if (node.variant !== null) button.classList.add('variant');
    if (node.unlock !== null) button.classList.add('ability');
    el('span', 'tree-socket-rim', button);
    el('span', 'tree-socket-well', button);
    el('span', 'tree-socket-fill', button);
    const glyph: HTMLSpanElement = el('span', 'tree-socket-glyph', button);
    glyph.innerHTML = placeGlyph(content, node);
    const view: NodeView = { def: node, button };
    button.addEventListener('pointerenter', (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || viewport.classList.contains('dragging')) return;
      window.clearTimeout(unhover);
      hovered = view;
      fillCard();
    });
    button.addEventListener('pointerleave', (): void => {
      if (hovered === view) leaveHover();
    });
    button.addEventListener('click', (): void => {
      selected?.button.classList.remove('selected');
      selected = view;
      button.classList.add('selected');
      const status: TreeNodeStatus = statusOf(node);
      switch (status.kind) {
        case 'available':
          context.api.send({ type: 'allocate', node: node.id });
          break;
        case 'no_points':
        case 'locked':
          retrigger(button, 'deny');
          retrigger(card, 'deny');
          break;
        case 'allocated':
          break;
      }
      fillCard();
    });
    views.push(view);
  }

  const showMatches = (): void => {
    const found: ReadonlySet<string> | null = chartMatches(content, search.value);
    viewport.classList.toggle('searching', found !== null);
    for (const view of views) view.button.classList.toggle('match', found !== null && found.has(view.def.id));
  };
  let findIndex: number = 0;
  search.addEventListener('input', (): void => {
    findIndex = 0;
    showMatches();
  });
  search.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.code === 'Escape') return;
    event.stopPropagation();
    if (event.code !== 'Enter') return;
    const found: readonly NodeView[] = views.filter((view: NodeView): boolean => view.button.classList.contains('match'));
    const next: NodeView | undefined = found[findIndex % Math.max(1, found.length)];
    if (next === undefined) return;
    findIndex += 1;
    const at: ChartPoint = centreOf(next.def);
    target = clampChart({ x: at.x, y: at.y, scale: Math.max(target.scale, CHART.findZoom) }, frame);
    selected?.button.classList.remove('selected');
    selected = next;
    next.button.classList.add('selected');
    fillCard();
  });
  search.addEventListener('keyup', (event: KeyboardEvent): void => event.stopPropagation());

  new ResizeObserver((): void => {
    if (!element.classList.contains('open')) return;
    measure();
    target = clampChart(target, frame);
    motion = still(clampChart(motion.view, frame));
    apply();
  }).observe(viewport);

  let wasOpen: boolean = false;
  new MutationObserver((): void => {
    const open: boolean = element.classList.contains('open');
    parent.classList.toggle('chart-open', open);
    if (open) return;
    wasOpen = false;
    hovered = null;
    fillCard();
  }).observe(element, { attributes: true, attributeFilter: ['class'] });
  const openingView = (): ChartPoint[] => {
    const at: string | null = chartHere(content, player().allocated);
    const hereNode: SkillTreeNodeDef | undefined = at === null ? undefined : byId.get(at);
    const open: ChartPoint[] = nodes.filter((node: SkillTreeNodeDef): boolean => reachable(statusOf(node))).map(centreOf);
    if (hereNode === undefined) return open.length > 0 ? [eye, ...open] : [eye];
    return [centreOf(hereNode), ...open];
  };

  const sync = (): void => {
    const you = player();
    setText(pointCount, String(you.skillPoints), true);
    setText(pointWord, you.skillPoints === 1 ? 'point' : 'points', false);
    points.classList.toggle('spendable', you.skillPoints > 0);
    viewport.classList.toggle('choosing', you.skillPoints > 0);
    prompt.classList.toggle('shown', you.skillPoints > 0);
    if (you.skillPoints > 0) setText(prompt, `${you.skillPoints} ${you.skillPoints === 1 ? 'point' : 'points'}: choose a place`, false);
    restart.classList.toggle('shown', you.allocated.length > 0);
    if (performance.now() >= confirmUntil) restart.classList.remove('confirm');
    setText(restart, restartLabel(), true);
    for (const view of views) {
      const status: TreeNodeStatus = statusOf(view.def);
      for (const name of STATUS_CLASSES) view.button.classList.toggle(name, name === status.kind);
    }
    const at: string | null = chartHere(content, you.allocated);
    const hereNode: SkillTreeNodeDef | undefined = at === null ? undefined : byId.get(at);
    const spot: ChartPoint = hereNode === undefined ? eye : centreOf(hereNode);
    here.style.left = `${spot.x}px`;
    here.style.top = `${spot.y}px`;
    here.classList.toggle('start', hereNode === undefined);
    for (const link of links) {
      const fromTaken: boolean = you.allocated.includes(link.from);
      const toTaken: boolean = you.allocated.includes(link.to);
      link.path.classList.toggle('lit', fromTaken && toTaken);
      link.path.classList.toggle('open', fromTaken !== toTaken);
    }
    fillCard();
  };

  return {
    element,
    refresh(): void {
      const open: boolean = element.classList.contains('open');
      if (open && !wasOpen) {
        measure();
        target = frameChart(frame, openingView());
        motion = still(target);
        apply();
      }
      wasOpen = open;
      sync();
    },
    update(dt: number): void {
      if (performance.now() >= confirmUntil && restart.classList.contains('confirm')) sync();
      if (atRest(motion, target)) return;
      motion = stepMotion(motion, target, dt);
      apply();
    },
  };
}

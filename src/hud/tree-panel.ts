import type { ChartPath, SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { canRefund, refundCost } from '../../sim/progression.ts';
import { ATLAS_VIEW, atRest, clampView, minScale, panBy, stepMotion, still, toScreen, zoomAt } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, ScreenPoint } from './atlas-view.ts';
import { chartBounds, chartFocus, chartMatches, pathLabels, pathTint } from './chart-model.ts';
import type { ChartBounds, ChartPoint } from './chart-model.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { treeGlyph } from './tree-glyphs.ts';
import { requirementLine, statusLine, treeNodeStatus } from './tree-status.ts';
import type { TreeNodeStatus } from './tree-status.ts';

const CHART = {
  unit: 46,
  margin: 3,
  dragThreshold: 5,
  velocityBlend: 0.35,
  wheelLine: 32,
  zoomStep: 360,
  findZoom: 1.7,
  confirmMs: 3200,
  hoverGraceMs: 700,
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
  readonly from: string;
  readonly to: string;
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

export function createTreePanel(parent: HTMLElement, context: HudContext): ChartPanel {
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

  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  const bounds: ChartBounds = chartBounds(nodes);
  const mapWidth: number = (bounds.right - bounds.left + CHART.margin * 2) * CHART.unit;
  const mapHeight: number = (bounds.bottom - bounds.top + CHART.margin * 2) * CHART.unit;
  const place = (point: ChartPoint): ChartPoint => ({ x: (point.x - bounds.left + CHART.margin) * CHART.unit, y: (point.y - bounds.top + CHART.margin) * CHART.unit });
  const centreOf = (node: SkillTreeNodeDef): ChartPoint => place({ x: node.column, y: node.row });

  const viewport: HTMLDivElement = el('div', 'tree-viewport', element);
  const board: HTMLDivElement = el('div', 'tree-board', viewport);
  board.style.width = `${mapWidth}px`;
  board.style.height = `${mapHeight}px`;
  const svg: SVGSVGElement = document.createElementNS(CHART.svgNamespace, 'svg');
  svg.setAttribute('class', 'tree-links');
  svg.setAttribute('viewBox', `0 0 ${mapWidth} ${mapHeight}`);
  board.appendChild(svg);
  for (const entry of pathLabels(content)) {
    const at: ChartPoint = place(entry.at);
    const name: HTMLDivElement = label('chart-path-name', entry.path.name, board);
    name.style.left = `${at.x}px`;
    name.style.top = `${at.y}px`;
    name.style.setProperty('--tint', entry.path.tint);
  }

  const byId: ReadonlyMap<string, SkillTreeNodeDef> = new Map<string, SkillTreeNodeDef>(nodes.map((node: SkillTreeNodeDef): [string, SkillTreeNodeDef] => [node.id, node]));
  const links: LinkView[] = [];
  for (const node of nodes) {
    for (const requiredId of node.requires) {
      const from: SkillTreeNodeDef | undefined = byId.get(requiredId);
      if (from === undefined) continue;
      const tint: string = pathTint(content, node.path === from.path ? node.path : from.path);
      line(svg, centreOf(from), centreOf(node), 'tree-track', tint);
      links.push({ path: line(svg, centreOf(from), centreOf(node), 'tree-flow', tint), from: requiredId, to: node.id });
    }
  }

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

  const fillCard = (): void => {
    const view: NodeView | null = hovered ?? selected;
    card.classList.toggle('visible', view !== null);
    if (view === null) return;
    const node: SkillTreeNodeDef = view.def;
    const status: TreeNodeStatus = statusOf(node);
    const refundable: boolean = status.kind === 'allocated' && canRefund(content, player().allocated, node.id);
    const key: string = `${node.id}:${status.kind}:${refundable ? goldFor(1) : -1}`;
    card.style.setProperty('--tint', pathTint(content, node.path));
    action.classList.toggle('shown', refundable);
    if (refundable) setText(action, `Give back · ${goldFor(1)} gold`, false);
    action.classList.toggle('short', refundable && player().gold < goldFor(1));
    if (key === shownCard) return;
    shownCard = key;
    const body: HTMLDivElement = el('div', 'chart-card-inner', null);
    const path: ChartPath | undefined = content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path);
    label('chart-card-path', path === undefined ? node.kind : `${path.name}${node.kind === 'minor' ? '' : ` · ${node.kind === 'keystone' ? 'keystone' : node.variant === null ? 'named place' : 'changes a skill'}`}`, body);
    label('tree-tip-name', node.name, body);
    label('tree-tip-effect', node.description, body);
    const requirement: string | null = requirementLine(content, node);
    if (requirement !== null && status.kind !== 'locked') label('tree-tip-requires', requirement, body);
    if (status.kind === 'allocated' && !refundable) label('tree-tip-requires', 'Places taken after it hold on to it', body);
    label(`tree-tip-status ${status.kind}`, statusLine(status, context.api.touch), body);
    cardBody.replaceChildren(body);
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
  const apply = (): void => {
    const corner: ScreenPoint = toScreen(motion.view, frame, { x: 0, y: 0 });
    board.style.transform = `translate(${corner.x}px, ${corner.y}px) scale(${motion.view.scale})`;
    viewport.style.setProperty('--zoom', String(motion.view.scale));
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
      target = zoomAt(target, frame, middle, -Math.log(now / pinch) / ATLAS_VIEW.wheelRate);
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
    target = panBy(target, frame, dx, dy);
    motion = { ...motion, view: panBy(motion.view, frame, dx, dy) };
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
    target = panBy(target, frame, ended.vx * ATLAS_VIEW.flingSeconds, ended.vy * ATLAS_VIEW.flingSeconds);
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
      target = zoomAt(target, frame, local(event), event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * CHART.wheelLine : event.deltaY);
    },
    { passive: false },
  );
  const zoomBy = (delta: number): void => {
    target = zoomAt(target, frame, { x: frame.width / 2, y: frame.height / 2 }, delta);
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
    el('span', 'tree-socket-rim', button);
    el('span', 'tree-socket-well', button);
    el('span', 'tree-socket-fill', button);
    const glyph: HTMLSpanElement = el('span', 'tree-socket-glyph', button);
    glyph.innerHTML = treeGlyph(node.icon);
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
    target = clampView({ x: at.x, y: at.y, scale: Math.max(target.scale, minScale(frame) * CHART.findZoom) }, frame);
    selected?.button.classList.remove('selected');
    selected = next;
    next.button.classList.add('selected');
    fillCard();
  });
  search.addEventListener('keyup', (event: KeyboardEvent): void => event.stopPropagation());

  new ResizeObserver((): void => {
    if (!element.classList.contains('open')) return;
    measure();
    target = clampView(target, frame);
    motion = still(clampView(motion.view, frame));
    apply();
  }).observe(viewport);

  let wasOpen: boolean = false;
  new MutationObserver((): void => {
    if (element.classList.contains('open')) return;
    wasOpen = false;
    hovered = null;
    fillCard();
  }).observe(element, { attributes: true, attributeFilter: ['class'] });
  const sync = (): void => {
    const you = player();
    setText(pointCount, String(you.skillPoints), true);
    setText(pointWord, you.skillPoints === 1 ? 'point' : 'points', false);
    points.classList.toggle('spendable', you.skillPoints > 0);
    restart.classList.toggle('shown', you.allocated.length > 0);
    if (performance.now() >= confirmUntil) restart.classList.remove('confirm');
    setText(restart, restartLabel(), true);
    for (const view of views) {
      const status: TreeNodeStatus = statusOf(view.def);
      for (const name of STATUS_CLASSES) view.button.classList.toggle(name, name === status.kind);
    }
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
        const focus: ChartPoint = place(chartFocus(content, player().allocated));
        target = clampView({ x: focus.x, y: focus.y, scale: minScale(frame) }, frame);
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

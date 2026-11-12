import type { SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { treeGlyph } from './tree-glyphs.ts';
import { centredPan, clampPan, layoutTree, linkPath } from './tree-layout.ts';
import type { TreeLayout, TreePoint } from './tree-layout.ts';
import { costLine, requirementLine, statusLine, treeNodeStatus } from './tree-status.ts';
import type { TreeNodeStatus } from './tree-status.ts';

const TREE = {
  cell: 58,
  pad: 32,
  maxWidth: 520,
  maxHeight: 440,
  reservedHeight: 300,
  reservedTouchHeight: 72,
  minViewport: 120,
  dragThreshold: 4,
  tipGap: 6,
  tipMargin: 8,
  half: 0.5,
  svgNamespace: 'http://www.w3.org/2000/svg',
} as const;

const STATUS_CLASSES: readonly TreeNodeStatus['kind'][] = ['allocated', 'available', 'no_points', 'locked'];

interface NodeView {
  readonly def: SkillTreeNodeDef;
  readonly button: HTMLButtonElement;
}

interface LinkView {
  readonly path: SVGPathElement;
  readonly from: string;
  readonly to: string;
}

interface Drag {
  readonly pointer: number;
  readonly startX: number;
  readonly startY: number;
  readonly panX: number;
  readonly panY: number;
  moved: boolean;
}

export function createTreePanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel left tree-panel', parent);
  const head: HTMLDivElement = el('div', 'tree-head', element);
  label('tree-title', 'Skills', head);
  const points: HTMLDivElement = el('div', 'tree-points', head);
  const pointCount: HTMLSpanElement = el('span', 'tree-points-count', points);
  const pointWord: HTMLSpanElement = el('span', 'tree-points-word', points);
  const nodes: readonly SkillTreeNodeDef[] = context.api.world.content.skillTree;
  const layout: TreeLayout = layoutTree(nodes, TREE);
  const viewport: HTMLDivElement = el('div', 'tree-viewport', element);
  const board: HTMLDivElement = el('div', 'tree-board', viewport);
  board.style.width = `${layout.width}px`;
  board.style.height = `${layout.height}px`;
  const svg: SVGSVGElement = document.createElementNS(TREE.svgNamespace, 'svg');
  svg.setAttribute('class', 'tree-links');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  board.appendChild(svg);
  const tip: HTMLDivElement = el('div', 'tree-tip', parent);

  const links: LinkView[] = [];
  const track = (shape: string, className: string): SVGPathElement => {
    const path: SVGPathElement = document.createElementNS(TREE.svgNamespace, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', shape);
    path.setAttribute('pathLength', '1');
    svg.appendChild(path);
    return path;
  };
  for (const node of nodes) {
    const to: TreePoint | undefined = layout.centres.get(node.id);
    for (const requiredId of node.requires) {
      const from: TreePoint | undefined = layout.centres.get(requiredId);
      if (from === undefined || to === undefined) continue;
      track(linkPath(from, to), 'tree-track');
    }
  }
  for (const node of nodes) {
    const to: TreePoint | undefined = layout.centres.get(node.id);
    for (const requiredId of node.requires) {
      const from: TreePoint | undefined = layout.centres.get(requiredId);
      if (from === undefined || to === undefined) continue;
      links.push({ path: track(linkPath(from, to), 'tree-flow'), from: requiredId, to: node.id });
    }
  }

  const statusOf = (node: SkillTreeNodeDef): TreeNodeStatus => {
    const player = context.api.world.player;
    return treeNodeStatus(context.api.world.content, player.allocated, player.skillPoints, node);
  };

  let hovered: NodeView | null = null;

  const placeTip = (view: NodeView): void => {
    const rect: DOMRect = view.button.getBoundingClientRect();
    const frame: DOMRect = element.getBoundingClientRect();
    const width: number = tip.offsetWidth;
    const height: number = tip.offsetHeight;
    const right: number = frame.right + TREE.tipGap;
    const left: number = right + width > window.innerWidth - TREE.tipMargin ? frame.left - TREE.tipGap - width : right;
    const top: number = rect.top + rect.height * TREE.half - height * TREE.half;
    tip.style.left = `${Math.max(TREE.tipMargin, left)}px`;
    tip.style.top = `${Math.min(window.innerHeight - TREE.tipMargin - height, Math.max(TREE.tipMargin, top))}px`;
  };

  const fillTip = (view: NodeView): void => {
    const status: TreeNodeStatus = statusOf(view.def);
    const body: HTMLDivElement = el('div', 'tree-tip-body', null);
    label('tree-tip-name', view.def.name, body);
    label('tree-tip-effect', view.def.description, body);
    const requirement: string | null = requirementLine(context.api.world.content, view.def);
    if (requirement !== null && status.kind !== 'locked') label('tree-tip-requires', requirement, body);
    if (status.kind !== 'allocated') label(status.kind === 'no_points' ? 'tree-tip-cost unmet' : 'tree-tip-cost', costLine(), body);
    label(`tree-tip-status ${status.kind}`, statusLine(status), body);
    tip.replaceChildren(body);
    placeTip(view);
  };

  const showTip = (view: NodeView): void => {
    hovered = view;
    fillTip(view);
    tip.getBoundingClientRect();
    tip.classList.add('visible');
  };

  const hideTip = (): void => {
    hovered = null;
    tip.classList.remove('visible');
  };

  const pan = { x: 0, y: 0, width: 0, height: 0 };
  let drag: Drag | null = null;
  let suppressClick: boolean = false;

  const applyPan = (): void => {
    board.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
  };

  const fitViewport = (): void => {
    const width: number = Math.min(layout.width, TREE.maxWidth);
    const reserved: number = document.body.classList.contains('touch') ? TREE.reservedTouchHeight : TREE.reservedHeight;
    const height: number = Math.min(layout.height, TREE.maxHeight, Math.max(TREE.minViewport, window.innerHeight - reserved));
    if (width === pan.width && height === pan.height) return;
    const first: boolean = pan.width === 0;
    pan.width = width;
    pan.height = height;
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
    viewport.classList.toggle('pannable', layout.width > width || layout.height > height);
    pan.x = first ? centredPan(layout.width, width) : clampPan(pan.x, layout.width, width);
    pan.y = clampPan(pan.y, layout.height, height);
    applyPan();
  };

  viewport.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (!viewport.classList.contains('pannable') || event.button !== 0) return;
    drag = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  });
  viewport.addEventListener('pointermove', (event: PointerEvent): void => {
    if (drag === null || drag.pointer !== event.pointerId) return;
    if (event.buttons === 0) {
      drag = null;
      viewport.classList.remove('dragging');
      return;
    }
    const dx: number = event.clientX - drag.startX;
    const dy: number = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < TREE.dragThreshold) return;
    if (!drag.moved) {
      drag.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');
      hideTip();
    }
    pan.x = clampPan(drag.panX + dx, layout.width, pan.width);
    pan.y = clampPan(drag.panY + dy, layout.height, pan.height);
    applyPan();
  });
  const endDrag = (event: PointerEvent): void => {
    if (drag === null || drag.pointer !== event.pointerId) return;
    suppressClick = drag.moved;
    drag = null;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointerleave', (event: PointerEvent): void => {
    if (drag !== null && drag.pointer === event.pointerId && !drag.moved) drag = null;
  });
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener(
    'click',
    (event: MouseEvent): void => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
    },
    true,
  );

  const views: NodeView[] = [];
  for (const node of nodes) {
    const centre: TreePoint | undefined = layout.centres.get(node.id);
    if (centre === undefined) continue;
    const button: HTMLButtonElement = el('button', `tree-socket ${node.kind} locked`, board);
    button.type = 'button';
    button.setAttribute('aria-label', node.name);
    button.style.left = `${centre.x}px`;
    button.style.top = `${centre.y}px`;
    el('span', 'tree-socket-rim', button);
    el('span', 'tree-socket-well', button);
    el('span', 'tree-socket-fill', button);
    const glyph: HTMLSpanElement = el('span', 'tree-socket-glyph', button);
    glyph.innerHTML = treeGlyph(node.icon);
    const view: NodeView = { def: node, button };
    button.addEventListener('pointerenter', (): void => {
      if (drag === null || !drag.moved) showTip(view);
    });
    button.addEventListener('pointerleave', (): void => {
      if (hovered === view) hideTip();
    });
    button.addEventListener('focus', (): void => showTip(view));
    button.addEventListener('blur', (): void => {
      if (hovered === view) hideTip();
    });
    button.addEventListener('click', (): void => {
      const status: TreeNodeStatus = statusOf(node);
      switch (status.kind) {
        case 'available':
          context.api.send({ type: 'allocate', node: node.id });
          break;
        case 'no_points':
        case 'locked':
          retrigger(button, 'deny');
          retrigger(tip, 'deny');
          break;
        case 'allocated':
          break;
      }
    });
    views.push(view);
  }

  window.addEventListener('resize', (): void => {
    if (!element.classList.contains('open')) return;
    fitViewport();
    if (hovered !== null) placeTip(hovered);
  });

  new MutationObserver((): void => {
    if (!element.classList.contains('open')) hideTip();
  }).observe(element, { attributes: true, attributeFilter: ['class'] });

  return {
    element,
    refresh(): void {
      const player = context.api.world.player;
      fitViewport();
      setText(pointCount, String(player.skillPoints), true);
      setText(pointWord, player.skillPoints === 1 ? 'point' : 'points', false);
      points.classList.toggle('spendable', player.skillPoints > 0);
      for (const view of views) {
        const status: TreeNodeStatus = statusOf(view.def);
        for (const name of STATUS_CLASSES) view.button.classList.toggle(name, name === status.kind);
      }
      for (const link of links) {
        const fromAllocated: boolean = player.allocated.includes(link.from);
        const toAllocated: boolean = player.allocated.includes(link.to);
        link.path.classList.toggle('lit', fromAllocated && toAllocated);
        link.path.classList.toggle('open', fromAllocated && !toAllocated);
      }
      if (hovered !== null) fillTip(hovered);
    },
  };
}

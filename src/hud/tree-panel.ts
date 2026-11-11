import type { SkillTreeNodeDef } from '../../sim/content/types.ts';
import { canAllocate, findNode, requirementsMet } from '../../sim/progression.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import { attachTooltip } from './tooltip.ts';

const TREE = {
  cell: 88,
  node: 52,
  pad: 20,
  svgNamespace: 'http://www.w3.org/2000/svg',
} as const;

interface NodeView {
  readonly def: SkillTreeNodeDef;
  readonly button: HTMLElement;
}

interface LinkView {
  readonly line: SVGLineElement;
  readonly from: string;
  readonly to: string;
}

export function createTreePanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel left', parent);
  label('panel-title', 'Skills', element);
  const points: HTMLDivElement = el('div', 'tree-points', element);
  const nodes: readonly SkillTreeNodeDef[] = context.api.world.content.skillTree;
  const columns: number[] = nodes.map((node: SkillTreeNodeDef): number => node.column);
  const rows: number[] = nodes.map((node: SkillTreeNodeDef): number => node.row);
  const minColumn: number = Math.min(0, ...columns);
  const minRow: number = Math.min(0, ...rows);
  const maxColumn: number = Math.max(0, ...columns);
  const maxRow: number = Math.max(0, ...rows);
  const board: HTMLDivElement = el('div', 'tree-board', element);
  board.style.width = `${(maxColumn - minColumn) * TREE.cell + TREE.node + TREE.pad * 2}px`;
  board.style.height = `${(maxRow - minRow) * TREE.cell + TREE.node + TREE.pad * 2 + TREE.pad}px`;
  const svg: SVGSVGElement = document.createElementNS(TREE.svgNamespace, 'svg');
  svg.setAttribute('class', 'tree-lines');
  board.appendChild(svg);

  const centre = (node: SkillTreeNodeDef): { readonly x: number; readonly y: number } => ({
    x: TREE.pad + (node.column - minColumn) * TREE.cell + TREE.node / 2,
    y: TREE.pad + (node.row - minRow) * TREE.cell + TREE.node / 2,
  });

  const links: LinkView[] = [];
  for (const node of nodes) {
    for (const requiredId of node.requires) {
      const required: SkillTreeNodeDef | null = findNode(context.api.world.content, requiredId);
      if (required === null) continue;
      const from = centre(required);
      const to = centre(node);
      const line: SVGLineElement = document.createElementNS(TREE.svgNamespace, 'line');
      line.setAttribute('class', 'tree-link');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      svg.appendChild(line);
      links.push({ line, from: required.id, to: node.id });
    }
  }

  const describeState = (node: SkillTreeNodeDef): string => {
    const player = context.api.world.player;
    if (player.allocated.includes(node.id)) return 'Allocated';
    if (!requirementsMet(node, player.allocated)) {
      const names: string[] = node.requires.map((id: string): string => findNode(context.api.world.content, id)?.name ?? id);
      return `Requires: ${names.join(node.requireMode === 'all' ? ', ' : ' or ')}`;
    }
    return player.skillPoints > 0 ? 'Click to learn' : 'No skill points';
  };

  const nodeTooltip = (node: SkillTreeNodeDef): HTMLElement => {
    const root: HTMLDivElement = el('div', 'tip', null);
    label('tip-title tree', node.name, root);
    label('tip-line', node.description, root);
    el('div', 'tip-sep', root);
    label('tip-hint', describeState(node), root);
    return root;
  };

  const views: NodeView[] = nodes.map((node: SkillTreeNodeDef): NodeView => {
    const position = centre(node);
    const holder: HTMLDivElement = el('div', 'tree-node-holder', board);
    holder.style.left = `${position.x - TREE.cell / 2}px`;
    holder.style.top = `${position.y - TREE.node / 2}px`;
    const button: HTMLButtonElement = el('button', 'tree-node locked', holder);
    button.type = 'button';
    button.innerHTML = iconSvg(node.icon);
    label('tree-node-name', node.name, holder);
    attachTooltip(context.tooltip, button, (): HTMLElement => nodeTooltip(node));
    button.addEventListener('click', (): void => {
      const player = context.api.world.player;
      if (!canAllocate(context.api.world.content, player.allocated, player.skillPoints, node.id)) return;
      context.tooltip.hide();
      context.api.send({ type: 'allocate', node: node.id });
    });
    return { def: node, button };
  });

  return {
    element,
    refresh(): void {
      const player = context.api.world.player;
      setText(points, `Skill points: ${player.skillPoints}`, true);
      for (const view of views) {
        const allocated: boolean = player.allocated.includes(view.def.id);
        const available: boolean = canAllocate(context.api.world.content, player.allocated, player.skillPoints, view.def.id);
        view.button.classList.toggle('allocated', allocated);
        view.button.classList.toggle('available', available);
        view.button.classList.toggle('locked', !allocated && !available);
      }
      for (const link of links) {
        const fromAllocated: boolean = player.allocated.includes(link.from);
        const toAllocated: boolean = player.allocated.includes(link.to);
        link.line.classList.toggle('lit', fromAllocated && toAllocated);
        link.line.classList.toggle('open', fromAllocated && !toAllocated);
      }
    },
  };
}

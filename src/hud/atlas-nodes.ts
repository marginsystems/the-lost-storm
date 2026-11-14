import type { ZoneMark } from '../../sim/world/atlas.ts';
import { fixed } from './atlas-geometry.ts';
import { svg } from './svg.ts';

export const NODE = {
  radius: { town: 19, wild: 13, boss: 17, void: 15 },
  discInset: 4,
  wayGap: 6,
  wayTick: 5,
  haloGap: 4,
  hitPad: 12,
  nameGap: 21,
  spikes: 8,
  spikeLength: 6,
  spikeHalf: 0.16,
  marks: {
    town: 'M-7 7V-3H-4.6V-7H-1.6V-3H1.6V-7H4.6V-3H7V7H2.2V2.4H-2.2V7Z',
    wild: 'M0 -5.4L5.4 0L0 5.4L-5.4 0Z',
    boss: 'M-7.5 5.5L-7.5 -5L-3.4 -0.6L0 -7.4L3.4 -0.6L7.5 -5L7.5 5.5Z',
    void: 'M0 -6.5A6.5 6.5 0 1 1 0 6.5A6.5 6.5 0 1 1 0 -6.5ZM0 -3.4A3.4 3.4 0 1 0 0 3.4A3.4 3.4 0 1 0 0 -3.4Z',
  },
} as const;

export interface NodeParts {
  readonly group: SVGGElement;
  readonly name: SVGTextElement;
  readonly radius: number;
}

function point(turn: number, reach: number): string {
  return `${fixed(Math.sin(turn) * reach)} ${fixed(-Math.cos(turn) * reach)}`;
}

function spikes(radius: number): string {
  const parts: string[] = [];
  for (let index: number = 0; index < NODE.spikes; index += 1) {
    const angle: number = (index * 2 * Math.PI) / NODE.spikes;
    parts.push(`M${point(angle - NODE.spikeHalf, radius)}L${point(angle, radius + NODE.spikeLength)}L${point(angle + NODE.spikeHalf, radius)}Z`);
  }
  return parts.join('');
}

function wayTicks(radius: number): string {
  const inner: number = radius - NODE.wayTick / 2;
  const outer: number = radius + NODE.wayTick / 2;
  return `M0 ${-inner}V${-outer}M0 ${inner}V${outer}M${-inner} 0H${-outer}M${inner} 0H${outer}`;
}

export function drawNode(parent: Element, mark: ZoneMark, waypoint: boolean, x: number, y: number): NodeParts {
  const radius: number = NODE.radius[mark];
  const group: SVGGElement = svg('g', `atlas-node ${mark}`, parent, { transform: `translate(${x} ${y})` });
  const body: SVGGElement = svg('g', 'atlas-node-body', group, {});
  svg('circle', 'atlas-hit', body, { r: radius + NODE.hitPad });
  svg('circle', 'atlas-halo', body, { r: radius + NODE.haloGap });
  if (waypoint) {
    const way: SVGGElement = svg('g', 'atlas-way', body, {});
    svg('circle', '', way, { r: radius + NODE.wayGap });
    svg('path', '', way, { d: wayTicks(radius + NODE.wayGap) });
  }
  if (mark === 'boss') svg('path', 'atlas-spikes', body, { d: spikes(radius) });
  svg('circle', 'atlas-ring', body, { r: radius });
  svg('circle', 'atlas-disc', body, { r: radius - NODE.discInset });
  svg('path', 'atlas-mark', body, { d: NODE.marks[mark] });
  const name: SVGTextElement = svg('text', 'atlas-name', group, { y: radius + (waypoint ? NODE.wayGap : 0) + NODE.nameGap, 'text-anchor': 'middle' });
  return { group, name, radius };
}

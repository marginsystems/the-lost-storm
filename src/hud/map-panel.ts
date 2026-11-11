import type { MapPlace, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { canTeleport, onWaypoint } from '../../sim/world/waypoints.ts';
import type { World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';

const MAP = {
  cellX: 176,
  cellY: 96,
  nodeWidth: 150,
  nodeHeight: 46,
  pad: 22,
  unknownName: '?',
  svgNamespace: 'http://www.w3.org/2000/svg',
  hintAway: 'Stand on a waypoint to travel',
  hintReady: 'Choose a waypoint',
  hintNone: 'No other waypoint found yet',
} as const;

interface NodeView {
  readonly zone: ZoneDef;
  readonly button: HTMLButtonElement;
  readonly name: HTMLElement;
}

interface Way {
  readonly from: ZoneDef;
  readonly exit: ZoneExit;
}

interface LinkView {
  readonly line: SVGLineElement;
  readonly ways: Way[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MapPanel extends PanelView {
  update(): void;
}

export function createMapPanel(parent: HTMLElement, context: HudContext, close: () => void): MapPanel {
  const world: World = context.api.world;
  const element: HTMLDivElement = el('div', 'hud-panel centre', parent);
  label('panel-title', 'World', element);
  const places: readonly MapPlace[] = world.content.world.map;
  const minX: number = Math.min(0, ...places.map((place: MapPlace): number => place.x));
  const minY: number = Math.min(0, ...places.map((place: MapPlace): number => place.y));
  const maxX: number = Math.max(0, ...places.map((place: MapPlace): number => place.x));
  const maxY: number = Math.max(0, ...places.map((place: MapPlace): number => place.y));
  const board: HTMLDivElement = el('div', 'map-board', element);
  board.style.width = `${(maxX - minX) * MAP.cellX + MAP.nodeWidth + MAP.pad * 2}px`;
  board.style.height = `${(maxY - minY) * MAP.cellY + MAP.nodeHeight + MAP.pad * 2}px`;
  const svg: SVGSVGElement = document.createElementNS(MAP.svgNamespace, 'svg');
  svg.setAttribute('class', 'map-links');
  board.appendChild(svg);
  const hint: HTMLDivElement = el('div', 'map-hint', element);

  const centre = (place: MapPlace): Point => ({ x: MAP.pad + (place.x - minX) * MAP.cellX + MAP.nodeWidth / 2, y: MAP.pad + (place.y - minY) * MAP.cellY + MAP.nodeHeight / 2 });
  const placeOf = (zoneId: string): MapPlace | undefined => places.find((place: MapPlace): boolean => place.zone === zoneId);

  const links: LinkView[] = [];
  const drawn: Map<string, LinkView> = new Map<string, LinkView>();
  for (const zone of world.content.zones.values()) {
    for (const exit of zone.exits) {
      const key: string = zone.id < exit.to ? `${zone.id}|${exit.to}` : `${exit.to}|${zone.id}`;
      const from: MapPlace | undefined = placeOf(zone.id);
      const to: MapPlace | undefined = placeOf(exit.to);
      const known: LinkView | undefined = drawn.get(key);
      if (known !== undefined) {
        known.ways.push({ from: zone, exit });
        continue;
      }
      if (from === undefined || to === undefined) continue;
      const line: SVGLineElement = document.createElementNS(MAP.svgNamespace, 'line');
      const a: Point = centre(from);
      const b: Point = centre(to);
      line.setAttribute('class', 'map-link');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      svg.appendChild(line);
      const link: LinkView = { line, ways: [{ from: zone, exit }] };
      drawn.set(key, link);
      links.push(link);
    }
  }

  const nodes: NodeView[] = [];
  for (const place of places) {
    const zone: ZoneDef | undefined = world.content.zones.get(place.zone);
    if (zone === undefined) continue;
    const button: HTMLButtonElement = el('button', 'map-node', board);
    button.type = 'button';
    const at: Point = centre(place);
    button.style.left = `${at.x - MAP.nodeWidth / 2}px`;
    button.style.top = `${at.y - MAP.nodeHeight / 2}px`;
    button.style.width = `${MAP.nodeWidth}px`;
    button.style.height = `${MAP.nodeHeight}px`;
    const name: HTMLDivElement = el('div', 'map-name', button);
    el('i', 'map-waypoint', button);
    button.addEventListener('click', (): void => {
      if (!canTeleport(world, zone.id)) return;
      context.api.send({ type: 'teleport', zone: zone.id });
      close();
    });
    nodes.push({ zone, button, name });
  }

  const zones: readonly ZoneDef[] = [...world.content.zones.values()];
  const neighbours = (zone: ZoneDef): boolean => zones.some((other: ZoneDef): boolean => world.visited.includes(other.id) && other.exits.some((exit: ZoneExit): boolean => exit.to === zone.id));

  const refresh = (): void => {
    const standing: boolean = onWaypoint(world);
    let reachable: number = 0;
    for (const node of nodes) {
      const visited: boolean = world.visited.includes(node.zone.id);
      const travel: boolean = canTeleport(world, node.zone.id);
      if (travel) reachable += 1;
      setText(node.name, visited ? node.zone.name : MAP.unknownName, false);
      node.button.classList.toggle('shown', visited || neighbours(node.zone));
      node.button.classList.toggle('unknown', !visited);
      node.button.classList.toggle('town', visited && node.zone.kind === 'town');
      node.button.classList.toggle('here', node.zone.id === world.zone.id);
      node.button.classList.toggle('marked', world.waypoints.includes(node.zone.id));
      node.button.classList.toggle('travel', travel);
    }
    for (const link of links) {
      const usable: Way[] = link.ways.filter((way: Way): boolean => world.visited.includes(way.from.id));
      link.line.classList.toggle('shown', usable.length > 0);
      link.line.classList.toggle('locked', !usable.some((way: Way): boolean => allHold(world, way.exit.requires)));
    }
    setText(hint, !standing ? MAP.hintAway : reachable > 0 ? MAP.hintReady : MAP.hintNone, true);
  };

  return { element, refresh, update: refresh };
}

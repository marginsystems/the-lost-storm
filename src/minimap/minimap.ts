import type { ZoneExit } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { nearestWalkable } from '../../sim/nav/grid.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { el, setText } from '../hud/dom.ts';
import { CAMERA } from '../render/iso-camera.ts';
import type { MapLayer } from './layer.ts';
import { createMapLayer } from './layer.ts';
import { drawMarks, exitAt } from './marks.ts';
import minimapCss from './minimap.css?inline';
import type { MapMatrix } from './projection.ts';
import { mapMatrix, toWorld } from './projection.ts';
import type { ElementSize } from '../render/element-size.ts';
import { watchSize } from '../render/element-size.ts';

export const MINIMAP = {
  zoomStart: 3.6,
  zoomMin: 1.6,
  zoomMax: 9,
  zoomStep: 0.0018,
  zoomRate: 14,
  overlayExtent: 0.86,
  overlayAlpha: 0.6,
  overlayUnit: 1.6,
  holdInterval: 0.09,
  snapRadius: 5,
  maxPixelRatio: 2,
  settleMs: 760,
} as const;

export type MinimapMode = 'corner' | 'overlay';

export interface MinimapHooks {
  readonly world: World;
  send(command: Command): void;
  clickMarker(x: number, z: number, hostile: boolean): void;
  isToggleKey(code: string): boolean;
}

export interface Minimap {
  update(dt: number): void;
  readonly mode: MinimapMode;
}

interface Surface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly size: ElementSize;
  width: number;
  height: number;
  ratio: number;
}

function surface(canvas: HTMLCanvasElement): Surface {
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (context === null) throw new Error('The minimap needs a 2D canvas');
  return { canvas, context, size: watchSize(canvas), width: 0, height: 0, ratio: 1 };
}

function fit(target: Surface): void {
  const width: number = target.size.width;
  const height: number = target.size.height;
  const ratio: number = Math.min(MINIMAP.maxPixelRatio, window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);
  if (width === target.width && height === target.height && ratio === target.ratio) return;
  target.width = width;
  target.height = height;
  target.ratio = ratio;
  target.canvas.width = Math.max(1, Math.round(width * ratio));
  target.canvas.height = Math.max(1, Math.round(height * ratio));
}

const SQUASH: number = Math.sin((CAMERA.pitchDegrees * Math.PI) / 180);

export function createMinimap(root: HTMLElement, hooks: MinimapHooks): Minimap {
  const style: HTMLStyleElement = el('style', '', root);
  style.textContent = minimapCss;
  const holder: HTMLDivElement = el('div', 'minimap', root);
  const corner: HTMLDivElement = el('div', 'minimap-corner', holder);
  const zoneName: HTMLDivElement = el('div', 'minimap-zone', corner);
  const frame: HTMLDivElement = el('div', 'minimap-frame', corner);
  const cornerSurface: Surface = surface(el('canvas', 'minimap-canvas', frame));
  const overlay: HTMLDivElement = el('div', 'minimap-overlay', holder);
  const overlaySurface: Surface = surface(el('canvas', 'minimap-canvas', overlay));
  const layer: MapLayer = createMapLayer();
  const world: World = hooks.world;
  let mode: MinimapMode = 'corner';
  let zoom: number = MINIMAP.zoomStart;
  let wantedZoom: number = MINIMAP.zoomStart;
  let settling: number = 0;
  let cornerMatrix: MapMatrix | null = null;
  let dragging: number | null = null;
  let holdTimer: number = 0;
  let lastPointer: { readonly x: number; readonly y: number } | null = null;

  const setMode = (next: MinimapMode): void => {
    if (mode === next) return;
    mode = next;
    holder.classList.toggle('overlay', next === 'overlay');
    root.classList.toggle('minimap-overlaid', next === 'overlay');
    settling = MINIMAP.settleMs / 1000;
    if (next === 'overlay') dragging = null;
  };

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!hooks.isToggleKey(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    setMode(mode === 'corner' ? 'overlay' : 'corner');
  });

  frame.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      wantedZoom = Math.min(MINIMAP.zoomMax, Math.max(MINIMAP.zoomMin, wantedZoom * (1 - event.deltaY * MINIMAP.zoomStep)));
    },
    { passive: false },
  );

  const pointAt = (clientX: number, clientY: number): Vec2 | null => {
    if (cornerMatrix === null) return null;
    const rect: DOMRect = cornerSurface.canvas.getBoundingClientRect();
    const spot = toWorld(cornerMatrix, clientX - rect.left, clientY - rect.top);
    return { x: spot.x, z: spot.z };
  };

  const steer = (held: boolean): void => {
    if (lastPointer === null || world.dialogue !== null) return;
    const spot: Vec2 | null = pointAt(lastPointer.x, lastPointer.y);
    if (spot === null) return;
    const exit: ZoneExit | null = exitAt(world, spot.x, spot.z);
    if (exit !== null) {
      dragging = null;
      if (held) return;
      hooks.send({ type: 'travel', exit: exit.id });
      hooks.clickMarker(exit.x, exit.z, false);
      return;
    }
    const dest: Vec2 | null = nearestWalkable(world.grid, spot, MINIMAP.snapRadius);
    if (dest === null) return;
    hooks.send({ type: 'move', held, dest });
    if (!held) hooks.clickMarker(dest.x, dest.z, false);
  };

  frame.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (event.button !== 0 || mode !== 'corner') return;
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    dragging = event.pointerId;
    lastPointer = { x: event.clientX, y: event.clientY };
    holdTimer = MINIMAP.holdInterval;
    steer(false);
  });
  frame.addEventListener('pointermove', (event: PointerEvent): void => {
    if (dragging === event.pointerId) lastPointer = { x: event.clientX, y: event.clientY };
  });
  const release = (event: PointerEvent): void => {
    if (dragging === event.pointerId) dragging = null;
  };
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  frame.addEventListener('contextmenu', (event: MouseEvent): void => event.preventDefault());

  const paint = (target: Surface, matrix: MapMatrix, unit: number, edgeArrows: boolean, alpha: number): void => {
    fit(target);
    const context: CanvasRenderingContext2D = target.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, target.canvas.width, target.canvas.height);
    context.globalAlpha = alpha;
    context.setTransform(target.ratio, 0, 0, target.ratio, 0, 0);
    context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(layer.canvas, 0, 0, layer.width, layer.height);
    context.globalAlpha = 1;
    context.setTransform(target.ratio, 0, 0, target.ratio, 0, 0);
    drawMarks(context, matrix, world, { width: target.width, height: target.height, unit, edgeArrows });
  };

  const drawCorner = (): void => {
    cornerMatrix = mapMatrix({ scale: zoom, squash: SQUASH, centreX: cornerSurface.width / 2, centreY: cornerSurface.height / 2, focusX: world.player.pos.x, focusZ: world.player.pos.z });
    paint(cornerSurface, cornerMatrix, 1, true, 1);
  };

  const drawOverlay = (): void => {
    const width: number = overlaySurface.size.width;
    const height: number = overlaySurface.size.height;
    const extent: number = Math.max(layer.width, layer.height, 1);
    const scale: number = (Math.min(width, height) * MINIMAP.overlayExtent) / extent;
    const matrix: MapMatrix = mapMatrix({ scale, squash: SQUASH, centreX: width / 2, centreY: height / 2, focusX: world.player.pos.x, focusZ: world.player.pos.z });
    paint(overlaySurface, matrix, MINIMAP.overlayUnit, false, MINIMAP.overlayAlpha);
  };

  return {
    get mode(): MinimapMode {
      return mode;
    },
    update(dt: number): void {
      layer.refresh(world);
      setText(zoneName, world.zone.name, true);
      zoom += (wantedZoom - zoom) * (1 - Math.exp(-MINIMAP.zoomRate * dt));
      settling = Math.max(0, settling - dt);
      if (dragging !== null) {
        holdTimer -= dt;
        if (holdTimer <= 0) {
          holdTimer = MINIMAP.holdInterval;
          steer(true);
        }
      }
      if (mode === 'corner' || settling > 0) drawCorner();
      if (mode === 'overlay' || settling > 0) drawOverlay();
    },
  };
}

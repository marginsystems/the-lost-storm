import type { Scene } from 'three';
import { Color, Mesh, RingGeometry, Vector2 } from 'three';
import type { MeshBasicMaterial } from 'three';
import type { ObjectiveTarget } from '../../sim/world/objective.ts';
import { objectiveTarget } from '../../sim/world/objective.ts';
import type { World } from '../../sim/world/types.ts';
import { el } from '../hud/dom.ts';
import { additive, glow } from '../render/effect-shapes.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { arrowToward } from './arrow-geometry.ts';
import type { ArrowPlacement, Point, Rect } from './arrow-geometry.ts';
import css from './objective.css?inline';

export const OBJECTIVE = {
  color: 0xe8b866,
  ringInner: 0.88,
  ringOpacity: 0.55,
  pulseSpeed: 2.4,
  pulseDepth: 0.25,
  lift: 0.09,
  segments: 48,
  ease: 6,
  screenMargin: 56,
  hudGap: 14,
  hudReadSeconds: 0.25,
  hudBlockers: ['.hud-bottom', '.hud-globe-group', '.hud-flask', '.minimap', '.hud-quests', '.hud-top'],
} as const;

function hudRects(hud: HTMLElement): Rect[] {
  const rects: Rect[] = [];
  for (const selector of OBJECTIVE.hudBlockers) {
    for (const element of hud.querySelectorAll(selector)) {
      const box: DOMRect = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    }
  }
  return rects;
}

export interface ObjectiveMarker {
  update(dt: number, time: number, world: World): void;
}

function sameSpot(a: ObjectiveTarget | null, b: ObjectiveTarget | null): boolean {
  return a !== null && b !== null && a.objective.id === b.objective.id && a.kind === b.kind;
}

export function createObjectiveMarker(scene: Scene, camera: IsoCamera, hud: HTMLElement): ObjectiveMarker {
  const style: HTMLStyleElement = el('style', '', hud);
  style.textContent = css;
  const ring: Mesh<RingGeometry, MeshBasicMaterial> = new Mesh(new RingGeometry(OBJECTIVE.ringInner, 1, OBJECTIVE.segments), additive(glow(new Color(OBJECTIVE.color), 1.6), 0));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.visible = false;
  scene.add(ring);
  const arrow: HTMLDivElement = el('div', 'objective-arrow', hud);
  el('div', 'objective-arrow-head', arrow);
  const screen: Vector2 = new Vector2();
  const project = (x: number, y: number, z: number): Point | null => (camera.project(x, y, z, screen) ? { x: screen.x, y: screen.y } : null);
  let blockers: Rect[] = [];
  let sinceRead: number = Infinity;
  let previous: ObjectiveTarget | null = null;
  let level: number = 0;

  return {
    update(dt: number, time: number, world: World): void {
      const target: ObjectiveTarget | null = world.player.alive ? objectiveTarget(world) : null;
      if (!sameSpot(previous, target)) level = 0;
      previous = target;
      const goal: number = target === null ? 0 : 1;
      level += (goal - level) * (1 - Math.exp(-OBJECTIVE.ease * dt));
      if (target !== null) {
        ring.position.set(target.pos.x, world.zone.floorHeight + OBJECTIVE.lift, target.pos.z);
        ring.scale.setScalar(target.radius);
      }
      ring.visible = level > 0.01;
      ring.material.opacity = level * OBJECTIVE.ringOpacity * (1 + Math.sin(time * OBJECTIVE.pulseSpeed) * OBJECTIVE.pulseDepth);
      let placement: ArrowPlacement | null = null;
      sinceRead += dt;
      if (target !== null) {
        if (sinceRead >= OBJECTIVE.hudReadSeconds) {
          blockers = hudRects(hud);
          sinceRead = 0;
        }
        placement = arrowToward(project, world.player.pos, target.pos, world.zone.floorHeight, { width: window.innerWidth, height: window.innerHeight, margin: OBJECTIVE.screenMargin, gap: OBJECTIVE.hudGap, blockers });
      }
      arrow.classList.toggle('visible', placement !== null);
      if (placement !== null) arrow.style.transform = `translate(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px) rotate(${placement.angle.toFixed(3)}rad)`;
    },
  };
}

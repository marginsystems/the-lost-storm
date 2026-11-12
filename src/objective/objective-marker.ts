import type { Scene } from 'three';
import { Color, Vector2 } from 'three';
import type { ObjectiveTarget } from '../../sim/world/objective.ts';
import { objectiveTarget } from '../../sim/world/objective.ts';
import type { World } from '../../sim/world/types.ts';
import { el } from '../hud/dom.ts';
import type { GroundGlow } from '../render/ground-glow.ts';
import { createGroundGlow } from '../render/ground-glow.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { arrowToward } from './arrow-geometry.ts';
import type { ArrowPlacement, Point, Rect } from './arrow-geometry.ts';
import css from './objective.css?inline';
import type { LabelGlide } from '../render/label-glide.ts';
import { createGlide, glideToward } from '../render/label-glide.ts';

export const OBJECTIVE = {
  color: 0xe8b866,
  glowStrength: 0.16,
  pulseSpeed: 2.4,
  pulseDepth: 0.25,
  lift: 0.09,
  ease: 6,
  screenMargin: 56,
  hudGap: 14,
  hudReadSeconds: 0.25,
  hudBlockers: ['.hud-bottom', '.hud-globe-group', '.minimap', '.hud-quests', '.hud-top'],
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
  const glow: GroundGlow = createGroundGlow(new Color(OBJECTIVE.color));
  glow.mesh.renderOrder = 5;
  glow.mesh.visible = false;
  scene.add(glow.mesh);
  const arrow: HTMLDivElement = el('div', 'objective-arrow', hud);
  el('div', 'objective-arrow-head', arrow);
  const screen: Vector2 = new Vector2();
  const project = (x: number, y: number, z: number): Point | null => (camera.project(x, y, z, screen) ? { x: screen.x, y: screen.y } : null);
  let blockers: Rect[] = [];
  let sinceRead: number = Infinity;
  let previous: ObjectiveTarget | null = null;
  let level: number = 0;
  const glide: LabelGlide = createGlide();

  return {
    update(dt: number, time: number, world: World): void {
      const target: ObjectiveTarget | null = world.player.alive ? objectiveTarget(world) : null;
      if (!sameSpot(previous, target)) level = 0;
      previous = target;
      const goal: number = target === null ? 0 : 1;
      level += (goal - level) * (1 - Math.exp(-OBJECTIVE.ease * dt));
      if (target !== null) glow.place(target.pos.x, world.zone.floorHeight + OBJECTIVE.lift, target.pos.z, target.radius);
      glow.mesh.visible = level > 0.01;
      glow.set(level * OBJECTIVE.glowStrength * (1 + Math.sin(time * OBJECTIVE.pulseSpeed) * OBJECTIVE.pulseDepth), time);
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
      if (placement === null) glide.started = false;
      else {
        glideToward(glide, placement.x, placement.y, dt);
        arrow.style.transform = `translate(${glide.x.toFixed(2)}px, ${glide.y.toFixed(2)}px) rotate(${placement.angle.toFixed(3)}rad)`;
      }
    },
  };
}

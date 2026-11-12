import type { Scene } from 'three';
import { Color, Mesh, RingGeometry, Vector2 } from 'three';
import type { MeshBasicMaterial } from 'three';
import type { ObjectiveTarget } from '../../sim/world/objective.ts';
import { objectiveTarget } from '../../sim/world/objective.ts';
import type { World } from '../../sim/world/types.ts';
import { el } from '../hud/dom.ts';
import { additive, glow } from '../render/effect-shapes.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { arrowPlacement } from './arrow-geometry.ts';
import type { ArrowPlacement } from './arrow-geometry.ts';
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
  barGap: 12,
} as const;

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
      if (target !== null) {
        camera.project(target.pos.x, world.zone.floorHeight, target.pos.z, screen);
        const bar: Element | null = hud.querySelector('.hud-bottom');
        const barTop: number = bar === null ? window.innerHeight : bar.getBoundingClientRect().top;
        placement = arrowPlacement(screen, window.innerWidth, window.innerHeight, OBJECTIVE.screenMargin, Math.max(OBJECTIVE.screenMargin, window.innerHeight - barTop + OBJECTIVE.barGap));
      }
      arrow.classList.toggle('visible', placement !== null);
      if (placement !== null) arrow.style.transform = `translate(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px) rotate(${placement.angle.toFixed(3)}rad)`;
    },
  };
}

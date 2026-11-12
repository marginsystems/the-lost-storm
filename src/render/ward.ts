import type { Scene } from 'three';
import { Color } from 'three';
import type { World } from '../../sim/world/types.ts';
import { pillarMesh } from './effect-shapes.ts';

export const WARD = {
  color: 0xffd58a,
  radius: 0.95,
  height: 2.3,
  opacity: 0.2,
  pulseSpeed: 6,
  pulseDepth: 0.35,
  stiffness: 70,
  damping: 12,
  rest: 0.002,
} as const;

export interface Ward {
  update(dt: number, world: World): void;
}

export function createWard(scene: Scene): Ward {
  const mesh = pillarMesh(new Color(WARD.color), WARD.radius, WARD.height);
  mesh.visible = false;
  scene.add(mesh);
  let level: number = 0;
  let velocity: number = 0;
  let clock: number = 0;
  return {
    update(dt: number, world: World): void {
      const player = world.player;
      const target: number = player.alive && player.invulnerable > 0 ? 1 : 0;
      const step: number = Math.min(dt, 1 / 30);
      velocity += ((target - level) * WARD.stiffness - velocity * WARD.damping) * step;
      level += velocity * step;
      clock += dt;
      const visible: boolean = target > 0 || Math.abs(level) > WARD.rest;
      mesh.visible = visible;
      if (!visible) {
        level = 0;
        velocity = 0;
        return;
      }
      const pulse: number = 1 - WARD.pulseDepth + WARD.pulseDepth * Math.sin(clock * WARD.pulseSpeed);
      mesh.position.set(player.pos.x, WARD.height / 2, player.pos.z);
      mesh.material.opacity = Math.max(0, level) * WARD.opacity * pulse;
    },
  };
}

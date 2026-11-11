import { Vector2, Vector3 } from 'three';
import type { SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import type { Command, MonsterState, World } from '../sim/world/types.ts';
import type { Hud } from './hud/hud-api.ts';
import type { IsoCamera } from './render/iso-camera.ts';

export const INPUT = {
  pickRadius: 0.8,
  holdInterval: 0.09,
  leftBinding: 'mouse_left',
  rightBinding: 'mouse_right',
  inventoryKey: 'KeyI',
  treeKey: 'KeyT',
  closeKey: 'Escape',
} as const;

export interface InputHooks {
  heightOf(actorId: number): number;
  clickMarker(x: number, z: number, hostile: boolean): void;
}

export interface Input {
  collect(dt: number): Command[];
  readonly hoveredId: number | null;
}

export function createInput(canvas: HTMLCanvasElement, world: World, camera: IsoCamera, hud: Hud, hooks: InputHooks): Input {
  const pointer: Vector2 = new Vector2(0, 0);
  const bottom: Vector3 = new Vector3();
  const held: Set<string> = new Set<string>();
  const pressed: string[] = [];
  let hoveredId: number | null = null;
  let pointerInside: boolean = false;
  let holdTimer: number = 0;
  let shift: boolean = false;

  const slotFor = (binding: string): number => world.content.player.skillBar.findIndex((entry): boolean => entry.bindings.includes(binding));

  const press = (binding: string): void => {
    if (held.has(binding)) return;
    held.add(binding);
    pressed.push(binding);
  };

  const track = (event: PointerEvent | WheelEvent): void => {
    const rect: DOMRect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  };

  canvas.addEventListener('pointerdown', (event: PointerEvent): void => {
    track(event);
    shift = event.shiftKey;
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 0) press(INPUT.leftBinding);
    if (event.button === 2) press(INPUT.rightBinding);
  });
  canvas.addEventListener('pointermove', (event: PointerEvent): void => {
    track(event);
    shift = event.shiftKey;
    pointerInside = true;
  });
  canvas.addEventListener('pointerleave', (): void => {
    pointerInside = false;
  });
  const release = (event: PointerEvent): void => {
    if (event.button === 0) held.delete(INPUT.leftBinding);
    if (event.button === 2) held.delete(INPUT.rightBinding);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (event: MouseEvent): void => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      camera.zoomBy(event.deltaY);
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    if (event.repeat) return;
    if (event.code === INPUT.inventoryKey) hud.togglePanel('inventory');
    else if (event.code === INPUT.treeKey) hud.togglePanel('tree');
    else if (event.code === INPUT.closeKey) hud.closePanels();
    else press(event.code);
  });
  window.addEventListener('keyup', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    held.delete(event.code);
  });
  window.addEventListener('blur', (): void => {
    held.clear();
    shift = false;
  });

  const pick = (): MonsterState | null => {
    if (!pointerInside || hud.isPointerOverUi()) return null;
    let best: MonsterState | null = null;
    let bestGap: number = INPUT.pickRadius;
    for (const monster of world.monsters) {
      if (!monster.alive) continue;
      bottom.set(monster.pos.x, 0, monster.pos.z);
      const gap: number = camera.rayDistanceTo(pointer, bottom, hooks.heightOf(monster.id));
      if (gap < bestGap) {
        bestGap = gap;
        best = monster;
      }
    }
    return best;
  };

  const ready = (skill: SkillDef | undefined): boolean => {
    if (skill === undefined) return false;
    const player = world.player;
    return player.action === null && player.queued === null && (player.cooldowns[skill.id] ?? 0) <= 0 && player.mana >= skill.manaCost;
  };

  return {
    get hoveredId(): number | null {
      return hoveredId;
    },
    collect(dt: number): Command[] {
      const commands: Command[] = [];
      const target: MonsterState | null = pick();
      hoveredId = target?.id ?? null;
      canvas.style.cursor = target === null ? 'default' : 'crosshair';
      const groundHit: Vector3 | null = camera.groundPoint(pointer);
      const ground: Vec2 | null = groundHit === null ? null : { x: groundHit.x, z: groundHit.z };
      const aim: Vec2 | null = target === null ? ground : { x: target.pos.x, z: target.pos.z };
      const fresh: Set<string> = new Set<string>(pressed.splice(0, pressed.length));
      holdTimer -= dt;
      const holdTick: boolean = holdTimer <= 0;
      if (holdTick) holdTimer = INPUT.holdInterval;
      if (aim === null || ground === null) return commands;

      const leftSlot: number = slotFor(INPUT.leftBinding);
      const leftFresh: boolean = fresh.has(INPUT.leftBinding);
      if (leftFresh || (held.has(INPUT.leftBinding) && holdTick)) {
        if (target !== null) {
          commands.push({ type: 'skill', slot: leftSlot, aim, targetId: target.id });
          if (leftFresh) hooks.clickMarker(target.pos.x, target.pos.z, true);
        } else if (shift) {
          commands.push({ type: 'skill', slot: leftSlot, aim: ground, targetId: null });
        } else {
          commands.push({ type: 'move', dest: ground });
          if (leftFresh) hooks.clickMarker(ground.x, ground.z, false);
        }
      }

      world.content.player.skillBar.forEach((entry, slot: number): void => {
        for (const binding of entry.bindings) {
          if (binding === INPUT.leftBinding) continue;
          const isFresh: boolean = fresh.has(binding);
          if (!isFresh && !(held.has(binding) && ready(world.player.skills[slot]))) continue;
          commands.push({ type: 'skill', slot, aim, targetId: null });
          return;
        }
      });
      return commands;
    },
  };
}

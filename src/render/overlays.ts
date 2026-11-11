import { Vector2 } from 'three';
import type { ZoneDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { hasNews } from '../../sim/world/dialogue.ts';
import type { GroundItem, MonsterState, NpcState, World, WorldEvent } from '../../sim/world/types.ts';
import type { IsoCamera } from './iso-camera.ts';

export const OVERLAYS = {
  numberLife: 1,
  numberDrift: 26,
  barLift: 0.45,
  labelLift: 1.35,
  labelExit: 0.26,
  numberHeight: 0.75,
  exitLift: 2.6,
  npcLift: 0.5,
  waypointId: 'waypoint',
  waypointName: 'Waypoint',
} as const;

interface FloatingNumber {
  readonly element: HTMLDivElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  age: number;
}

interface HealthBar {
  readonly element: HTMLDivElement;
  readonly fill: HTMLElement;
  readonly chip: HTMLElement;
  ratio: number;
  shown: boolean;
}

interface LootLabel {
  readonly element: HTMLDivElement;
  readonly ground: GroundItem;
  leaving: number;
}

interface ExitLabel {
  readonly element: HTMLDivElement;
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly open: (world: World) => boolean;
}

interface NpcLabel {
  readonly element: HTMLDivElement;
  readonly npc: NpcState;
  news: boolean | null;
}

export interface OverlayHooks {
  heightOf(actorId: number): number;
  onPickup(groundId: number): void;
  onTravel(exit: string): void;
  onTalk(npcId: number): void;
  onWaypoint(): void;
}

export interface Overlays {
  handle(events: readonly WorldEvent[], world: World): void;
  update(dt: number, world: World, hoveredId: number | null): void;
  aimExit(exit: string | null): void;
}

function place(element: HTMLElement, point: Vector2): void {
  element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
}

export function createOverlays(root: HTMLElement, camera: IsoCamera, hooks: OverlayHooks): Overlays {
  const numbers: FloatingNumber[] = [];
  const bars: Map<number, HealthBar> = new Map<number, HealthBar>();
  const labels: Map<number, LootLabel> = new Map<number, LootLabel>();
  let exits: ExitLabel[] = [];
  let exitsOf: ZoneDef | null = null;
  let aimed: string | null = null;
  let people: NpcLabel[] = [];
  let peopleOf: readonly NpcState[] | null = null;
  const point: Vector2 = new Vector2();
  const barLayer: HTMLDivElement = document.createElement('div');
  const labelLayer: HTMLDivElement = document.createElement('div');
  const numberLayer: HTMLDivElement = document.createElement('div');
  for (const layer of [barLayer, labelLayer, numberLayer]) {
    layer.className = 'world-layer';
    root.append(layer);
  }
  const plate: HTMLDivElement = document.createElement('div');
  plate.className = 'name-plate';
  const plateName: HTMLSpanElement = document.createElement('span');
  const plateDetail: HTMLElement = document.createElement('small');
  plate.append(plateName, plateDetail);
  root.append(plate);
  let plateFor: number | null = null;

  const float = (text: string, kind: string, x: number, y: number, z: number): void => {
    const element: HTMLDivElement = document.createElement('div');
    element.className = `damage-number ${kind}`;
    const inner: HTMLSpanElement = document.createElement('span');
    inner.textContent = text;
    inner.style.setProperty('--drift', `${((Math.random() - 0.5) * 2 * OVERLAYS.numberDrift).toFixed(0)}px`);
    element.append(inner);
    numberLayer.append(element);
    numbers.push({ element, x, y, z, age: 0 });
  };

  const barFor = (monster: MonsterState): HealthBar => {
    const existing: HealthBar | undefined = bars.get(monster.id);
    if (existing !== undefined) return existing;
    const element: HTMLDivElement = document.createElement('div');
    element.className = 'health-bar';
    const chip: HTMLElement = document.createElement('i');
    chip.className = 'chip';
    const fill: HTMLElement = document.createElement('i');
    fill.className = 'fill';
    element.append(chip, fill);
    barLayer.append(element);
    const bar: HealthBar = { element, fill, chip, ratio: 1, shown: false };
    bars.set(monster.id, bar);
    return bar;
  };

  const labelFor = (world: World, ground: GroundItem): void => {
    if (ground.content.kind !== 'item' || labels.has(ground.id)) return;
    const element: HTMLDivElement = document.createElement('div');
    element.className = 'loot-label';
    const inner: HTMLSpanElement = document.createElement('span');
    inner.textContent = itemName(world.content, ground.content.item);
    inner.style.color = rarityOf(world.content, ground.content.item).color;
    element.append(inner);
    element.addEventListener('pointerdown', (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) hooks.onPickup(ground.id);
    });
    labelLayer.append(element);
    labels.set(ground.id, { element, ground, leaving: -1 });
  };

  const showExits = (world: World): void => {
    for (const label of exits) label.element.remove();
    exitsOf = world.zone;
    aimed = null;
    exits = world.zone.exits.map((exit): ExitLabel => {
      const element: HTMLDivElement = document.createElement('div');
      element.className = 'exit-label';
      const inner: HTMLSpanElement = document.createElement('span');
      inner.textContent = world.content.zones.get(exit.to)?.name ?? exit.to;
      element.append(inner);
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTravel(exit.id);
      });
      labelLayer.append(element);
      return { element, id: exit.id, x: exit.x, z: exit.z, open: (current: World): boolean => allHold(current, exit.requires) };
    });
    const waypoint = world.zone.waypoint;
    if (waypoint === null) return;
    const element: HTMLDivElement = document.createElement('div');
    element.className = 'exit-label waypoint';
    const inner: HTMLSpanElement = document.createElement('span');
    inner.textContent = OVERLAYS.waypointName;
    element.append(inner);
    element.addEventListener('pointerdown', (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) hooks.onWaypoint();
    });
    labelLayer.append(element);
    exits.push({ element, id: OVERLAYS.waypointId, x: waypoint.x, z: waypoint.z, open: (current: World): boolean => current.waypoints.includes(current.zone.id) });
  };

  const showPeople = (world: World): void => {
    for (const label of people) label.element.remove();
    peopleOf = world.npcs;
    people = world.npcs.map((npc: NpcState): NpcLabel => {
      const element: HTMLDivElement = document.createElement('div');
      element.className = 'npc-label';
      const inner: HTMLSpanElement = document.createElement('span');
      const news: HTMLElement = document.createElement('i');
      const name: HTMLElement = document.createElement('b');
      name.textContent = npc.def.name;
      const title: HTMLElement = document.createElement('small');
      title.textContent = npc.def.title;
      inner.append(news, name, title);
      element.append(inner);
      element.addEventListener('pointerdown', (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) hooks.onTalk(npc.id);
      });
      labelLayer.append(element);
      return { element, npc, news: null };
    });
  };

  return {
    aimExit(exit: string | null): void {
      if (exit === aimed) return;
      aimed = exit;
      for (const label of exits) label.element.classList.toggle('aimed', label.id === exit);
    },
    handle(events: readonly WorldEvent[], world: World): void {
      for (const event of events) {
        switch (event.type) {
          case 'damage': {
            const y: number = hooks.heightOf(event.targetId) * OVERLAYS.numberHeight;
            const kind: string = event.targetTeam === 'player' ? 'hurt' : event.crit ? 'crit' : '';
            float(event.crit ? `${event.amount}!` : `${event.amount}`, kind, event.pos.x, y, event.pos.z);
            break;
          }
          case 'drop':
            labelFor(world, event.ground);
            break;
          case 'pickup': {
            const label: LootLabel | undefined = labels.get(event.ground.id);
            if (label !== undefined) {
              label.leaving = OVERLAYS.labelExit;
              label.element.classList.add('taken');
            }
            if (event.ground.content.kind === 'gold') float(`+${event.ground.content.amount} gold`, 'gold', event.ground.pos.x, 1.2, event.ground.pos.z);
            break;
          }
          case 'xp':
          case 'skill_start':
          case 'skill_impact':
          case 'skill_interrupt':
          case 'projectile_spawn':
          case 'projectile_end':
          case 'death':
          case 'monster_spawn':
          case 'monster_remove':
          case 'aggro':
          case 'level_up':
          case 'surge':
          case 'surge_cleared':
          case 'player_respawn':
          case 'notice':
          case 'character_changed':
          case 'zone_changed':
          case 'checkpoint':
          case 'hero_step':
          case 'dialogue_line':
          case 'dialogue_closed':
          case 'quest_started':
          case 'quest_advanced':
          case 'quest_completed':
          case 'waypoint_unlocked':
          case 'exit_locked':
            break;
        }
      }
    },
    update(dt: number, world: World, hoveredId: number | null): void {
      if (exitsOf !== world.zone) showExits(world);
      for (const label of exits) {
        label.element.classList.toggle('locked', !label.open(world));
        camera.project(label.x, OVERLAYS.exitLift, label.z, point);
        place(label.element, point);
      }
      if (peopleOf !== world.npcs) showPeople(world);
      for (const label of people) {
        const news: boolean = hasNews(world, label.npc.def);
        if (news !== label.news) {
          label.news = news;
          label.element.classList.toggle('news', news);
        }
        label.element.classList.toggle('aimed', label.npc.id === hoveredId);
        camera.project(label.npc.pos.x, hooks.heightOf(label.npc.id) + OVERLAYS.npcLift, label.npc.pos.z, point);
        place(label.element, point);
      }

      for (let index: number = numbers.length - 1; index >= 0; index -= 1) {
        const number: FloatingNumber | undefined = numbers[index];
        if (number === undefined) continue;
        number.age += dt;
        if (number.age > OVERLAYS.numberLife) {
          number.element.remove();
          numbers.splice(index, 1);
          continue;
        }
        camera.project(number.x, number.y, number.z, point);
        place(number.element, point);
      }

      const alive: Set<number> = new Set<number>();
      let hovered: MonsterState | null = null;
      for (const monster of world.monsters) {
        if (monster.id === hoveredId && monster.alive) hovered = monster;
        const wanted: boolean = monster.alive && (monster.life < monster.maxLife || monster.id === hoveredId);
        if (!wanted && !bars.has(monster.id)) continue;
        alive.add(monster.id);
        const bar: HealthBar = barFor(monster);
        const ratio: number = Math.max(0, monster.life / monster.maxLife);
        if (ratio !== bar.ratio) {
          bar.ratio = ratio;
          bar.fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
          bar.chip.style.transform = `scaleX(${ratio.toFixed(3)})`;
        }
        if (wanted !== bar.shown) {
          bar.shown = wanted;
          bar.element.classList.toggle('shown', wanted);
        }
        camera.project(monster.pos.x, hooks.heightOf(monster.id) + OVERLAYS.barLift, monster.pos.z, point);
        place(bar.element, point);
      }
      for (const [id, bar] of bars) {
        if (alive.has(id)) continue;
        bar.element.remove();
        bars.delete(id);
      }

      for (const ground of world.ground) labelFor(world, ground);
      for (const [id, label] of labels) {
        if (label.leaving >= 0) {
          label.leaving -= dt;
          if (label.leaving <= 0) {
            label.element.remove();
            labels.delete(id);
            continue;
          }
        } else if (!world.ground.includes(label.ground)) {
          label.leaving = OVERLAYS.labelExit;
          label.element.classList.add('taken');
        }
        camera.project(label.ground.pos.x, OVERLAYS.labelLift, label.ground.pos.z, point);
        place(label.element, point);
      }

      const nextPlate: number | null = hovered?.id ?? null;
      if (nextPlate !== plateFor) {
        plateFor = nextPlate;
        plate.classList.toggle('shown', hovered !== null);
        if (hovered !== null) plateName.textContent = hovered.def.name;
      }
      if (hovered !== null) plateDetail.textContent = `Level ${hovered.level} · ${Math.ceil(hovered.life)} / ${hovered.maxLife}`;
    },
  };
}

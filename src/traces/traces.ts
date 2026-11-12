import type { Scene } from 'three';
import { Vector2 } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import { hudHidden } from '../../sim/world/hud.ts';
import type { World } from '../../sim/world/types.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { Echo, Mark, Marks, Tally, TracesClient } from '../backend/traces-api.ts';
import type { CharacterLibrary } from '../render/character-loader.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import type { Ghost } from './ghost.ts';
import { createGhost } from './ghost.ts';
import type { Anchor, Chance, MistClock, ReplayPose } from './mist.ts';
import { createMistClock, leftBehind, replayAt, shiftAnchor } from './mist.ts';
import type { EchoRecorder, EchoTake } from './recorder.ts';
import { createEchoRecorder, RECORDER } from './recorder.ts';
import tracesCss from './traces.css?inline';
import type { MarkVocabulary } from './words.ts';
import { countLine, markText } from './words.ts';

export const TRACE_VIEW = {
  nameNear: 5,
  nameLift: 0.5,
  markLift: 0.15,
  markSeenFar: 22,
  markSeenNear: 6,
  markOpacity: 0.7,
  goneSeconds: 1.6,
  countShowMs: 7000,
  swapFallbackMs: 400,
  countKey: 'the-lost-storm.traces.journal.v1',
  journalFlag: 'first_choice',
  journalTaken: 'took_journal',
} as const;

export interface TracesDeps {
  readonly world: World;
  readonly scene: Scene;
  readonly library: CharacterLibrary;
  readonly camera: IsoCamera;
  readonly hud: HTMLElement;
  readonly client: TracesClient;
  readonly vocabulary: MarkVocabulary;
  readonly store: KeyValueStore;
  readonly chance: Chance;
}

export interface Traces {
  update(dt: number): void;
}

type Pending = { readonly kind: 'echo'; readonly echo: Echo } | { readonly kind: 'mark'; readonly text: string };

interface ShownEcho {
  readonly kind: 'echo';
  readonly echo: Echo;
  readonly anchor: Anchor;
  readonly ghost: Ghost;
  readonly label: HTMLDivElement | null;
  time: number;
  gone: number;
  pos: Vec2;
}

interface ShownMark {
  readonly kind: 'mark';
  readonly anchor: Anchor;
  readonly label: HTMLDivElement;
  gone: number;
}

type Shown = ShownEcho | ShownMark;

function mixed(echoes: readonly Echo[], marks: readonly string[]): Pending[] {
  const queue: Pending[] = [];
  const longest: number = Math.max(echoes.length, marks.length);
  for (let index: number = 0; index < longest; index += 1) {
    const echo: Echo | undefined = echoes[index];
    const text: string | undefined = marks[index];
    if (echo !== undefined) queue.push({ kind: 'echo', echo });
    if (text !== undefined) queue.push({ kind: 'mark', text });
  }
  return queue;
}

function label(layer: HTMLElement, className: string, text: string): HTMLDivElement {
  const element: HTMLDivElement = document.createElement('div');
  element.className = className;
  element.textContent = text;
  element.setAttribute('aria-hidden', 'true');
  layer.append(element);
  return element;
}

function button(text: string): HTMLButtonElement {
  const element: HTMLButtonElement = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  return element;
}

export function createTraces(deps: TracesDeps): Traces {
  const { world, camera, client, vocabulary } = deps;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = tracesCss;
  deps.hud.append(style);
  const layer: HTMLDivElement = document.createElement('div');
  layer.className = 'traces-world';
  deps.hud.append(layer);
  const ui: HTMLDivElement = document.createElement('div');
  ui.className = 'traces-ui';
  deps.hud.append(ui);
  const count: HTMLDivElement = label(ui, 'trace-count', '');
  count.dataset['shown'] = 'off';
  const point: Vector2 = new Vector2();
  const recorder: EchoRecorder = createEchoRecorder();
  let clock: MistClock = createMistClock(deps.chance);
  let zone: string = '';
  let queue: Pending[] = [];
  let shown: Shown[] = [];
  let lastShift: Vec2 = { x: world.shift.x, z: world.shift.z };
  let tally: Tally | null = null;
  let asked: boolean = false;
  let counted: boolean = deps.store.read(TRACE_VIEW.countKey) !== null;
  let leftMark: boolean = false;

  const leave: HTMLDivElement = document.createElement('div');
  leave.className = 'trace-leave';
  leave.dataset['shown'] = 'off';
  const panel: HTMLDivElement = document.createElement('div');
  panel.className = 'trace-panel';
  panel.dataset['open'] = 'off';
  const chosen: (string | null)[] = vocabulary.lists.map((): string | null => null);
  const leaveIt: HTMLButtonElement = button(vocabulary.copy.leave);
  leaveIt.disabled = true;
  vocabulary.lists.forEach((list, listIndex: number): void => {
    const row: HTMLDivElement = document.createElement('div');
    row.className = 'trace-list';
    const buttons: HTMLButtonElement[] = list.words.map((word): HTMLButtonElement => {
      const choice: HTMLButtonElement = button(word.text);
      choice.setAttribute('aria-pressed', 'false');
      choice.addEventListener('click', (): void => {
        chosen[listIndex] = chosen[listIndex] === word.id ? null : word.id;
        for (const other of buttons) other.setAttribute('aria-pressed', other === choice && chosen[listIndex] === word.id ? 'true' : 'false');
        leaveIt.disabled = chosen[0] === null;
      });
      return choice;
    });
    row.append(...buttons);
    panel.append(row);
  });
  const close: HTMLButtonElement = button(vocabulary.copy.close);
  const actions: HTMLDivElement = document.createElement('div');
  actions.className = 'trace-actions';
  actions.append(close, leaveIt);
  panel.append(actions);
  const open: HTMLButtonElement = button(vocabulary.copy.open);
  leave.append(panel, open);
  ui.append(leave);
  for (const element of [leave, panel]) element.addEventListener('pointerdown', (event: PointerEvent): void => event.stopPropagation());

  const setOpen = (on: boolean): void => {
    panel.dataset['open'] = on ? 'on' : 'off';
    open.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  const markLeft = (): void => {
    leftMark = true;
    open.disabled = true;
    if (open.textContent === vocabulary.copy.left) return;
    let swapped: boolean = false;
    const swap = (): void => {
      if (swapped) return;
      swapped = true;
      open.textContent = vocabulary.copy.left;
      open.dataset['swap'] = 'in';
    };
    open.addEventListener('transitionend', swap, { once: true });
    window.setTimeout(swap, TRACE_VIEW.swapFallbackMs);
    open.dataset['swap'] = 'out';
  };
  open.addEventListener('click', (): void => setOpen(panel.dataset['open'] !== 'on'));
  close.addEventListener('click', (): void => setOpen(false));
  leaveIt.addEventListener('click', (): void => {
    const words: string[] = chosen.filter((word: string | null): word is string => word !== null);
    const at: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    const where: string = world.zone.id;
    leaveIt.disabled = true;
    const settle = async (): Promise<void> => {
      const mark: Mark | null = await client.leaveMark(where, at.x, at.z, words);
      if (mark === null) {
        leaveIt.disabled = false;
        return;
      }
      setOpen(false);
      markLeft();
      const text: string | null = markText(vocabulary, mark.words);
      if (text !== null && world.zone.id === where) shown.push({ kind: 'mark', anchor: { x: at.x, z: at.z }, label: label(layer, 'trace-mark', text), gone: 0 });
    };
    void settle();
  });

  const clear = (): void => {
    for (const entry of shown) {
      if (entry.kind === 'echo') {
        entry.ghost.dispose();
        entry.label?.remove();
      } else {
        entry.label.remove();
      }
    }
    shown = [];
    queue = [];
  };

  const load = async (id: string): Promise<void> => {
    const [echoes, marks]: [readonly Echo[] | null, Marks | null] = await Promise.all([client.echoes(id), client.marks(id)]);
    if (zone !== id) return;
    if (marks?.yours !== null && marks?.yours !== undefined) {
      markLeft();
    }
    const texts: string[] = (marks?.marks ?? []).map((mark: Mark): string | null => markText(vocabulary, mark.words)).filter((text: string | null): text is string => text !== null);
    queue = mixed(echoes ?? [], texts);
  };

  const place = (anchor: Anchor): void => {
    const next: Pending | undefined = queue.shift();
    if (next === undefined) return;
    if (next.kind === 'mark') {
      shown.push({ kind: 'mark', anchor, label: label(layer, 'trace-mark', next.text), gone: 0 });
      return;
    }
    const ghost: Ghost | null = createGhost(deps.scene, deps.library, world.content);
    if (ghost === null) return;
    shown.push({ kind: 'echo', echo: next.echo, anchor, ghost, label: next.echo.name === null ? null : label(layer, 'trace-name', next.echo.name), time: 0, gone: 0, pos: { x: anchor.x, z: anchor.z } });
  };

  const project = (element: HTMLElement, x: number, y: number, z: number): boolean => {
    const visible: boolean = camera.project(x, y, z, point);
    element.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
    return visible;
  };

  const syncEcho = (entry: ShownEcho, dt: number, fading: number): void => {
    entry.time += dt;
    const pose: ReplayPose | null = replayAt(entry.echo.points, RECORDER.stepSeconds, entry.anchor, entry.time);
    if (pose === null) return;
    entry.pos = pose.pos;
    entry.ghost.sync(dt, pose, pose.fade * fading, world.zone.floorHeight);
    if (entry.label === null) return;
    const near: boolean = fading > 0.5 && pose.fade > 0.5 && Math.hypot(pose.pos.x - world.player.pos.x, pose.pos.z - world.player.pos.z) < TRACE_VIEW.nameNear;
    entry.label.dataset['near'] = near ? 'on' : 'off';
    project(entry.label, pose.pos.x, world.zone.floorHeight + entry.ghost.height + TRACE_VIEW.nameLift, pose.pos.z);
  };

  const syncMark = (entry: ShownMark, fading: number): void => {
    const distance: number = Math.hypot(entry.anchor.x - world.player.pos.x, entry.anchor.z - world.player.pos.z);
    const seen: number = Math.max(0, Math.min(1, (TRACE_VIEW.markSeenFar - distance) / (TRACE_VIEW.markSeenFar - TRACE_VIEW.markSeenNear)));
    entry.label.style.setProperty('--seen', (seen * fading * TRACE_VIEW.markOpacity).toFixed(3));
    project(entry.label, entry.anchor.x, world.zone.floorHeight + TRACE_VIEW.markLift, entry.anchor.z);
  };

  const countJournal = (): void => {
    if (counted || asked || world.flags[TRACE_VIEW.journalFlag] !== TRACE_VIEW.journalTaken || !client.signedIn()) return;
    asked = true;
    const ask = async (): Promise<void> => {
      tally = await client.countJournal();
    };
    void ask();
  };

  const showCount = (): void => {
    if (counted || tally === null || hudHidden(world)) return;
    counted = true;
    deps.store.write(TRACE_VIEW.countKey, String(tally.count));
    count.textContent = countLine(vocabulary.copy.count, tally.others);
    count.dataset['shown'] = 'on';
    window.setTimeout((): void => {
      count.dataset['shown'] = 'off';
    }, TRACE_VIEW.countShowMs);
  };

  const record = (dt: number): void => {
    if (!client.signedIn()) return;
    const take: EchoTake | null = recorder.step(dt, { zone: world.zone.id, pos: world.player.pos, facing: world.player.facing, shift: world.shift });
    if (take !== null) void client.leaveEcho(take.zone, take.points);
  };

  return {
    update(dt: number): void {
      const active: boolean = world.zone.void !== null;
      if (world.zone.id !== zone) {
        clear();
        zone = world.zone.id;
        clock = createMistClock(deps.chance);
        lastShift = { x: world.shift.x, z: world.shift.z };
        if (active) void load(zone);
      }
      countJournal();
      showCount();
      leave.dataset['shown'] = active && client.signedIn() && !hudHidden(world) && (world.flags[TRACE_VIEW.journalFlag] !== undefined || leftMark) ? 'on' : 'off';
      if (!active) return;
      record(dt);
      const by: Vec2 = { x: world.shift.x - lastShift.x, z: world.shift.z - lastShift.z };
      lastShift = { x: world.shift.x, z: world.shift.z };
      if (by.x !== 0 || by.z !== 0) for (const entry of shown) shiftAnchor(entry.anchor, by);
      const live: number = shown.filter((entry: Shown): boolean => entry.gone === 0).length;
      const anchor: Anchor | null = queue.length === 0 ? null : clock.tick(dt, live, world.player.pos, world.heading);
      if (anchor !== null) place(anchor);
      for (const entry of shown) {
        const where: Vec2 = entry.kind === 'echo' ? entry.pos : entry.anchor;
        if (entry.gone === 0 && leftBehind({ x: where.x, z: where.z }, world.player.pos)) entry.gone = dt;
        else if (entry.gone > 0) entry.gone += dt;
        const fading: number = entry.gone === 0 ? 1 : Math.max(0, 1 - entry.gone / TRACE_VIEW.goneSeconds);
        if (entry.kind === 'echo') syncEcho(entry, dt, fading);
        else syncMark(entry, fading);
      }
      const ended: Shown[] = shown.filter((entry: Shown): boolean => entry.gone >= TRACE_VIEW.goneSeconds);
      for (const entry of ended) {
        if (entry.kind === 'echo') {
          entry.ghost.dispose();
          entry.label?.remove();
        } else {
          entry.label.remove();
        }
      }
      shown = shown.filter((entry: Shown): boolean => entry.gone < TRACE_VIEW.goneSeconds);
    },
  };
}

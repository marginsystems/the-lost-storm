import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import type { Command, FlaskState, MonsterState, World } from '../../sim/world/types.ts';
import { el } from '../hud/dom.ts';
import type { Hud, HudPanel } from '../hud/hud-api.ts';
import { iconSvg } from '../hud/icons.ts';
import { PANEL_ICONS } from '../hud/key-labels.ts';
import type { Input } from '../input.ts';
import { INPUT } from '../input.ts';
import { TITLE_SCREEN } from '../title-screen.ts';
import type { Candidate, FlaskEntry, StickReading, TouchButton } from './touch-map.ts';
import { aimedSkill, arcPoint, autoAimTarget, clampKnob, cooldownTurn, facingVector, isTap, joinsPinch, pinchWheelDelta, readStick, rotateHintShows, startsStick, stickDirection, stickMove, TOUCH, touchButtons } from './touch-map.ts';
import touchCss from './touch.css?inline';

export interface TouchSetup {
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly world: World;
  readonly input: Input;
  readonly hud: Hud;
  readonly yaw: number;
  readonly zoomStep: number;
  zoomBy(wheelDelta: number): void;
  openMenu(): void;
}

export interface TouchControls {
  collect(dt: number): Command[];
  update(): void;
  reset(): void;
}

type Track =
  | { readonly kind: 'stick'; readonly ox: number; readonly oy: number; readonly at: number; moved: boolean; reading: StickReading }
  | { readonly kind: 'world'; readonly ox: number; readonly oy: number; readonly at: number; x: number; y: number }
  | { readonly kind: 'button'; readonly index: number };

interface ButtonView {
  readonly spec: TouchButton;
  readonly root: HTMLElement;
  readonly ring: HTMLElement;
  turn: number;
  dim: boolean | null;
}

const MENU: readonly { readonly panel: HudPanel; readonly label: string; readonly icon: string }[] = [
  { panel: 'inventory', label: 'Inventory', icon: PANEL_ICONS.inventory },
  { panel: 'character', label: 'Character', icon: PANEL_ICONS.character },
  { panel: 'tree', label: 'Skills', icon: PANEL_ICONS.tree },
  { panel: 'map', label: 'Map', icon: PANEL_ICONS.map },
];

const ROTATE_HTML: string = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="4" width="12" height="24" rx="2"/><path d="M14.5 24.5h3"/></svg><div><b>Turn your phone sideways</b><span>The storm needs room.</span></div>';
const MENU_HTML: string = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
const CLOSE_HTML: string = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const signature = (buttons: readonly TouchButton[]): string => buttons.map((button: TouchButton): string => `${button.kind}${button.slot}`).join('|');

export function createTouchControls(setup: TouchSetup): TouchControls {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = touchCss;
  document.head.append(style);
  const { canvas, hudRoot, world, input, hud } = setup;
  document.body.classList.add('touch');
  document.documentElement.style.setProperty('--tc-stick-r', `${TOUCH.stickRadius}px`);

  const layer: HTMLDivElement = el('div', 'tc', null);
  canvas.after(layer);
  const stick: HTMLDivElement = el('div', 'tc-stick', layer);
  const knob: HTMLElement = el('i', 'tc-knob', stick);
  const actions: HTMLDivElement = el('div', 'tc-actions', layer);

  const menu: HTMLDivElement = el('div', 'tc-menu', hudRoot);
  for (const item of MENU) {
    const button: HTMLButtonElement = el('button', 'tc-menu-btn', menu);
    button.type = 'button';
    button.setAttribute('aria-label', item.label);
    button.innerHTML = iconSvg(item.icon);
    button.addEventListener('click', (): void => hud.togglePanel(item.panel));
  }
  const pause: HTMLButtonElement = el('button', 'tc-menu-btn tc-pause', menu);
  pause.type = 'button';
  pause.setAttribute('aria-label', 'Menu');
  pause.innerHTML = MENU_HTML;
  pause.addEventListener('click', (): void => {
    reset();
    setup.openMenu();
  });
  const close: HTMLButtonElement = el('button', 'tc-close', hudRoot);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = CLOSE_HTML;
  close.addEventListener('click', (): void => {
    hud.closePanels();
  });
  const syncClose = (): void => {
    close.classList.toggle('on', hudRoot.querySelector('.hud-panel.open') !== null);
  };
  new MutationObserver(syncClose).observe(hudRoot, { attributes: true, attributeFilter: ['class'], subtree: true });

  const rotate: HTMLDivElement = el('div', 'tc-rotate', document.body);
  rotate.setAttribute('role', 'status');
  rotate.innerHTML = ROTATE_HTML;
  const portrait: MediaQueryList = window.matchMedia('(orientation: portrait)');
  let portraitSince: number = performance.now();
  let rotateDismissed: boolean = false;
  let rotateTimer: number | undefined;
  const showRotate = (): void => {
    const shownFor: number = performance.now() - portraitSince;
    const on: boolean = rotateHintShows(portrait.matches, shownFor, rotateDismissed, document.body.classList.contains(TITLE_SCREEN.playingClass));
    rotate.classList.toggle('on', on);
    window.clearTimeout(rotateTimer);
    if (on) rotateTimer = window.setTimeout(showRotate, TOUCH.rotateHintMs - shownFor);
  };
  portrait.addEventListener('change', (): void => {
    portraitSince = performance.now();
    showRotate();
  });
  rotate.addEventListener('pointerdown', (): void => {
    rotateDismissed = true;
    showRotate();
  });
  let wasPlaying: boolean = document.body.classList.contains(TITLE_SCREEN.playingClass);
  new MutationObserver((): void => {
    const playing: boolean = document.body.classList.contains(TITLE_SCREEN.playingClass);
    if (playing === wasPlaying) return;
    wasPlaying = playing;
    portraitSince = performance.now();
    showRotate();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  showRotate();

  let views: ButtonView[] = [];
  let shownSignature: string = '';
  const tracks: Map<number, Track> = new Map<number, Track>();
  const fresh: Set<number> = new Set<number>();
  const lifted: Set<number> = new Set<number>();
  let repeat: number = 0;
  let moving: boolean = false;
  let stopPending: boolean = false;
  let pinch: number | null = null;

  const buildButtons = (specs: readonly TouchButton[]): void => {
    actions.replaceChildren();
    const ring: number = specs.filter((spec: TouchButton): boolean => spec.kind !== 'attack').length;
    let arcIndex: number = 0;
    views = specs.map((spec: TouchButton, index: number): ButtonView => {
      const root: HTMLDivElement = el('div', `tc-btn ${spec.kind}`, actions);
      root.dataset['index'] = String(index);
      root.setAttribute('role', 'button');
      if (spec.kind !== 'attack') {
        const point = arcPoint(arcIndex, ring);
        arcIndex += 1;
        root.style.setProperty('--tc-x', `${point.right.toFixed(1)}px`);
        root.style.setProperty('--tc-y', `${point.bottom.toFixed(1)}px`);
      }
      const ringEl: HTMLElement = el('i', 'tc-cd', root);
      const icon: HTMLElement = el('span', 'tc-icon', root);
      if (spec.kind === 'flask') {
        icon.textContent = String(spec.slot + 1);
        root.setAttribute('aria-label', spec.label);
      } else {
        const skill: SkillDef | undefined = world.player.skills[spec.slot];
        icon.innerHTML = iconSvg(skill?.icon ?? '');
        root.setAttribute('aria-label', skill?.name ?? 'Skill');
      }
      return { spec, root, ring: ringEl, turn: -1, dim: null };
    });
  };

  const refreshButtons = (): void => {
    const specs: TouchButton[] = touchButtons(world.content.player.skillBar, INPUT.leftBinding, world.player.flasks.map((flask: FlaskState): FlaskEntry => flask.def));
    const next: string = signature(specs);
    if (next === shownSignature) return;
    shownSignature = next;
    buildButtons(specs);
  };
  refreshButtons();

  const stickTrack = (): Extract<Track, { kind: 'stick' }> | null => {
    for (const track of tracks.values()) if (track.kind === 'stick') return track;
    return null;
  };
  const worldTracks = (): Extract<Track, { kind: 'world' }>[] => [...tracks.values()].filter((track: Track): track is Extract<Track, { kind: 'world' }> => track.kind === 'world');

  const restStick = (): void => {
    stick.style.transform = '';
    knob.style.transform = '';
    stick.classList.remove('on');
  };

  const release = (pointerId: number, x: number, y: number, cancelled: boolean): void => {
    const track: Track | undefined = tracks.get(pointerId);
    if (track === undefined) return;
    tracks.delete(pointerId);
    const now: number = performance.now();
    switch (track.kind) {
      case 'stick':
        if (!cancelled && !track.moved && isTap(x - track.ox, y - track.oy, now - track.at)) input.tap(track.ox, track.oy);
        else if (moving) stopPending = true;
        moving = false;
        restStick();
        return;
      case 'world':
        if (!cancelled && pinch === null && isTap(x - track.ox, y - track.oy, now - track.at)) input.tap(x, y);
        if (worldTracks().length < 2) pinch = null;
        return;
      case 'button': {
        const view: ButtonView | undefined = views[track.index];
        view?.root.classList.remove('down');
        if (view !== undefined && view.spec.kind !== 'flask') lifted.add(view.spec.slot);
        return;
      }
    }
  };

  layer.addEventListener('pointerdown', (event: PointerEvent): void => {
    event.preventDefault();
    const target: Element | null = event.target instanceof Element ? event.target.closest('.tc-btn') : null;
    const index: number = target instanceof HTMLElement ? Number(target.dataset['index']) : Number.NaN;
    const view: ButtonView | undefined = Number.isInteger(index) ? views[index] : undefined;
    if (view !== undefined) {
      view.root.classList.add('down');
      tracks.set(event.pointerId, { kind: 'button', index });
      fresh.add(index);
      return;
    }
    const now: number = performance.now();
    if (startsStick(event.clientX, window.innerWidth, stickTrack() !== null, worldTracks().length)) {
      tracks.set(event.pointerId, { kind: 'stick', ox: event.clientX, oy: event.clientY, at: now, moved: false, reading: { x: 0, y: 0, magnitude: 0 } });
      stick.classList.add('on');
      const rect: DOMRect = layer.getBoundingClientRect();
      stick.style.transform = `translate(${(event.clientX - rect.left).toFixed(1)}px,${(event.clientY - rect.top).toFixed(1)}px)`;
      knob.style.transform = '';
      return;
    }
    for (const [id, track] of tracks) {
      if (track.kind !== 'stick' || !joinsPinch(track.moved, now - track.at)) continue;
      tracks.set(id, { kind: 'world', ox: track.ox, oy: track.oy, at: Number.NEGATIVE_INFINITY, x: track.ox, y: track.oy });
      restStick();
    }
    tracks.set(event.pointerId, { kind: 'world', ox: event.clientX, oy: event.clientY, at: now, x: event.clientX, y: event.clientY });
    const fingers = worldTracks();
    const [a, b] = fingers;
    if (fingers.length === 2 && a !== undefined && b !== undefined) pinch = Math.hypot(a.x - b.x, a.y - b.y);
  });

  layer.addEventListener('pointermove', (event: PointerEvent): void => {
    const track: Track | undefined = tracks.get(event.pointerId);
    if (track === undefined) return;
    if (track.kind === 'stick') {
      const dx: number = event.clientX - track.ox;
      const dy: number = event.clientY - track.oy;
      const knobAt: Vec2 = clampKnob(dx, dy);
      knob.style.transform = `translate(${knobAt.x.toFixed(1)}px,${knobAt.z.toFixed(1)}px)`;
      track.reading = readStick(dx, dy);
      if (track.reading.magnitude >= TOUCH.deadzone) track.moved = true;
      return;
    }
    if (track.kind !== 'world') return;
    track.x = event.clientX;
    track.y = event.clientY;
    const [a, b] = worldTracks();
    if (pinch === null || a === undefined || b === undefined) return;
    const spread: number = Math.hypot(a.x - b.x, a.y - b.y);
    setup.zoomBy(pinchWheelDelta(pinch, spread, setup.zoomStep));
    pinch = spread;
  });

  const lift = (event: PointerEvent): void => release(event.pointerId, event.clientX, event.clientY, event.type === 'pointercancel');
  layer.addEventListener('pointerup', lift);
  layer.addEventListener('pointercancel', lift);
  layer.addEventListener('contextmenu', (event: MouseEvent): void => event.preventDefault());

  const reset = (): void => {
    for (const view of views) view.root.classList.remove('down');
    for (const track of tracks.values()) {
      const view: ButtonView | undefined = track.kind === 'button' ? views[track.index] : undefined;
      if (view !== undefined && view.spec.kind !== 'flask') lifted.add(view.spec.slot);
    }
    tracks.clear();
    fresh.clear();
    pinch = null;
    if (moving) stopPending = true;
    moving = false;
    restStick();
  };
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) reset();
  });

  const monsters = (): Candidate[] => world.monsters.map((monster: MonsterState): Candidate => ({ id: monster.id, pos: monster.pos, alive: monster.alive }));

  return {
    collect(dt: number): Command[] {
      const commands: Command[] = [];
      repeat -= dt;
      const tick: boolean = repeat <= 0;
      if (tick) repeat = TOUCH.repeatSeconds;
      const pressedNow: Set<number> = new Set<number>(fresh);
      fresh.clear();
      const heldButtons: Set<number> = new Set<number>();
      for (const track of tracks.values()) if (track.kind === 'button') heldButtons.add(track.index);

      if (world.dialogue !== null) {
        if (views.some((view: ButtonView, index: number): boolean => view.spec.kind === 'attack' && pressedNow.has(index))) commands.push({ type: 'advance' });
        return commands;
      }

      const player = world.player;
      const stickNow = stickTrack();
      const direction: Vec2 | null = stickNow === null ? null : stickDirection(stickNow.reading, setup.yaw);
      if (stopPending) {
        stopPending = false;
        commands.push({ type: 'stop' });
      }
      if (direction !== null && (tick || !moving)) {
        const move = stickMove(player.pos, direction, moving);
        if (move !== null) commands.push(move);
        moving = true;
      }
      const ahead: Vec2 = direction ?? facingVector(player.facing);

      views.forEach((view: ButtonView, index: number): void => {
        const isFresh: boolean = pressedNow.has(index);
        const isHeld: boolean = heldButtons.has(index);
        switch (view.spec.kind) {
          case 'attack':
            if (isFresh) commands.push({ type: 'hold', slot: view.spec.slot, down: true });
            if (isFresh || (isHeld && tick && player.skills[view.spec.slot]?.press === null)) commands.push(aimedSkill(view.spec.slot, player.pos, ahead, autoAimTarget(monsters(), player.pos, ahead)));
            return;
          case 'skill': {
            const skill: SkillDef | undefined = player.skills[view.spec.slot];
            if (isFresh) commands.push({ type: 'hold', slot: view.spec.slot, down: true });
            const ready: boolean = skill !== undefined && skill.press === null && player.action === null && player.queued === null && (player.cooldowns[skill.id] ?? 0) <= 0 && player.mana >= skill.manaCost;
            if (isFresh || (isHeld && tick && ready)) commands.push(aimedSkill(view.spec.slot, player.pos, ahead, autoAimTarget(monsters(), player.pos, ahead)));
            return;
          }
          case 'flask':
            if (isFresh) commands.push({ type: 'flask', slot: view.spec.slot });
            return;
        }
      });
      for (const slot of lifted) commands.push({ type: 'hold', slot, down: false });
      lifted.clear();
      const holding = player.action;
      if (holding !== null && holding.skill.press !== null && views.some((view: ButtonView, index: number): boolean => heldButtons.has(index) && view.spec.kind !== 'flask' && view.spec.slot === holding.slot)) {
        commands.push({ type: 'steer', aim: aimedSkill(holding.slot ?? 0, player.pos, ahead, autoAimTarget(monsters(), player.pos, ahead)).aim });
      }
      return commands;
    },
    update(): void {
      refreshButtons();
      const player = world.player;
      for (const view of views) {
        if (view.spec.kind === 'flask') continue;
        const skill: SkillDef | undefined = player.skills[view.spec.slot];
        if (skill === undefined) continue;
        const turn: number = cooldownTurn(player.cooldowns[skill.id] ?? 0, skill.cooldown);
        if (turn !== view.turn) {
          view.turn = turn;
          view.ring.style.setProperty('--cd', `${turn}deg`);
          view.root.classList.toggle('cooling', turn < TOUCH.fullTurn);
        }
        const dim: boolean = player.mana < skill.manaCost;
        if (dim !== view.dim) {
          view.dim = dim;
          view.root.classList.toggle('dim', dim);
        }
      }
    },
    reset,
  };
}

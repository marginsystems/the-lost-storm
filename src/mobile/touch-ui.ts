import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { HudView } from '../../sim/world/hud.ts';
import { hudView } from '../../sim/world/hud.ts';
import { HUD_GATE, panelPart, tagPart } from '../hud/hud-gate.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { readyToRepeat } from '../../sim/world/skills.ts';
import { glidesWith } from '../../sim/world/momentum.ts';
import type { Command, FlaskState, World } from '../../sim/world/types.ts';
import { cannotStep, isTimeHeld } from '../../sim/world/movement.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { el } from '../hud/dom.ts';
import { flaskGauge, readFlask } from '../hud/flask-gauge.ts';
import type { FlaskVessel } from '../hud/flask-vessel.ts';
import { upgradeReady } from '../../sim/world/flask-tiers.ts';
import { createVessel } from '../hud/flask-vessel.ts';
import type { Hud, HudPanel } from '../hud/hud-api.ts';
import { iconSvg } from '../hud/icons.ts';
import { PANEL_ICONS, TOUCH_NAMES } from '../hud/key-labels.ts';
import type { Input } from '../input.ts';
import type { ItemNames } from '../render/item-names.ts';
import { INPUT } from '../input.ts';
import { createBrowserStore } from '../storage.ts';
import type { ButtonInputs, ButtonPlan, FlaskEntry, SkillBarEntry, StickReading, TouchButton } from './touch-map.ts';
import { aimedSkill, autoAimTarget, buttonInputsChanged, buttonKey, createButtonInputs, glideAim, clampKnob, cooldownTurn, facingVector, isTap, joinsPinch, movedIndex, pinchWheelDelta, planButtons, readStick, startsStick, stickDirection, stickMove, TOUCH, touchButtons } from './touch-map.ts';
import type { PhoneLayout, Rect, SafeInsets } from './phone-layout.ts';
import { PHONE, phoneLayout } from './phone-layout.ts';
import { startRotateHint } from './rotate-hint.ts';
import touchCss from './touch.css?inline';
import touchSheetCss from './touch-sheet.css?inline';
import touchHeldCss from './touch-held.css?inline';
import touchCornerCss from './touch-corner.css?inline';

export interface TouchSetup {
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly world: World;
  readonly input: Input;
  readonly hud: Hud;
  readonly yaw: number;
  readonly zoomStep: number;
  readonly itemNames: ItemNames;
  zoomBy(wheelDelta: number): void;
  readonly feedback: (() => void) | null;
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
  readonly vessel: FlaskVessel | null;
  turn: number;
  dim: boolean | null;
}

const MENU: readonly { readonly panel: HudPanel; readonly label: string; readonly icon: string }[] = [
  { panel: 'inventory', label: 'Inventory', icon: PANEL_ICONS.inventory },
  { panel: 'character', label: 'Character', icon: PANEL_ICONS.character },
  { panel: 'tree', label: 'Skill Tree', icon: PANEL_ICONS.tree },
  { panel: 'map', label: 'Map', icon: PANEL_ICONS.map },
];

const MENU_HTML: string = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
const FEEDBACK_HTML: string = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.2L7 20v-3.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/></svg>';
const CLOSE_HTML: string = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const px = (value: string): number => {
  const parsed: number = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function readSafe(probe: HTMLElement): SafeInsets {
  const style: CSSStyleDeclaration = getComputedStyle(probe);
  return { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) };
}

function placeRect(element: HTMLElement, rect: Rect | undefined): void {
  if (rect === undefined) return;
  element.style.left = `${rect.x.toFixed(1)}px`;
  element.style.top = `${rect.y.toFixed(1)}px`;
  element.style.width = `${rect.w.toFixed(1)}px`;
  element.style.height = `${rect.h.toFixed(1)}px`;
}

function applyPhoneLayout(target: HTMLElement, hudRoot: HTMLElement, layout: PhoneLayout, width: number, height: number): void {
  const vars: CSSStyleDeclaration = target.style;
  const set = (name: string, value: number): void => vars.setProperty(name, `${value.toFixed(1)}px`);
  vars.setProperty('--ph-globe-zoom', String(PHONE.globeZoom));
  vars.setProperty('--ph-quests-zoom', String(PHONE.questZoom));
  target.dataset['phTarget'] = layout.target.h > PHONE.targetHeight ? 'tall' : 'short';
  set('--ph-life-x', layout.life.x / PHONE.globeZoom);
  set('--ph-life-y', layout.life.y / PHONE.globeZoom);
  set('--ph-mana-x', layout.mana.x / PHONE.globeZoom);
  set('--ph-mana-y', layout.mana.y / PHONE.globeZoom);
  set('--ph-menu-x', layout.menu.rect.x);
  set('--ph-menu-y', layout.menu.rect.y);
  set('--ph-menu-btn', layout.menu.button);
  set('--ph-menu-gap', layout.menu.gap);
  vars.setProperty('--ph-menu-flow', layout.menu.rail ? 'column' : 'row');
  hudRoot.classList.toggle('ph-map-caption', layout.caption !== null);
  set('--ph-map-size', layout.minimap.w);
  set('--ph-map-top', layout.zone.y);
  set('--ph-map-right', width - layout.minimap.x - layout.minimap.w);
  const quests: Rect | null = layout.quests;
  hudRoot.classList.toggle('ph-no-quests', quests === null);
  if (quests !== null) {
    set('--ph-quests-top', quests.y / PHONE.questZoom);
    set('--ph-quests-right', (width - quests.x - quests.w) / PHONE.questZoom);
    set('--ph-quests-w', quests.w / PHONE.questZoom);
    set('--ph-quests-h', quests.h / PHONE.questZoom);
  }
  const xpBottom: number = layout.xp.y + layout.xp.h;
  set('--ph-xp-x', layout.xp.x);
  set('--ph-xp-w', layout.xp.w);
  set('--ph-xp-bottom', height - xpBottom);
  set('--ph-toast-x', layout.toast.x);
  set('--ph-toast-y', layout.toast.y);
  set('--ph-toast-w', layout.toast.w);
  set('--ph-bark-x', layout.bark.x);
  set('--ph-bark-bottom', height - layout.bark.y - layout.bark.h);
  set('--ph-bark-w', layout.bark.w);
  set('--ph-bark-talk-bottom', height - layout.dialogue.y + PHONE.gap);
  set('--ph-meter-x', layout.meter.x);
  set('--ph-meter-y', layout.meter.y);
  set('--ph-meter-w', layout.meter.w);
  set('--ph-banner-x', layout.banner.x);
  set('--ph-banner-y', layout.banner.y);
  set('--ph-banner-w', layout.banner.w);
  set('--ph-target-x', layout.target.x);
  set('--ph-target-y', layout.target.y);
  set('--ph-target-w', layout.target.w);
  set('--ph-invite-x', layout.invite.x);
  set('--ph-invite-y', layout.invite.y);
  set('--ph-invite-w', layout.invite.w);
  hudRoot.classList.toggle('ph-invite-on-toast', layout.invite.y === layout.toast.y);
  hudRoot.classList.toggle('ph-bark-on-toast', layout.bark.y === layout.toast.y);
  const party: Rect | null = layout.party;
  hudRoot.classList.toggle('ph-no-party', party === null);
  if (party !== null) {
    set('--ph-party-x', party.x);
    set('--ph-party-y', party.y);
    set('--ph-party-w', party.w);
  }
  set('--ph-zone-w', layout.zone.w);
  set('--ph-dialogue-x', layout.dialogue.x);
  set('--ph-dialogue-bottom', height - layout.dialogue.y - layout.dialogue.h);
  set('--ph-dialogue-w', layout.dialogue.w);
  set('--ph-dialogue-h', layout.dialogue.h);
  set('--ph-hint-left', layout.hint.x - layout.xp.x);
  set('--ph-hint-right', layout.xp.x + layout.xp.w - layout.hint.x - layout.hint.w);
  set('--ph-hint-bottom', xpBottom - layout.hint.y - layout.hint.h);
  set('--ph-notice-left', layout.toast.x - layout.xp.x);
  set('--ph-notice-right', layout.xp.x + layout.xp.w - layout.toast.x - layout.toast.w);
  set('--ph-notice-bottom', xpBottom - layout.toast.y - layout.toast.h);
  set('--ph-stick-x', layout.stick.x + layout.stick.w / 2);
  set('--ph-stick-y', layout.stick.y + layout.stick.h / 2);
  set('--ph-stick-hint-rise', Math.max(0, ...layout.flasks.map((flask: Rect): number => layout.stick.y - flask.y)));
}

const signature = (buttons: readonly TouchButton[]): string => buttons.map((button: TouchButton): string => `${button.kind}${button.slot}${button.kind === 'flask' || button.filled ? '' : '-'}`).join('|');

function retire(root: HTMLElement): void {
  root.removeAttribute(HUD_GATE.partAttribute);
  root.classList.remove('arriving');
  root.classList.add('leaving');
  root.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.target === root && event.propertyName === 'opacity') root.remove();
  });
}

export function createTouchControls(setup: TouchSetup): TouchControls {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = touchCss + touchSheetCss + touchHeldCss + touchCornerCss;
  document.head.append(style);
  const { canvas, hudRoot, world, input, hud } = setup;
  document.body.classList.add('touch');
  document.documentElement.style.setProperty('--tc-stick-r', `${TOUCH.stickRadius}px`);

  const layer: HTMLDivElement = el('div', 'tc', null);
  canvas.after(layer);
  const stick: HTMLDivElement = el('div', 'tc-stick', layer);
  const knob: HTMLElement = el('i', 'tc-knob', stick);
  const moveHint: HTMLElement = el('span', 'tc-stick-hint', stick);
  moveHint.textContent = TOUCH.moveHint;
  const learnStore: KeyValueStore = createBrowserStore();
  stick.classList.toggle('intro', learnStore.read(TOUCH.moveLearnedKey) === null);
  const learnedMove = (): void => {
    if (!stick.classList.contains('intro')) return;
    stick.classList.remove('intro');
    learnStore.write(TOUCH.moveLearnedKey, '1');
  };
  const actions: HTMLDivElement = el('div', 'tc-actions', layer);

  const menu: HTMLDivElement = el('div', 'tc-menu', hudRoot);
  for (const item of MENU) {
    const button: HTMLButtonElement = el('button', 'tc-menu-btn', menu);
    tagPart(button, panelPart(item.panel));
    button.type = 'button';
    button.setAttribute('aria-label', item.label);
    button.innerHTML = iconSvg(item.icon);
    button.addEventListener('click', (): void => hud.togglePanel(item.panel));
  }
  const feedback: (() => void) | null = setup.feedback;
  if (feedback !== null) {
    const send: HTMLButtonElement = el('button', 'tc-menu-btn tc-feedback', menu);
    send.type = 'button';
    send.setAttribute('aria-label', 'Send feedback');
    send.innerHTML = FEEDBACK_HTML;
    send.addEventListener('click', (): void => {
      reset();
      feedback();
    });
  }
  const names: HTMLButtonElement = el('button', 'tc-menu-btn tc-names', menu);
  names.type = 'button';
  names.setAttribute('aria-label', TOUCH_NAMES.name);
  names.innerHTML = iconSvg(TOUCH_NAMES.icon);
  const showNames = (): void => {
    const on: boolean = setup.itemNames.toggled();
    names.classList.toggle('on', on);
    names.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  showNames();
  names.addEventListener('click', (): void => {
    setup.itemNames.setToggled(!setup.itemNames.toggled());
    showNames();
  });
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
  const tabs: HTMLDivElement = el('div', 'tc-tabs', hudRoot);
  const tradeTab: HTMLButtonElement = el('button', 'tc-tab', tabs);
  tradeTab.type = 'button';
  const bagTab: HTMLButtonElement = el('button', 'tc-tab', tabs);
  bagTab.type = 'button';
  bagTab.textContent = TOUCH.bagTab;
  let bagShown: boolean = false;
  const syncTabs = (): void => {
    const trade: HTMLElement | null = hudRoot.querySelector<HTMLElement>('.hud-panel.trade-panel.open');
    const paired: boolean = trade !== null && hudRoot.querySelector('.hud-panel.inventory-panel.open') !== null;
    if (!paired) bagShown = false;
    const label: string = trade?.dataset['tab'] ?? '';
    if (label !== '' && tradeTab.textContent !== label) tradeTab.textContent = label;
    tabs.classList.toggle('on', paired);
    hudRoot.classList.toggle('tc-trade', paired && !bagShown);
    hudRoot.classList.toggle('tc-bag', paired && bagShown);
    tradeTab.classList.toggle('active', !bagShown);
    bagTab.classList.toggle('active', bagShown);
  };
  tradeTab.addEventListener('click', (): void => {
    bagShown = false;
    syncTabs();
  });
  bagTab.addEventListener('click', (): void => {
    bagShown = true;
    syncTabs();
  });
  const syncClose = (): void => {
    close.classList.toggle('on', hudRoot.querySelector('.hud-panel.open, .atlas.open') !== null);
    syncTabs();
  };
  new MutationObserver(syncClose).observe(hudRoot, { attributes: true, attributeFilter: ['class'], subtree: true });

  startRotateHint();

  let views: ButtonView[] = [];
  let shownSignature: string = '';
  const tracks: Map<number, Track> = new Map<number, Track>();
  const fresh: Set<number> = new Set<number>();
  const lifted: Set<number> = new Set<number>();
  let repeat: number = 0;
  let moving: boolean = false;
  let stopPending: boolean = false;
  let pinch: number | null = null;

  const safeProbe: HTMLDivElement = el('div', 'tc-safe', layer);
  const place = (): void => {
    const width: number = hudRoot.clientWidth;
    const height: number = hudRoot.clientHeight;
    const skills: ButtonView[] = views.filter((view: ButtonView): boolean => view.spec.kind === 'skill');
    const flasks: ButtonView[] = views.filter((view: ButtonView): boolean => view.spec.kind === 'flask');
    const layout: PhoneLayout = phoneLayout({ width, height, safe: readSafe(safeProbe) }, { skills: skills.length, flasks: flasks.length, menu: menu.childElementCount });
    applyPhoneLayout(document.documentElement, hudRoot, layout, width, height);
    for (const view of views) if (view.spec.kind === 'attack') placeRect(view.root, layout.attack);
    skills.forEach((view: ButtonView, index: number): void => placeRect(view.root, layout.skills[index]));
    flasks.forEach((view: ButtonView, index: number): void => placeRect(view.root, layout.flasks[index]));
  };
  new ResizeObserver(place).observe(hudRoot);

  const dress = (view: ButtonView, spec: TouchButton): void => {
    const icon: HTMLElement | null = view.root.querySelector('.tc-icon');
    if (icon === null || spec.kind === 'flask') return;
    const skill: SkillDef | undefined = spec.filled ? (world.player.skills[spec.slot] ?? undefined) : undefined;
    const drawn: string = skill?.icon ?? '';
    if ((icon.dataset['icon'] ?? '') !== drawn) {
      const next: HTMLElement = document.createElement('span');
      next.className = 'tc-icon arriving';
      next.dataset['icon'] = drawn;
      next.innerHTML = skill === undefined ? '' : iconSvg(skill.icon);
      icon.replaceWith(next);
    }
    view.root.classList.toggle('empty', skill === undefined);
    view.root.setAttribute('aria-label', skill?.name ?? 'Empty skill slot');
  };

  const createButton = (spec: TouchButton): ButtonView => {
    const root: HTMLDivElement = el('div', `tc-btn ${spec.kind} arriving`, actions);
    root.setAttribute('role', 'button');
    const ringEl: HTMLElement = el('i', 'tc-cd', root);
    if (spec.kind !== 'flask') {
      el('span', 'tc-icon', root);
      return { spec, root, ring: ringEl, vessel: null, turn: -1, dim: null };
    }
    const flask: FlaskState | undefined = world.player.flasks[spec.slot];
    const resource: FlaskResource | undefined = flask?.def.resource;
    if (resource !== undefined) tagPart(root, resource);
    root.setAttribute('aria-label', spec.label);
    return { spec, root, ring: ringEl, vessel: resource === undefined || flask === undefined ? null : createVessel(root, resource, false, readFlask(flask)), turn: -1, dim: null };
  };

  const buildButtons = (specs: readonly TouchButton[]): void => {
    for (const stale of actions.querySelectorAll('.tc-btn.leaving')) stale.remove();
    const shown: Map<string, ButtonView> = new Map<string, ButtonView>(views.map((view: ButtonView): [string, ButtonView] => [buttonKey(view.spec), view]));
    const before: string[] = [...shown.keys()];
    const plan: ButtonPlan = planButtons(before, specs);
    for (const key of plan.dropped) {
      const gone: ButtonView | undefined = shown.get(key);
      if (gone !== undefined) retire(gone.root);
    }
    views = specs.map((spec: TouchButton, index: number): ButtonView => {
      const kept: ButtonView | undefined = shown.get(buttonKey(spec));
      const view: ButtonView = kept === undefined ? createButton(spec) : { ...kept, spec, turn: -1, dim: null };
      view.root.dataset['index'] = String(index);
      dress(view, spec);
      return view;
    });
    const after: string[] = views.map((view: ButtonView): string => buttonKey(view.spec));
    for (const [id, track] of tracks) {
      if (track.kind !== 'button') continue;
      const index: number = movedIndex(before, after, track.index);
      if (index < 0) tracks.delete(id);
      else tracks.set(id, { kind: 'button', index });
    }
    const pressed: number[] = [...fresh];
    fresh.clear();
    for (const index of pressed) {
      const moved: number = movedIndex(before, after, index);
      if (moved >= 0) fresh.add(moved);
    }
    place();
  };

  const buttonInputs: ButtonInputs = createButtonInputs();
  const refreshButtons = (): void => {
    if (!buttonInputsChanged(buttonInputs, world.player, world.content.player.manaShows)) return;
    const view: HudView = hudView(world);
    const bar: SkillBarEntry[] = world.content.player.skillBar.map((entry: { readonly bindings: readonly string[] }, slot: number): SkillBarEntry => ({ bindings: entry.bindings, filled: view.slots.includes(slot) }));
    const specs: TouchButton[] = touchButtons(bar, INPUT.leftBinding, world.player.flasks.map((flask: FlaskState): FlaskEntry | null => (view.parts.includes(flask.def.resource) ? flask.def : null)));
    const next: string = `${signature(specs)}#${world.player.bar.join(',')}`;
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

  let walking: number | null = null;
  const endWalk = (): void => {
    if (walking === null) return;
    walking = null;
    input.releaseHold();
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
        if (pointerId === walking) endWalk();
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
    if (fingers.length === 1 && pinch === null && world.dialogue === null) {
      walking = event.pointerId;
      input.holdAt(event.clientX, event.clientY);
      learnedMove();
    }
    if (fingers.length === 2 && a !== undefined && b !== undefined) {
      endWalk();
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
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
      if (track.reading.magnitude >= TOUCH.deadzone) {
        track.moved = true;
        learnedMove();
      }
      return;
    }
    if (track.kind !== 'world') return;
    track.x = event.clientX;
    track.y = event.clientY;
    if (event.pointerId === walking) input.moveHold(event.clientX, event.clientY);
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
    endWalk();
    pinch = null;
    if (moving) stopPending = true;
    moving = false;
    restStick();
  };
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) reset();
  });


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
      if (direction !== null) {
        const move = stickMove(player.pos, direction, moving);
        if (move !== null) commands.push(move);
        moving = true;
      }
      const ahead: Vec2 = direction ?? facingVector(player.facing);

      views.forEach((view: ButtonView, index: number): void => {
        const isFresh: boolean = pressedNow.has(index);
        const isHeld: boolean = heldButtons.has(index);
        if (view.spec.kind !== 'flask' && !view.spec.filled) return;
        switch (view.spec.kind) {
          case 'attack':
            if (isFresh) commands.push({ type: 'hold', slot: view.spec.slot, down: true });
            if (isFresh || (isHeld && tick && player.skills[view.spec.slot]?.press === null)) commands.push(aimedSkill(view.spec.slot, player.pos, ahead, autoAimTarget(world.monsters, player.pos, ahead)));
            return;
          case 'skill': {
            const skill: SkillDef | undefined = player.skills[view.spec.slot] ?? undefined;
            if (isFresh) commands.push({ type: 'hold', slot: view.spec.slot, down: true });
            const ready: boolean = readyToRepeat(player, skill);
            if (isFresh || (isHeld && tick && ready)) commands.push(aimedSkill(view.spec.slot, player.pos, ahead, autoAimTarget(world.monsters, player.pos, ahead)));
            return;
          }
          case 'flask': {
            if (!isFresh) return;
            commands.push({ type: 'flask', slot: view.spec.slot });
            const flask: FlaskState | undefined = player.flasks[view.spec.slot];
            if (flask !== undefined && flaskGauge(readFlask(flask)).empty) view.vessel?.refuse();
            return;
          }
        }
      });
      for (const slot of lifted) commands.push({ type: 'hold', slot, down: false });
      lifted.clear();
      const holding = player.action;
      if (holding !== null && holding.skill.press !== null && views.some((view: ButtonView, index: number): boolean => heldButtons.has(index) && view.spec.kind !== 'flask' && view.spec.slot === holding.slot)) {
        const aim: Vec2 = glidesWith(holding.skill.press) ? glideAim(player.pos, direction) : aimedSkill(holding.slot ?? 0, player.pos, ahead, autoAimTarget(world.monsters, player.pos, ahead)).aim;
        commands.push({ type: 'steer', aim });
      }
      return commands;
    },
    update(): void {
      refreshButtons();
      const talking: boolean = world.dialogue !== null;
      if (talking !== document.body.classList.contains(TOUCH.talkingClass)) document.body.classList.toggle(TOUCH.talkingClass, talking);
      const player = world.player;
      const stopped: boolean = player.alive && cannotStep(player);
      const frozen: boolean = player.alive && isTimeHeld(player);
      if (stick.classList.contains(TOUCH.heldClass) !== stopped) stick.classList.toggle(TOUCH.heldClass, stopped);
      for (const view of views) {
        if (view.spec.kind === 'flask') {
          const flask: FlaskState | undefined = player.flasks[view.spec.slot];
          if (flask !== undefined) {
            view.vessel?.paint(readFlask(flask));
            view.vessel?.setMark(upgradeReady(world.content, player, flask));
          }
          continue;
        }
        if (!view.spec.filled) continue;
        const skill: SkillDef | undefined = player.skills[view.spec.slot] ?? undefined;
        if (view.root.classList.contains(TOUCH.heldClass) !== (frozen && skill !== undefined)) view.root.classList.toggle(TOUCH.heldClass, frozen && skill !== undefined);
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

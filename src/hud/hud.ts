import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { ActDef, ItemSlot } from '../../sim/content/types.ts';
import { slotOf } from '../../sim/items.ts';
import type { Command, ItemInstance, WorldEvent } from '../../sim/world/types.ts';
import { rowPress } from './row-press.ts';
import { HINT_PANELS, loadHints } from '../../sim/content/hints.ts';
import { createBrowserStore } from '../storage.ts';
import { createHintStore } from '../hints-store.ts';
import type { HintPanel } from '../../sim/content/hints.ts';
import { onWaypoint } from '../../sim/world/waypoints.ts';
import atlasCss from './atlas.css?inline';
import { createBanners } from './banners.ts';
import { createBarkStrip } from './bark-strip.ts';
import type { BarkStrip } from './bark-strip.ts';
import { createBossBar } from './boss-bar.ts';
import type { BossBar } from './boss-bar.ts';
import bossCss from './boss.css?inline';
import bannersCss from './banners.css?inline';
import fpsCss from './fps.css?inline';
import globesCss from './globes.css?inline';
import type { Banners } from './banners.ts';
import type { ActionId } from '../settings/bindings.ts';
import { flaskAction } from '../settings/bindings.ts';
import characterCss from './character.css?inline';
import contextCss from './context-notice.css?inline';
import { createCharacterPanel } from './character-panel.ts';
import type { CharacterPanel } from './character-panel.ts';
import type { HudContext, PanelView } from './context.ts';
import { createDeathPanel } from './death-panel.ts';
import deathCss from './death.css?inline';
import { createDialogueBox } from './dialogue-box.ts';
import dialogueCss from './dialogue.css?inline';
import type { DialogueBox } from './dialogue-box.ts';
import { el } from './dom.ts';
import type { FpsReadout } from './fps.ts';
import { createFpsReadout } from './fps.ts';
import type { FrameView } from './frame-meter.ts';
import { createFlaskBelt } from './flask-belt.ts';
import type { FlaskBelt } from './flask-belt.ts';
import flasksCss from './flasks.css?inline';
import { createGlobes } from './globes.ts';
import type { Globes } from './globes.ts';
import hudCss from './hud.css?inline';
import type { Hud, HudApi, HudPanel } from './hud-api.ts';
import { itemTooltip } from './item-tooltip.ts';
import type { ResolvedKeys } from '../settings/bindings.ts';
import { createHints } from './hints.ts';
import type { Hints } from './hints.ts';
import { createInventoryPanel } from './inventory-panel.ts';
import { createMapPanel } from './map-panel.ts';
import type { MapPanel } from './map-panel.ts';
import { watchFit } from './fit-view.ts';
import { createMenuButton, nextCalling } from './menu.ts';
import menuCss from './menu.css?inline';
import { PICKUP_NOTE, pickupLine } from './pickup-notes.ts';
import type { MenuButton } from './menu.ts';
import panelsCss from './panels.css?inline';
import { createQuestTracker } from './quest-tracker.ts';
import type { QuestTracker } from './quest-tracker.ts';
import questsCss from './quests.css?inline';
import { createSkillBar } from './skill-bar.ts';
import type { SkillBar } from './skill-bar.ts';
import { createNotices, createSurgeStatus, createXpBar } from './status.ts';
import type { Notices, WorldStatus, XpBar } from './status.ts';
import { createTooltip } from './tooltip.ts';
import type { Tooltip } from './tooltip.ts';
import treeCss from './tree.css?inline';
import chartPlacesCss from './chart-places.css?inline';
import chartStormCss from './chart-storm.css?inline';
import pickerCss from './skill-picker.css?inline';
import { createTreePanel } from './tree-panel.ts';
import type { ChartPanel } from './tree-panel.ts';
import { applyCover, coverOf, HUD_PANELS } from './panel-cover.ts';
import type { CoverState } from './panel-cover.ts';
import { chromeHidden } from './overlay-core.ts';
import { createCloseButton } from './close-button.ts';
import type { OverlayId } from './overlay-table.ts';
import type { OverlayManager } from './overlays.ts';
import { openWith, promptText, use } from './prompts.ts';
import tradeCss from './trade.css?inline';
import { createTradeHud } from './trade-hud.ts';
import type { TradeHud } from './trade-hud.ts';
import volumeCss from './volume.css?inline';
import { createVolumeButton } from './volume-panel.ts';
import { markOverlay } from './overlay-mark.ts';

const GROUND_HINT: string = 'pick up';

const PANEL_OVERLAY: Readonly<Record<HudPanel, OverlayId>> = {
  inventory: 'inventory',
  character: 'character',
  tree: 'chart',
  map: 'map',
};

const PANEL_NAME: Readonly<Record<HudPanel, string>> = {
  inventory: 'Inventory',
  character: 'Character',
  tree: 'Skill Tree',
  map: 'Map',
};


export function createHud(root: HTMLElement, api: HudApi): Hud {
  root.classList.add('hud');
  const style: HTMLStyleElement = el('style', '', root);
  watchFit(root);
  style.textContent = `${hudCss}\n${globesCss}\n${fpsCss}\n${bannersCss}\n${panelsCss}\n${volumeCss}\n${dialogueCss}\n${questsCss}\n${bossCss}\n${treeCss}\n${chartPlacesCss}\n${chartStormCss}\n${atlasCss}\n${characterCss}\n${deathCss}\n${flasksCss}\n${tradeCss}\n${contextCss}\n${pickerCss}\n${menuCss}`;
  const hovered: Set<HTMLElement> = new Set<HTMLElement>();
  const track = (element: HTMLElement): void => {
    element.addEventListener('pointerenter', (): void => {
      hovered.add(element);
    });
    element.addEventListener('pointerleave', (): void => {
      hovered.delete(element);
    });
  };

  const tooltip: Tooltip = createTooltip(root);
  const context: HudContext = { api, tooltip };
  const globes: Globes = createGlobes(root);
  const flaskKey = (slot: number): string => {
    const action: ActionId | null = flaskAction(slot);
    return action === null ? '' : api.settings.keys().labelOf(action);
  };
  const flasks: FlaskBelt = createFlaskBelt(globes, api.world.player.flasks, flaskKey, (resource: FlaskResource, on: boolean): void => globes.setRestoring(resource, on));
  const fps: FpsReadout = createFpsReadout(root, (): string => api.qualityTier());
  const surge: WorldStatus = createSurgeStatus(root);
  const banners: Banners = createBanners(root);
  const death: WorldStatus = createDeathPanel(root, api);
  const quests: QuestTracker = createQuestTracker(root);

  const dialogue: DialogueBox = createDialogueBox(root, context);
  track(dialogue.element);
  const barks: BarkStrip = createBarkStrip(root, context);
  const bossBar: BossBar = createBossBar(root);

  const bottom: HTMLDivElement = el('div', 'hud-bottom', root);
  const notices: Notices = createNotices(bottom);
  let bagTimer: number | null = null;
  const acknowledgeBag = (): void => {
    if (bagTimer !== null) window.clearTimeout(bagTimer);
    root.classList.add(PICKUP_NOTE.bagClass);
    bagTimer = window.setTimeout((): void => {
      root.classList.remove(PICKUP_NOTE.bagClass);
      bagTimer = null;
    }, PICKUP_NOTE.bagMs);
  };
  const xp: XpBar = createXpBar(bottom);
  const row: HTMLDivElement = el('div', 'hud-row', bottom);

  const overlays: OverlayManager = api.overlays;
  const isOpen = (panel: HudPanel): boolean => overlays.shown(PANEL_OVERLAY[panel]);
  const isLive = (panel: HudPanel): boolean => overlays.live(PANEL_OVERLAY[panel]);
  const buttons: Record<HudPanel, MenuButton | null> = { inventory: null, character: null, tree: null, map: null };
  const map: MapPanel = createMapPanel(root, context, (): void => {
    overlays.send({ type: 'close', id: 'map' });
  });
  root.insertBefore(map.element, bottom);
  const inventoryPanel: PanelView = createInventoryPanel(root, context);
  const characterPanel: CharacterPanel = createCharacterPanel(root, context, inventoryPanel.element);
  const chartPanel: ChartPanel = createTreePanel(root, context, (): void => {
    overlays.send({ type: 'close', id: 'chart' });
  });
  const panels: Record<HudPanel, PanelView> = {
    inventory: inventoryPanel,
    character: characterPanel,
    tree: chartPanel,
    map,
  };
  let mapWanted: boolean = false;

  const hints: Hints = createHints(bottom, loadHints(api.world.content), createHintStore(createBrowserStore()), (): ResolvedKeys => api.settings.keys(), (): ReadonlySet<HintPanel> => new Set<HintPanel>(HINT_PANELS.filter((id: HintPanel): boolean => isOpen(id))), api.touch);
  const pending: WorldEvent[] = [];

  const backdrop: HTMLDivElement = el('div', 'panel-backdrop', null);
  root.insertBefore(backdrop, root.firstChild);

  for (const panel of HUD_PANELS) {
    const view: PanelView = panels[panel];
    const id: OverlayId = PANEL_OVERLAY[panel];
    if (panel !== 'tree') {
      createCloseButton(view.element, PANEL_NAME[panel], (): void => {
        overlays.send({ type: 'close', id });
      });
    }
    overlays.register(id, {
      element: view.element,
      show(): void {
        api.playUi('panel_open');
        view.refresh();
        view.element.classList.add('open');
        markOverlay(view.element, true);
        buttons[panel]?.setActive(true);
      },
      hide(): void {
        api.playUi('panel_close');
        view.element.classList.remove('open');
        markOverlay(view.element, false);
        buttons[panel]?.setActive(false);
        tooltip.hide();
        hovered.delete(view.element);
      },
    });
  }

  if (api.touch) overlays.send({ type: 'layout', narrow: true });

  overlays.subscribe((): void => {
    const live: Record<HudPanel, boolean> = { inventory: isLive('inventory'), character: isLive('character'), tree: isLive('tree'), map: isLive('map') };
    backdrop.classList.toggle('visible', HUD_PANELS.some((panel: HudPanel): boolean => live[panel]));
    const cover: CoverState = coverOf(live);
    applyCover(root, { side: cover.side, full: cover.full || chromeHidden(overlays.state()) });
  });

  const toggle = (panel: HudPanel): void => {
    overlays.send({ type: 'toggle', id: PANEL_OVERLAY[panel] });
  };
  const fromRow = (open: () => void): void => {
    const instead: Command | null = rowPress(api.world);
    if (instead === null) open();
    else api.send(instead);
  };

  for (const panel of HUD_PANELS) track(panels[panel].element);
  const trade: TradeHud = createTradeHud(root, context, track, overlays, panels.inventory.element);
  for (const view of trade.panels) {
    createCloseButton(view.element, 'Trade', (): void => {
      overlays.send({ type: 'close', id: 'trade' });
    });
  }

  const keyOf = (action: ActionId): string => api.settings.keys().labelOf(action);
  buttons.inventory = createMenuButton(row, 'inventory', 'Inventory', keyOf('inventory'), (): void => fromRow((): void => toggle('inventory')), track);
  buttons.character = createMenuButton(row, 'character', 'Character', keyOf('character'), (): void => fromRow((): void => toggle('character')), track);
  const skillBar: SkillBar = createSkillBar(row, context, track);
  buttons.tree = createMenuButton(row, 'tree', 'Skill Tree', keyOf('tree'), (): void => fromRow((): void => toggle('tree')), track);
  buttons.map = createMenuButton(row, 'map', 'Map', keyOf('map'), (): void => fromRow((): void => toggle('map')), track);
  createVolumeButton(row, api.audio, track, (): void => fromRow((): void => api.openSettings('sound')));
  const showKeys = (): void => {
    buttons.inventory?.setKey(keyOf('inventory'));
    buttons.character?.setKey(keyOf('character'));
    buttons.tree?.setKey(keyOf('tree'));
    buttons.map?.setKey(keyOf('map'));
    skillBar.refreshKeys();
    flasks.refreshKeys();
    fps.setVisible(api.settings.get().graphics.showFps);
  };
  api.settings.subscribe(showKeys);
  fps.setVisible(api.settings.get().graphics.showFps);
  root.addEventListener('click', (event: MouseEvent): void => {
    const target: EventTarget | null = event.target;
    if (!(target instanceof Element)) return;
    const button: Element | null = target.closest('button');
    if (button !== null && !button.classList.contains('hud-menu-btn')) api.playUi('click');
  });

  const refreshOpen = (panel: HudPanel): void => {
    if (isOpen(panel)) panels[panel].refresh();
  };
  let alive: boolean = api.world.player.alive;
  let chartCalling: boolean = false;
  let chartPoints: number = 0;

  return {
    refreshItems(): void {
      refreshOpen('inventory');
      refreshOpen('character');
    },
    update(dt: number, view: FrameView): void {
      const world = api.world;
      fps.frame(performance.now(), view);
      globes.update(world.player, dt);
      flasks.update(world.player);
      skillBar.update(world.player);
      xp.update(world.player, world.content);
      surge.update(world);
      death.update(world);
      quests.update(world);
      hints.update(world, pending.splice(0, pending.length));
      bossBar.update(world);
      buttons.tree?.setBadge(world.player.skillPoints);
      chartCalling = nextCalling(chartCalling, chartPoints, world.player.skillPoints, isLive('tree'));
      chartPoints = world.player.skillPoints;
      buttons.tree?.setCalling(chartCalling);
      if (isLive('map')) map.update(dt);
      if (isLive('tree')) chartPanel.update(dt);
      if (isLive('character')) characterPanel.update(dt);
      if (world.player.alive !== alive) {
        alive = world.player.alive;
        overlays.send({ type: alive ? 'respawn' : 'death' });
      }
      trade.update();
      if (mapWanted && onWaypoint(world)) {
        mapWanted = false;
        if (world.dialogue === null && world.player.alive) overlays.send({ type: 'open', id: 'map' });
      } else if (mapWanted && (world.player.intent.type !== 'move' || world.player.action !== null)) {
        mapWanted = false;
      }
    },
    handleEvents(events: readonly WorldEvent[]): void {
      pending.push(...events);
      for (const event of events) {
        switch (event.type) {
          case 'damage':
            if (event.targetTeam === 'player') globes.flashLife();
            break;
          case 'skill_start':
            if (event.actorId === api.world.player.id) skillBar.press(event.skill.id);
            break;
          case 'surge':
            banners.show(`SURGE ${event.surge}`, null, 'surge');
            break;
          case 'zone_changed':
            banners.show(api.world.zone.name, null, 'zone');
            overlays.send({ type: 'interrupt', cause: 'zone' });
            mapWanted = false;
            barks.clear();
            break;
          case 'checkpoint':
            banners.show('Checkpoint', null, 'checkpoint');
            break;
          case 'dialogue_line':
            if (event.index === 0) overlays.send({ type: 'interrupt', cause: 'dialogue' });
            dialogue.show(event);
            break;
          case 'dialogue_closed':
            dialogue.close();
            hovered.delete(dialogue.element);
            break;
          case 'quest_started':
          case 'quest_advanced':
          case 'quest_completed':
            quests.handle(event, api.world);
            break;
          case 'act_ended': {
            const act: ActDef | undefined = api.world.content.world.acts.find((candidate: ActDef): boolean => candidate.id === event.act);
            if (act !== undefined) banners.show(`${act.title} complete`, act.end?.line ?? null, 'act');
            break;
          }
          case 'triggered':
            break;
          case 'waypoint_unlocked':
            banners.show('Waypoint', `${openWith(api.touch, 'map', keyOf('map'))} to travel between waypoints`, 'checkpoint');
            break;
          case 'exit_locked':
            notices.say(event.hint);
            break;
          case 'bark':
            barks.say(event.speaker, event.line);
            break;
          case 'skill_unlocked':
            if (event.slot !== null) skillBar.learned(event.slot);
            banners.show(api.world.content.skills.get(event.skill)?.name ?? event.skill, event.slot === null ? 'New skill · bar full' : 'New skill', 'quest');
            break;
          case 'level_up':
            banners.show(`LEVEL ${event.level}`, 'Skill point gained', 'level');
            refreshOpen('character');
            break;
          case 'chart_point':
            if (event.source !== 'level' && !hints.teaches('skill_point')) notices.say(`${openWith(api.touch, 'skill tree', keyOf('tree'))} to choose a place`);
            refreshOpen('tree');
            break;
          case 'notice':
            notices.show(event.reason);
            break;
          case 'flask_used':
            flasks.used(event.slot);
            break;
          case 'character_changed':
            refreshOpen('inventory');
            refreshOpen('character');
            refreshOpen('tree');
            break;
          case 'pickup': {
            refreshOpen('inventory');
            const line: string | null = pickupLine(api.world.content, event.ground);
            if (line !== null) {
              notices.say(line);
              acknowledgeBag();
            }
            break;
          }

          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'silence':
          case 'zone_edited':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'moment_gone':
          case 'path_marked':
          case 'skill_impact':
          case 'hazard':
          case 'guarded':
          case 'skill_interrupt':
          case 'projectile_spawn':
          case 'projectile_end':
          case 'death':
          case 'monster_spawn':
          case 'monster_remove':
          case 'aggro':
          case 'drop':
          case 'area':
          case 'chain':
          case 'beam':
          case 'blink':
          case 'brand':
          case 'xp':
          case 'surge_cleared':
          case 'player_respawn':
          case 'hero_step':
          case 'wake':
          case 'explored':
          case 'boss_phase':
          case 'revive':
          case 'flasks_refilled':
            break;
        }
      }
    },
    showGroundItem(item: ItemInstance, x: number, y: number): void {
      const slot: ItemSlot | null = slotOf(api.world.content, item);
      const equipped: ItemInstance | null = slot === null ? null : api.world.player.equipped[slot];
      tooltip.show(itemTooltip(api, item, equipped, promptText(api.touch, use(GROUND_HINT))), x, y, null);
    },
    moveGroundItem(x: number, y: number): void {
      tooltip.move(x, y);
    },
    hideGroundItem(): void {
      tooltip.hide();
    },
    isPointerOverUi(): boolean {
      return hovered.size > 0;
    },
    togglePanel(panel: HudPanel): void {
      fromRow((): void => toggle(panel));
    },
    requestMap(wanted: boolean): void {
      mapWanted = wanted;
    },
    closePanels(): boolean {
      if (skillBar.closePicker()) return true;
      if (!overlays.hasTop()) return false;
      overlays.send({ type: 'escape' });
      return true;
    },
  };
}

import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { ItemSlot } from '../../sim/content/types.ts';
import { slotOf } from '../../sim/items.ts';
import type { ItemInstance, WorldEvent } from '../../sim/world/types.ts';
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
import type { Banners } from './banners.ts';
import type { ActionId } from '../settings/bindings.ts';
import { flaskAction } from '../settings/bindings.ts';
import characterCss from './character.css?inline';
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
import { createMenuButton } from './menu.ts';
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
import { createTreePanel } from './tree-panel.ts';
import tradeCss from './trade.css?inline';
import { createTradeHud } from './trade-hud.ts';
import type { TradeHud } from './trade-hud.ts';
import volumeCss from './volume.css?inline';
import { createVolumeButton } from './volume-panel.ts';

const GROUND_HINT: string = 'Click to pick up';
const PANEL_IDS: readonly HudPanel[] = ['inventory', 'character', 'tree', 'map'];

export function createHud(root: HTMLElement, api: HudApi): Hud {
  root.classList.add('hud');
  const style: HTMLStyleElement = el('style', '', root);
  style.textContent = `${hudCss}\n${panelsCss}\n${volumeCss}\n${dialogueCss}\n${questsCss}\n${bossCss}\n${treeCss}\n${atlasCss}\n${characterCss}\n${deathCss}\n${flasksCss}\n${tradeCss}`;
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
  const flasks: FlaskBelt = createFlaskBelt(root, api.world.player.flasks, flaskKey, (resource: FlaskResource, on: boolean): void => globes.setRestoring(resource, on));
  const fps: FpsReadout = createFpsReadout(root);
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
  const xp: XpBar = createXpBar(bottom);
  const row: HTMLDivElement = el('div', 'hud-row', bottom);

  const open: Record<HudPanel, boolean> = { inventory: false, character: false, tree: false, map: false };
  const buttons: Record<HudPanel, MenuButton | null> = { inventory: null, character: null, tree: null, map: null };
  const map: MapPanel = createMapPanel(root, context, (): void => setOpen('map', false));
  root.insertBefore(map.element, bottom);
  const inventoryPanel: PanelView = createInventoryPanel(root, context);
  const characterPanel: CharacterPanel = createCharacterPanel(root, context, inventoryPanel.element);
  const panels: Record<HudPanel, PanelView> = {
    inventory: inventoryPanel,
    character: characterPanel,
    tree: createTreePanel(root, context),
    map,
  };
  let mapWanted: boolean = false;

  const hints: Hints = createHints(bottom, loadHints(api.world.content), createHintStore(createBrowserStore()), (): ResolvedKeys => api.settings.keys(), (): ReadonlySet<HintPanel> => new Set<HintPanel>(HINT_PANELS.filter((id: HintPanel): boolean => open[id])));
  const pending: WorldEvent[] = [];

  const grid: HTMLDivElement = el('div', 'hud-grid', null);
  root.insertBefore(grid, root.firstChild);

  function setOpen(panel: HudPanel, next: boolean): void {
    if (open[panel] !== next) api.playUi(next ? 'panel_open' : 'panel_close');
    open[panel] = next;
    const view: PanelView = panels[panel];
    view.element.classList.toggle('open', next);
    grid.classList.toggle('visible', PANEL_IDS.some((id: HudPanel): boolean => open[id]));
    buttons[panel]?.setActive(next);
    if (next) {
      view.refresh();
    } else {
      tooltip.hide();
      hovered.delete(view.element);
    }
  }

  const toggle = (panel: HudPanel): void => {
    setOpen(panel, !open[panel]);
  };

  for (const panel of PANEL_IDS) track(panels[panel].element);
  const trade: TradeHud = createTradeHud(root, context, track, {
    element: panels.inventory.element,
    isOpen: (): boolean => open.inventory,
    setOpen: (next: boolean): void => setOpen('inventory', next),
    besideOpen: (): boolean => open.character,
    closeBeside: (): void => setOpen('character', false),
  });

  const keyOf = (action: ActionId): string => api.settings.keys().labelOf(action);
  buttons.inventory = createMenuButton(row, 'Inventory', keyOf('inventory'), (): void => toggle('inventory'), track);
  buttons.character = createMenuButton(row, 'Character', keyOf('character'), (): void => toggle('character'), track);
  const skillBar: SkillBar = createSkillBar(row, context, track);
  buttons.tree = createMenuButton(row, 'Skills', keyOf('tree'), (): void => toggle('tree'), track);
  buttons.map = createMenuButton(row, 'Map', keyOf('map'), (): void => toggle('map'), track);
  createVolumeButton(row, api.audio, track, (): void => api.openSettings('sound'));
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
    if (open[panel]) panels[panel].refresh();
  };

  return {
    refreshItems(): void {
      refreshOpen('inventory');
      refreshOpen('character');
    },
    update(dt: number): void {
      const world = api.world;
      fps.frame(performance.now());
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
      if (open.map) map.update(dt);
      if (open.character) characterPanel.update(dt);
      trade.update();
      if (mapWanted && onWaypoint(world)) {
        mapWanted = false;
        if (world.dialogue === null && world.player.alive) setOpen('map', true);
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
            mapWanted = false;
            barks.clear();
            break;
          case 'checkpoint':
            banners.show('Checkpoint', null, 'checkpoint');
            break;
          case 'dialogue_line':
            dialogue.show(event);
            break;
          case 'dialogue_closed':
            dialogue.close();
            hovered.delete(dialogue.element);
            break;
          case 'quest_started':
            banners.show(api.world.content.quests.get(event.quest)?.name ?? '', 'New quest', 'quest');
            break;
          case 'quest_advanced':
            quests.handle(event, api.world);
            break;
          case 'quest_completed':
            banners.show(api.world.content.quests.get(event.quest)?.name ?? '', 'Quest complete', 'quest');
            break;
          case 'waypoint_unlocked':
            banners.show('Waypoint', `Open the map with ${keyOf('map')} to travel between waypoints`, 'checkpoint');
            break;
          case 'exit_locked':
            notices.say(event.hint);
            break;
          case 'bark':
            barks.say(event.speaker, event.line);
            break;
          case 'level_up':
            banners.show(`LEVEL ${event.level}`, 'Skill point gained', 'level');
            refreshOpen('tree');
            refreshOpen('character');
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
          case 'pickup':
            refreshOpen('inventory');
            break;
          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'silence':
          case 'zone_edited':
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
          case 'xp':
          case 'surge_cleared':
          case 'player_respawn':
          case 'hero_step':
          case 'explored':
          case 'boss_phase':
          case 'flasks_refilled':
            break;
        }
      }
    },
    showGroundItem(item: ItemInstance, x: number, y: number): void {
      const slot: ItemSlot | null = slotOf(api.world.content, item);
      const equipped: ItemInstance | null = slot === null ? null : api.world.player.equipped[slot];
      tooltip.show(itemTooltip(api, item, equipped, GROUND_HINT), x, y);
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
      toggle(panel);
    },
    requestMap(wanted: boolean): void {
      mapWanted = wanted;
    },
    closePanels(): boolean {
      let anyOpen: boolean = false;
      if (trade.close()) anyOpen = true;
      for (const panel of PANEL_IDS) {
        if (open[panel]) {
          anyOpen = true;
          setOpen(panel, false);
        }
      }
      return anyOpen;
    },
  };
}

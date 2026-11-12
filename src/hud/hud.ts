import type { WorldEvent } from '../../sim/world/types.ts';
import { onWaypoint } from '../../sim/world/waypoints.ts';
import atlasCss from './atlas.css?inline';
import { createBanners } from './banners.ts';
import { createBarkStrip } from './bark-strip.ts';
import type { BarkStrip } from './bark-strip.ts';
import { createBossBar } from './boss-bar.ts';
import type { BossBar } from './boss-bar.ts';
import bossCss from './boss.css?inline';
import type { Banners } from './banners.ts';
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
import { createGlobes } from './globes.ts';
import type { Globes } from './globes.ts';
import hudCss from './hud.css?inline';
import type { Hud, HudApi, HudPanel } from './hud-api.ts';
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
import { createVolumeControl } from './volume-panel.ts';
import type { VolumeControl } from './volume-panel.ts';

const PANEL_IDS: readonly HudPanel[] = ['inventory', 'character', 'tree', 'map'];

export function createHud(root: HTMLElement, api: HudApi): Hud {
  root.classList.add('hud');
  const style: HTMLStyleElement = el('style', '', root);
  style.textContent = `${hudCss}\n${panelsCss}\n${volumeCss}\n${dialogueCss}\n${questsCss}\n${bossCss}\n${treeCss}\n${atlasCss}\n${characterCss}\n${deathCss}\n${tradeCss}`;
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

  buttons.inventory = createMenuButton(row, 'Inventory', 'I', (): void => toggle('inventory'), track);
  buttons.character = createMenuButton(row, 'Character', 'C', (): void => toggle('character'), track);
  const skillBar: SkillBar = createSkillBar(row, context, track);
  buttons.tree = createMenuButton(row, 'Skills', 'T', (): void => toggle('tree'), track);
  buttons.map = createMenuButton(row, 'Map', 'M', (): void => toggle('map'), track);
  const volume: VolumeControl = createVolumeControl(row, api.audio, track, (opened: boolean): void => api.playUi(opened ? 'panel_open' : 'panel_close'));
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
    update(dt: number): void {
      const world = api.world;
      fps.frame(performance.now());
      globes.update(world.player, dt);
      skillBar.update(world.player);
      xp.update(world.player, world.content);
      surge.update(world);
      death.update(world);
      quests.update(world);
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
            banners.show('Waypoint', 'Open the map with M to travel between waypoints', 'checkpoint');
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
          case 'character_changed':
            refreshOpen('inventory');
            refreshOpen('character');
            refreshOpen('tree');
            break;
          case 'pickup':
            refreshOpen('inventory');
            break;
          case 'skill_impact':
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
            break;
        }
      }
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
      let anyOpen: boolean = volume.close();
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

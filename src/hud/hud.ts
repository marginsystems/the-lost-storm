import type { WorldEvent } from '../../sim/world/types.ts';
import { createBanners } from './banners.ts';
import type { Banners } from './banners.ts';
import type { HudContext, PanelView } from './context.ts';
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
import { createMenuButton } from './menu.ts';
import type { MenuButton } from './menu.ts';
import panelsCss from './panels.css?inline';
import { createSkillBar } from './skill-bar.ts';
import type { SkillBar } from './skill-bar.ts';
import { createDeathOverlay, createNotices, createSurgeStatus, createXpBar } from './status.ts';
import type { Notices, WorldStatus, XpBar } from './status.ts';
import { createTooltip } from './tooltip.ts';
import type { Tooltip } from './tooltip.ts';
import { createTreePanel } from './tree-panel.ts';
import volumeCss from './volume.css?inline';
import { createVolumeControl } from './volume-panel.ts';
import type { VolumeControl } from './volume-panel.ts';

const PANEL_IDS: readonly HudPanel[] = ['inventory', 'tree'];

export function createHud(root: HTMLElement, api: HudApi): Hud {
  root.classList.add('hud');
  const style: HTMLStyleElement = el('style', '', root);
  style.textContent = `${hudCss}\n${panelsCss}\n${volumeCss}\n${dialogueCss}`;
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
  const death: WorldStatus = createDeathOverlay(root);

  const dialogue: DialogueBox = createDialogueBox(root, context);
  track(dialogue.element);

  const bottom: HTMLDivElement = el('div', 'hud-bottom', root);
  const notices: Notices = createNotices(bottom);
  const xp: XpBar = createXpBar(bottom);
  const row: HTMLDivElement = el('div', 'hud-row', bottom);

  const panels: Record<HudPanel, PanelView> = {
    inventory: createInventoryPanel(root, context),
    tree: createTreePanel(root, context),
  };
  const open: Record<HudPanel, boolean> = { inventory: false, tree: false };
  const buttons: Record<HudPanel, MenuButton | null> = { inventory: null, tree: null };

  const setOpen = (panel: HudPanel, next: boolean): void => {
    if (open[panel] !== next) api.playUi(next ? 'panel_open' : 'panel_close');
    open[panel] = next;
    const view: PanelView = panels[panel];
    view.element.classList.toggle('open', next);
    buttons[panel]?.setActive(next);
    if (next) {
      view.refresh();
    } else {
      tooltip.hide();
      hovered.delete(view.element);
    }
  };

  const toggle = (panel: HudPanel): void => {
    setOpen(panel, !open[panel]);
  };

  for (const panel of PANEL_IDS) track(panels[panel].element);

  buttons.inventory = createMenuButton(row, 'Inventory', 'I', (): void => toggle('inventory'), track);
  const skillBar: SkillBar = createSkillBar(row, context, track);
  buttons.tree = createMenuButton(row, 'Skills', 'T', (): void => toggle('tree'), track);
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
      buttons.tree?.setBadge(world.player.skillPoints);
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
          case 'level_up':
            banners.show(`LEVEL ${event.level}`, 'Skill point gained', 'level');
            refreshOpen('tree');
            break;
          case 'notice':
            notices.show(event.reason);
            break;
          case 'character_changed':
            refreshOpen('inventory');
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
    closePanels(): boolean {
      let anyOpen: boolean = volume.close();
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

import type { AudioControls } from '../audio/settings.ts';
import type { SettingsSection } from '../settings/settings.ts';
import { SETTINGS_SECTIONS } from '../settings/settings.ts';
import type { GlitchSettingsStore } from '../glitch/glitch-settings.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label } from './dom.ts';
import { mountControls } from './settings-controls.ts';
import type { ControlsPage } from './settings-controls.ts';
import { mountGraphics } from './settings-graphics.ts';
import pauseCss from './pause.css?inline';
import { mountVolumeSliders } from './volume-panel.ts';

const SECTION_LABELS: Readonly<Record<SettingsSection, string>> = { graphics: 'Graphics', sound: 'Sound', controls: 'Controls' };

export interface PauseHooks {
  readonly settings: SettingsStore;
  readonly glitches: GlitchSettingsStore;
  readonly audio: AudioControls;
  onOpen(): void;
  onClose(): void;
  onTitle(): void;
}

export interface PauseMenu {
  readonly isOpen: boolean;
  open(section: SettingsSection | null): void;
  close(): void;
}

type View = 'main' | 'settings';

function button(parent: HTMLElement, className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node: HTMLButtonElement = el('button', className, parent);
  node.type = 'button';
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

export function createPauseMenu(root: HTMLElement, hooks: PauseHooks): PauseMenu {
  const style: HTMLStyleElement = el('style', '', root);
  style.textContent = pauseCss;
  const overlay: HTMLDivElement = el('div', 'pause', root);
  const card: HTMLDivElement = el('div', 'pause-card', overlay);
  let isOpen: boolean = false;
  let view: View = 'main';
  let section: SettingsSection = 'graphics';

  const main: HTMLDivElement = el('div', 'pause-view pause-main', card);
  label('pause-title', 'Paused', main);
  const settingsView: HTMLDivElement = el('div', 'pause-view pause-settings', card);

  const head: HTMLDivElement = el('div', 'set-head', settingsView);
  const tabs: HTMLDivElement = el('div', 'set-tabs', head);
  const tabButtons: Map<SettingsSection, HTMLButtonElement> = new Map<SettingsSection, HTMLButtonElement>();
  const marker: HTMLDivElement = el('div', 'set-marker', tabs);
  for (const id of SETTINGS_SECTIONS) {
    tabButtons.set(
      id,
      button(tabs, 'set-tab', SECTION_LABELS[id], (): void => showSection(id)),
    );
  }
  button(head, 'set-text-btn', 'Back', (): void => setView('main'));

  const body: HTMLDivElement = el('div', 'set-body', settingsView);
  const pages: Map<SettingsSection, HTMLDivElement> = new Map<SettingsSection, HTMLDivElement>();
  for (const id of SETTINGS_SECTIONS) pages.set(id, el('div', 'set-page', body));
  const graphicsPage: HTMLDivElement | undefined = pages.get('graphics');
  const soundPage: HTMLDivElement | undefined = pages.get('sound');
  const controlsPage: HTMLDivElement | undefined = pages.get('controls');
  if (graphicsPage === undefined || soundPage === undefined || controlsPage === undefined) throw new Error('Settings pages are missing');
  mountGraphics(graphicsPage, hooks.settings, hooks.glitches);
  mountVolumeSliders(soundPage, hooks.audio);
  const controls: ControlsPage = mountControls(controlsPage, hooks.settings);

  const layoutMarker = (): void => {
    const active: HTMLButtonElement | undefined = tabButtons.get(section);
    if (active === undefined) return;
    marker.style.setProperty('--x', `${active.offsetLeft}px`);
    marker.style.setProperty('--w', `${active.offsetWidth}px`);
  };

  function showSection(next: SettingsSection): void {
    controls.cancel();
    section = next;
    const order: number = SETTINGS_SECTIONS.indexOf(next);
    for (const [id, page] of pages) {
      const index: number = SETTINGS_SECTIONS.indexOf(id);
      page.dataset['state'] = index === order ? 'active' : index < order ? 'before' : 'after';
    }
    for (const [id, tab] of tabButtons) tab.classList.toggle('active', id === next);
    layoutMarker();
  }

  function setView(next: View): void {
    controls.cancel();
    view = next;
    card.dataset['view'] = next;
    main.classList.toggle('active', next === 'main');
    settingsView.classList.toggle('active', next === 'settings');
    if (next === 'settings') layoutMarker();
  }

  const resume = (): void => api.close();

  button(main, 'pause-btn', 'Resume', resume);
  button(main, 'pause-btn', 'Settings', (): void => setView('settings'));
  button(main, 'pause-btn', 'Return to title', (): void => {
    api.close();
    hooks.onTitle();
  });

  const onKey = (event: KeyboardEvent): void => {
    if (!isOpen) return;
    event.stopImmediatePropagation();
    if (event.type === 'keyup' || event.repeat) return;
    if (controls.capturing()) {
      event.preventDefault();
      if (event.code === 'Escape') controls.cancel();
      else controls.bind(event.code);
      return;
    }
    const isPause: boolean = hooks.settings.keys().actionOf(event.code) === 'pause';
    if (event.code === 'Escape' || isPause) {
      if (view === 'settings') setView('main');
      else resume();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('contextmenu', (event: MouseEvent): void => {
    if (isOpen) event.preventDefault();
  });

  const api: PauseMenu = {
    get isOpen(): boolean {
      return isOpen;
    },
    open(target: SettingsSection | null): void {
      if (!isOpen) {
        isOpen = true;
        window.dispatchEvent(new Event('blur'));
        overlay.classList.add('open');
        hooks.onOpen();
      }
      if (target !== null) {
        showSection(target);
        setView('settings');
      } else {
        setView('main');
      }
    },
    close(): void {
      if (!isOpen) return;
      controls.cancel();
      isOpen = false;
      overlay.classList.remove('open');
      hooks.onClose();
    },
  };
  showSection(section);
  setView('main');
  return api;
}

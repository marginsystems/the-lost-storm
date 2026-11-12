import { choicesOpen } from '../../sim/world/death.ts';
import type { RespawnChoice, World } from '../../sim/world/types.ts';
import { BACKDROPS } from '../dither/backdrops.ts';
import type { DitherLayer } from '../dither/layer.ts';
import { mountDither } from '../dither/layer.ts';
import { el, label, setText } from './dom.ts';
import type { HudApi } from './hud-api.ts';
import type { WorldStatus } from './status.ts';
import { markOverlay } from './overlay-mark.ts';

const DEATH_PANEL: { readonly confirmKeys: readonly string[]; readonly backdropRatio: number } = {
  confirmKeys: ['Enter', 'Space'],
  backdropRatio: 1,
};

interface ChoiceButton {
  readonly choice: RespawnChoice;
  readonly text: string;
  readonly hint: string;
}

const CHOICES: readonly ChoiceButton[] = [
  { choice: 'checkpoint', text: 'Return to checkpoint', hint: 'Enter' },
  { choice: 'town', text: 'Return to the fire', hint: '' },
];

function causeText(world: World): string {
  const death = world.death;
  if (death === null) return '';
  return `Slain by ${death.killer} with ${death.skill}`;
}

export function createDeathPanel(parent: HTMLElement, api: HudApi): WorldStatus {
  const screen: HTMLDivElement = el('div', 'death-screen', parent);
  const backdrop: DitherLayer = mountDither(screen, { className: 'death-backdrop', layers: BACKDROPS.death, eager: false, marksHost: true, maxRatio: DEATH_PANEL.backdropRatio });
  const panel: HTMLDivElement = el('div', 'death-panel', screen);
  label('death-title', 'You have fallen', panel);
  const cause: HTMLDivElement = el('div', 'death-cause', panel);
  const actions: HTMLDivElement = el('div', 'death-actions', panel);
  const buttons: HTMLButtonElement[] = [];
  let visible: boolean = false;
  let ready: boolean = false;

  const choose = (choice: RespawnChoice): void => {
    if (visible && ready) api.send({ type: 'respawn', choice });
  };

  api.overlays.register('death', {
    element: screen,
    show(): void {
      visible = true;
      backdrop.paint();
      screen.classList.add('visible');
      markOverlay(screen, true);
    },
    hide(): void {
      visible = false;
      screen.classList.remove('visible');
      markOverlay(screen, false);
    },
  });

  for (const entry of CHOICES) {
    const button: HTMLButtonElement = el('button', 'death-button', actions);
    button.type = 'button';
    el('span', 'death-button-text', button).textContent = entry.text;
    if (entry.hint !== '') el('span', 'death-button-hint', button).textContent = entry.hint;
    button.addEventListener('click', (): void => {
      choose(entry.choice);
    });
    buttons.push(button);
  }

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!visible || event.repeat || (event.target instanceof HTMLButtonElement && buttons.includes(event.target)) || !DEATH_PANEL.confirmKeys.includes(event.code)) return;
    event.preventDefault();
    choose('checkpoint');
  });

  return {
    update(world: World): void {
      const fallen: boolean = !world.player.alive && world.death !== null;
      if (fallen) setText(cause, causeText(world), false);
      const open: boolean = fallen && choicesOpen(world);
      if (open !== ready) {
        ready = open;
        screen.classList.toggle('ready', open);
        for (const button of buttons) button.disabled = !open;
      }
    },
  };
}

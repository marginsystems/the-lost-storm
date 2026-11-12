import { choicesOpen } from '../../sim/world/death.ts';
import type { RespawnChoice, World } from '../../sim/world/types.ts';
import { el, label, setText } from './dom.ts';
import type { HudApi } from './hud-api.ts';
import type { WorldStatus } from './status.ts';

const DEATH_PANEL: { readonly confirmKeys: readonly string[] } = {
  confirmKeys: ['Enter', 'Space'],
};

interface ChoiceButton {
  readonly choice: RespawnChoice;
  readonly text: string;
  readonly hint: string;
}

const CHOICES: readonly ChoiceButton[] = [
  { choice: 'checkpoint', text: 'Return to checkpoint', hint: 'Enter' },
  { choice: 'town', text: 'Return to town', hint: '' },
];

function causeText(world: World): string {
  const death = world.death;
  if (death === null) return '';
  return `Slain by ${death.killer} with ${death.skill}`;
}

export function createDeathPanel(parent: HTMLElement, api: HudApi): WorldStatus {
  const screen: HTMLDivElement = el('div', 'death-screen', parent);
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
      if (fallen !== visible) {
        visible = fallen;
        screen.classList.toggle('visible', fallen);
      }
      const open: boolean = fallen && choicesOpen(world);
      if (open !== ready) {
        ready = open;
        screen.classList.toggle('ready', open);
        for (const button of buttons) button.disabled = !open;
      }
    },
  };
}

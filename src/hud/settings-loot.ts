import { ITEM_SLOTS } from '../../sim/content/types.ts';
import type { ItemSlot, RarityDef } from '../../sim/content/types.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label } from './dom.ts';

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = { head: 'Helmets', chest: 'Chest', hands: 'Gloves', legs: 'Legs', feet: 'Boots', weapon: 'Weapons', charm: 'Charms' };

function control(parent: HTMLElement, name: string, act: () => void): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'loot-choice', parent);
  button.type = 'button';
  button.textContent = name;
  button.addEventListener('click', act);
  return button;
}

export function mountLoot(page: HTMLElement, settings: SettingsStore, rarities: readonly RarityDef[]): void {
  label('set-name', 'Ground loot', page);
  label('set-detail', 'Choose which equipment names appear. Your hired follower collects the same pieces.', page);
  const presets: HTMLDivElement = el('div', 'loot-options', page);
  control(presets, 'Show everything', (): void => settings.setLoot({}));
  for (const rarity of rarities.slice(-2)) {
    const minimum: number = rarities.indexOf(rarity);
    control(presets, minimum === rarities.length - 1 ? rarity.name + ' only' : rarity.name + ' and above', (): void => {
      settings.setLoot(Object.fromEntries(rarities.slice(0, minimum).map((lower: RarityDef): [string, ItemSlot[]] => [lower.id, []])));
    });
  }
  for (const rarity of rarities) {
    const group: HTMLFieldSetElement = el('fieldset', 'loot-group', page);
    const legend: HTMLLegendElement = el('legend', 'set-name', group);
    legend.textContent = rarity.name;
    legend.style.color = rarity.color;
    const options: HTMLDivElement = el('div', 'loot-options', group);
    const change = (slots: readonly ItemSlot[] | undefined): void => {
      const filter = { ...settings.get().loot };
      if (slots === undefined) delete filter[rarity.id];
      else filter[rarity.id] = slots;
      settings.setLoot(filter);
    };
    const none: HTMLButtonElement = control(options, 'None', (): void => change([]));
    const all: HTMLButtonElement = control(options, 'All', (): void => change(undefined));
    const slots = ITEM_SLOTS.map((slot: ItemSlot): HTMLButtonElement => control(options, SLOT_NAMES[slot], (): void => {
      const current = settings.get().loot[rarity.id];
      change(current === undefined ? [slot] : current.includes(slot) ? current.filter((value: ItemSlot): boolean => value !== slot) : [...current, slot]);
    }));
    const draw = (): void => {
      const current = settings.get().loot[rarity.id];
      all.setAttribute('aria-pressed', String(current === undefined));
      none.setAttribute('aria-pressed', String(current?.length === 0));
      slots.forEach((button: HTMLButtonElement, i: number): void => {
        const slot = ITEM_SLOTS[i];
        button.setAttribute('aria-pressed', String(slot !== undefined && current?.includes(slot) === true));
      });
    };
    settings.subscribe(draw);
    draw();
  }
}

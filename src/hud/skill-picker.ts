import type { SkillUnlock } from '../../sim/content/shape-types.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { everySkill } from '../../sim/skill-book.ts';
import type { HudContext } from './context.ts';
import { el, label } from './dom.ts';
import { iconSvg } from './icons.ts';
import { markOverlay } from './overlay-mark.ts';
import { promptText, use } from './prompts.ts';
import { attachTooltip } from './tooltip.ts';

export interface SkillPicker {
  readonly element: HTMLElement;
  readonly slot: number | null;
  open(slot: number, anchor: HTMLElement): void;
  close(): boolean;
  refresh(player: PlayerState): void;
}

interface Choice {
  readonly root: HTMLElement;
  readonly entry: SkillUnlock;
  readonly skill: SkillDef;
  state: string;
}

export function skillDetails(skill: SkillDef, sub: string, unlock: number | null): HTMLElement {
  const root: HTMLDivElement = el('div', 'tip', null);
  label('tip-title', skill.name, root);
  label('tip-sub', sub, root);
  label('tip-line', skill.description, root);
  el('div', 'tip-sep', root);
  if (skill.press?.type === 'charge') label('tip-line', `Hold to charge, up to ${skill.press.max.toFixed(1)}s`, root);
  if (skill.press?.type === 'channel') label('tip-line', 'Hold to channel', root);
  if (skill.manaCost > 0) label('tip-line cost', skill.press?.type === 'channel' ? `Mana cost: ${skill.manaCost} per pulse` : `Mana cost: ${skill.manaCost}`, root);
  if (skill.cooldown > 0) label('tip-line', `Cooldown: ${skill.cooldown.toFixed(1)}s`, root);
  if (unlock !== null) label('tip-line locked', `Learned at level ${unlock}`, root);
  return root;
}

export function createSkillPicker(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void): SkillPicker {
  const element: HTMLDivElement = el('div', 'skill-picker', parent);
  track(element);
  label('skill-picker-title', 'Choose a skill', element);
  const grid: HTMLDivElement = el('div', 'skill-picker-grid', element);
  const choices: Choice[] = [];
  let slot: number | null = null;
  const content = context.api.world.content;
  for (const entry of everySkill(content)) {
    const skill: SkillDef | undefined = content.skills.get(entry.skill);
    if (skill === undefined) continue;
    const root: HTMLButtonElement = el('button', 'skill-choice', grid);
    root.type = 'button';
    el('span', 'skill-choice-icon', root).innerHTML = iconSvg(skill.icon);
    label('skill-choice-level', `${entry.level}`, root);
    const choice: Choice = { root, entry, skill, state: '' };
    attachTooltip(context.tooltip, root, (): HTMLElement => skillDetails(skill, choice.state === 'locked' ? 'Not yet learned' : promptText(context.api.touch, use('place it in this slot')), choice.state === 'locked' ? entry.level : null));
    root.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
      if (slot === null || choice.state === 'locked') return;
      context.api.send({ type: 'slot', slot, skill: entry.skill });
      picker.close();
    });
    choices.push(choice);
  }

  const picker: SkillPicker = {
    element,
    get slot(): number | null {
      return slot;
    },
    open(next: number, anchor: HTMLElement): void {
      slot = next;
      const bar: DOMRect = parent.getBoundingClientRect();
      const at: DOMRect = anchor.getBoundingClientRect();
      element.style.setProperty('--picker-x', `${(at.left + at.width / 2 - bar.left).toFixed(1)}px`);
      element.classList.add('open');
      markOverlay(element, true);
      picker.refresh(context.api.world.player);
    },
    close(): boolean {
      if (slot === null) return false;
      slot = null;
      element.classList.remove('open');
      markOverlay(element, false);
      context.tooltip.hide();
      return true;
    },
    refresh(player: PlayerState): void {
      if (slot === null) return;
      const current: string | null = player.bar[slot] ?? null;
      for (const choice of choices) {
        const state: string = choice.entry.level > player.level || !player.learned.includes(choice.entry.skill) ? 'locked' : choice.entry.skill === current ? 'current' : player.bar.includes(choice.entry.skill) ? 'elsewhere' : 'free';
        if (state === choice.state) continue;
        if (choice.state !== '') choice.root.classList.remove(choice.state);
        choice.root.classList.add(state);
        choice.state = state;
      }
    },
  };
  return picker;
}

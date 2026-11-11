import type { SkillDef } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import type { HudContext } from './context.ts';
import { clamp01, el, label, pulseClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import { attachTooltip } from './tooltip.ts';

const SKILL_BAR = {
  pressMs: 110,
  fullTurn: 360,
  coolingEpsilon: 0.001,
} as const;

const KEY_GLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['LMB', 'mouse_left'],
  ['RMB', 'mouse_right'],
]);

interface SlotView {
  readonly root: HTMLElement;
  readonly icon: HTMLElement;
  readonly cost: HTMLElement;
  readonly cooldown: HTMLElement;
  skill: SkillDef | null;
  iconId: string;
  angle: number;
  cooling: boolean | null;
  dim: boolean | null;
}

export interface SkillBar {
  readonly element: HTMLElement;
  update(player: PlayerState): void;
  press(skillId: string): void;
}

function skillTooltip(skill: SkillDef, key: string): HTMLElement {
  const root: HTMLDivElement = el('div', 'tip', null);
  label('tip-title', skill.name, root);
  label('tip-sub', key === '' ? 'Skill' : `Skill · ${key}`, root);
  label('tip-line', skill.description, root);
  el('div', 'tip-sep', root);
  if (skill.manaCost > 0) label('tip-line cost', `Mana cost: ${skill.manaCost}`, root);
  if (skill.cooldown > 0) label('tip-line', `Cooldown: ${skill.cooldown.toFixed(1)}s`, root);
  return root;
}

export function createSkillBar(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void): SkillBar {
  const element: HTMLDivElement = el('div', 'hud-skillbar', parent);
  track(element);
  const slots: SlotView[] = [];

  const keyOf = (index: number): string => context.api.world.content.player.skillBar[index]?.label ?? '';

  const buildSlot = (index: number): SlotView => {
    const root: HTMLDivElement = el('div', 'slot', element);
    const icon: HTMLDivElement = el('div', 'slot-icon', root);
    const cooldown: HTMLDivElement = el('div', 'slot-cd', root);
    const key: string = keyOf(index);
    const glyph: string | undefined = KEY_GLYPHS.get(key);
    if (glyph === undefined) label('slot-key', key, root);
    else el('div', 'slot-key glyph', root).innerHTML = iconSvg(glyph);
    const cost: HTMLDivElement = el('div', 'slot-cost', root);
    const view: SlotView = { root, icon, cost, cooldown, skill: null, iconId: '', angle: -1, cooling: null, dim: null };
    attachTooltip(context.tooltip, root, (): HTMLElement | null => (view.skill === null ? null : skillTooltip(view.skill, keyOf(index))));
    return view;
  };

  const applySkill = (view: SlotView, skill: SkillDef): void => {
    view.skill = skill;
    if (view.iconId !== skill.icon) {
      view.iconId = skill.icon;
      view.icon.innerHTML = iconSvg(skill.icon);
    }
    setText(view.cost, skill.manaCost > 0 ? String(skill.manaCost) : '', true);
  };

  return {
    element,
    update(player: PlayerState): void {
      if (slots.length !== player.skills.length) {
        element.replaceChildren();
        slots.length = 0;
        player.skills.forEach((_skill: SkillDef, index: number): void => {
          slots.push(buildSlot(index));
        });
      }
      slots.forEach((view: SlotView, index: number): void => {
        const skill: SkillDef | undefined = player.skills[index];
        if (skill === undefined) return;
        if (view.skill !== skill) applySkill(view, skill);
        const remaining: number = player.cooldowns[skill.id] ?? 0;
        const cooling: boolean = remaining > SKILL_BAR.coolingEpsilon;
        const fraction: number = skill.cooldown > 0 ? clamp01(remaining / skill.cooldown) : 0;
        const angle: number = Math.round((1 - fraction) * SKILL_BAR.fullTurn);
        if (angle !== view.angle) {
          view.angle = angle;
          view.cooldown.style.setProperty('--cd', `${angle}deg`);
        }
        if (cooling !== view.cooling) {
          view.cooling = cooling;
          view.root.classList.toggle('cooling', cooling);
        }
        const dim: boolean = player.mana < skill.manaCost;
        if (dim !== view.dim) {
          view.dim = dim;
          view.root.classList.toggle('dim', dim);
        }
      });
    },
    press(skillId: string): void {
      for (const view of slots) {
        if (view.skill?.id === skillId) pulseClass(view.root, 'press', SKILL_BAR.pressMs);
      }
    },
  };
}

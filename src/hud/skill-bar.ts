import type { SkillDef } from '../../sim/content/types.ts';
import { usable } from '../../sim/world/hud.ts';
import type { Command, PlayerState } from '../../sim/world/types.ts';
import { rowPress } from './row-press.ts';
import { slotAction } from '../settings/bindings.ts';
import type { HudContext } from './context.ts';
import { clamp01, el, label, pulseClass, setClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { SkillPicker } from './skill-picker.ts';
import { clearDetails, createSkillPicker, pointerSlotOf, skillDetails } from './skill-picker.ts';
import { promptText, use } from './prompts.ts';
import { attachTooltip } from './tooltip.ts';
import { appendForms, formFamilies } from './skill-forms-view.ts';
import { familyMark, strongerLine } from './weapon-family.ts';
import { empoweredBy } from '../../sim/weapons.ts';
import type { MomentumMeter } from './momentum-meter.ts';
import { createMomentumMeter } from './momentum-meter.ts';
import { createChangeList } from './change-list.ts';
import type { ChangeList } from './change-list.ts';
import { skillChanges } from './skill-changes.ts';
import type { SkillChanges } from './skill-changes.ts';

const SKILL_BAR = {
  pressMs: 110,
  holdMs: 480,
  holdSlop: 10,
  swapMs: 320,
  learnedMs: 1400,
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
  readonly keyNode: HTMLElement;
  readonly badge: HTMLElement;
  readonly families: HTMLElement;
  key: string | null;
  familyKey: string;
  skill: SkillDef | null;
  empty: boolean | null;
  iconId: string;
  angle: number;
  cooling: boolean | null;
  dim: boolean | null;
}

interface SlotHold {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly timer: number;
}

export interface SkillBar {
  readonly element: HTMLElement;
  update(player: PlayerState): void;
  refreshKeys(): void;
  press(skillId: string): void;
  learned(slot: number): void;
  closePicker(): boolean;
}

function emptyTooltip(context: HudContext, index: number, key: string): HTMLElement {
  const root: HTMLElement = clearDetails(pointerSlotOf(context, index), key === '' ? 'Empty slot' : `Empty slot · ${key}`);
  label('tip-line', `${promptText(context.api.touch, use('choose a skill for this slot'))}.`, root);
  return root;
}

export function createSkillBar(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void): SkillBar {
  const element: HTMLDivElement = el('div', 'hud-skillbar', parent);
  track(element);
  const meter: MomentumMeter = createMomentumMeter(parent.parentElement ?? parent);
  const picker: SkillPicker = createSkillPicker(element, context, track);
  const changeList: ChangeList = createChangeList(element, (skill: string, becomes: string): void => context.api.send({ type: 'choose_change', skill, becomes }), track);
  document.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (!(event.target instanceof Node) || !element.contains(event.target)) {
      picker.close();
      changeList.close();
    }
  });
  const slots: SlotView[] = [];

  const keyOf = (index: number): string => context.api.settings.keys().labelOf(slotAction(index));
  const baseOf = (index: number): string | null => context.api.world.player.bar[index] ?? null;
  const changesOf = (index: number): SkillChanges | null => {
    const base: string | null = baseOf(index);
    return base === null ? null : skillChanges(context.api.world.content, context.api.world.player, base);
  };
  const openChanges = (index: number, root: HTMLElement): boolean => {
    const changes: SkillChanges | null = changesOf(index);
    if (changes === null) return false;
    picker.close();
    context.tooltip.hide();
    if (changeList.shownFor() === changes.skill) changeList.close();
    else changeList.open(root, changes);
    return true;
  };

  const paintKey = (view: SlotView, key: string): void => {
    if (view.key === key) return;
    view.key = key;
    const glyph: string | undefined = KEY_GLYPHS.get(key);
    view.keyNode.classList.toggle('glyph', glyph !== undefined);
    if (glyph === undefined) setText(view.keyNode, key, true);
    else view.keyNode.innerHTML = iconSvg(glyph);
  };

  const buildSlot = (index: number): SlotView => {
    const root: HTMLDivElement = el('div', 'slot', element);
    let hold: SlotHold | null = null;
    let held: boolean = false;
    const release = (): void => {
      if (hold === null) return;
      window.clearTimeout(hold.timer);
      hold = null;
    };
    root.addEventListener('pointerdown', (event: PointerEvent): void => {
      release();
      held = false;
      if (event.pointerType !== 'touch' || changesOf(index) === null) return;
      const timer: number = window.setTimeout((): void => {
        hold = null;
        held = openChanges(index, root);
      }, SKILL_BAR.holdMs);
      hold = { pointer: event.pointerId, x: event.clientX, y: event.clientY, timer };
    });
    root.addEventListener('pointermove', (event: PointerEvent): void => {
      if (hold !== null && hold.pointer === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > SKILL_BAR.holdSlop) release();
    });
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('contextmenu', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      openChanges(index, root);
    });
    root.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
      if (held) {
        held = false;
        return;
      }
      changeList.close();
      const instead: Command | null = rowPress(context.api.world);
      if (instead !== null) {
        picker.close();
        context.api.send(instead);
      } else if (picker.slot === index) picker.close();
      else picker.open(index, root);
    });
    const icon: HTMLDivElement = el('div', 'slot-icon', root);
    const cooldown: HTMLDivElement = el('div', 'slot-cd', root);
    const keyNode: HTMLDivElement = el('div', 'slot-key', root);
    const cost: HTMLDivElement = el('div', 'slot-cost', root);
    const badge: HTMLDivElement = el('div', 'slot-changes', root);
    const families: HTMLDivElement = el('div', 'slot-families', root);
    const view: SlotView = { root, icon, cost, cooldown, keyNode, badge, families, familyKey: '', key: null, skill: null, empty: null, iconId: '', angle: -1, cooling: null, dim: null };
    paintKey(view, keyOf(index));
    attachTooltip(context.tooltip, root, (): HTMLElement | null => {
      if (picker.slot !== null) return null;
      if (view.skill === null) return emptyTooltip(context, index, keyOf(index));
      const details: HTMLElement = skillDetails(view.skill, `Skill · ${keyOf(index)} · click to change`, null, strongerLine(context.api.world.content, empoweredBy(view.skill, context.api.world.content.skills.get(baseOf(index) ?? '') ?? view.skill)));
      appendForms(details, context.api.world.content, context.api.world.content.skills.get(baseOf(index) ?? '') ?? null, context.api.world.player.wielding);
      return details;
    });
    return view;
  };

  const paintFamilies = (view: SlotView, base: string | null, wielding: string | null): void => {
    const familyKey: string = `${base ?? ''}|${wielding ?? ''}`;
    if (view.familyKey === familyKey) return;
    view.familyKey = familyKey;
    view.families.replaceChildren();
    if (base === null) return;
    for (const group of formFamilies(context.api.world.content, base)) familyMark(group, group.id === wielding ? 'slot-family held' : 'slot-family', view.families);
  };

  const applySkill = (view: SlotView, skill: SkillDef | null): void => {
    view.skill = skill;
    const iconId: string = skill?.icon ?? '';
    if (view.iconId !== iconId) {
      view.iconId = iconId;
      view.icon.innerHTML = skill === null ? '' : iconSvg(iconId);
      if (skill !== null) pulseClass(view.root, 'swap', SKILL_BAR.swapMs);
    }
    const empty: boolean = skill === null;
    if (empty !== view.empty) {
      view.empty = empty;
      view.root.classList.toggle('empty', empty);
    }
    setText(view.cost, skill !== null && skill.manaCost > 0 ? String(Math.round(skill.manaCost)) : '', true);
  };

  return {
    element,
    learned(slot: number): void {
      const view: SlotView | undefined = slots[slot];
      if (view !== undefined) pulseClass(view.root, 'learned', SKILL_BAR.learnedMs);
    },
    refreshKeys(): void {
      slots.forEach((view: SlotView, index: number): void => paintKey(view, keyOf(index)));
    },
    update(player: PlayerState): void {
      if (slots.length !== player.skills.length) {
        for (const view of slots) view.root.remove();
        slots.length = 0;
        player.skills.forEach((_skill: SkillDef | null, index: number): void => {
          slots.push(buildSlot(index));
        });
      }
      picker.refresh(player);
      const listed: string | null = changeList.shownFor();
      if (listed !== null) changeList.refresh(skillChanges(context.api.world.content, player, listed));
      meter.update(player);
      element.classList.toggle('spare', player.learned.some((skill: string): boolean => !player.bar.includes(skill)));
      slots.forEach((view: SlotView, index: number): void => {
        const held: SkillDef | null = player.skills[index] ?? null;
        const skill: SkillDef | null = held !== null && usable(player, held) ? held : null;
        if (view.skill !== skill || view.empty === null) applySkill(view, skill);
        paintFamilies(view, skill === null ? null : baseOf(index), player.wielding);
        const count: number = skill === null ? 0 : (changesOf(index)?.choices.length ?? 0);
        if (count > 0) setText(view.badge, String(count), true);
        setClass(view.root, 'changes', count > 0);
        if (skill === null) return;
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
    closePicker(): boolean {
      return changeList.close() || picker.close();
    },
    press(skillId: string): void {
      for (const view of slots) {
        if (view.skill?.id === skillId) pulseClass(view.root, 'press', SKILL_BAR.pressMs);
      }
    },
  };
}

import type { SkillDef } from '../../sim/content/types.ts';
import { placeLearned } from '../../sim/skill-book.ts';
import type { OpenOffer } from '../../sim/skill-book.ts';
import { pendingOffer } from '../../sim/world/learning.ts';
import { slotAction } from '../settings/bindings.ts';
import type { HudContext } from './context.ts';
import { el, label, setText } from './dom.ts';
import { iconSvg } from './icons.ts';

const OFFER = {
  leaveMs: 420,
  stagger: 70,
  settleMs: 900,
} as const;

export interface SkillOfferView {
  readonly element: HTMLElement;
  update(): void;
}

export function createSkillOffer(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void): SkillOfferView {
  const element: HTMLDivElement = el('div', 'skill-offer', parent);
  track(element);
  label('skill-offer-title', 'A skill comes to you', element);
  label('skill-offer-sub', 'Choose one. The others may come again.', element);
  const row: HTMLDivElement = el('div', 'skill-offer-row', element);
  let shown: string | null = null;
  let leaving: number | null = null;
  let choseAt: number | null = null;
  const keys: Map<string, HTMLElement> = new Map<string, HTMLElement>();

  const keyFor = (skill: string): string => {
    const bar: readonly (string | null)[] = placeLearned(context.api.world.content, context.api.world.player.bar, skill);
    const slot: number = bar.indexOf(skill);
    return slot < 0 ? 'Kept for your bar' : context.api.settings.keys().labelOf(slotAction(slot));
  };

  const fill = (open: OpenOffer): void => {
    row.replaceChildren();
    keys.clear();
    open.choices.forEach((id: string, index: number): void => {
      const skill: SkillDef | undefined = context.api.world.content.skills.get(id);
      if (skill === undefined) return;
      const card: HTMLButtonElement = el('button', 'skill-offer-card', row);
      card.type = 'button';
      card.style.setProperty('--offer-delay', `${index * OFFER.stagger}ms`);
      const art: HTMLSpanElement = el('span', 'skill-offer-art', card);
      art.innerHTML = iconSvg(skill.icon);
      label('skill-offer-name', skill.name, card);
      label('skill-offer-line', skill.description, card);
      keys.set(id, label('skill-offer-key', keyFor(id), card));
      card.addEventListener('click', (event: MouseEvent): void => {
        event.stopPropagation();
        if (leaving !== null || choseAt !== null) return;
        choseAt = performance.now();
        card.classList.add('chosen');
        element.classList.add('choosing');
        context.api.send({ type: 'choose', offer: open.offer.id, skill: id });
      });
    });
  };

  const settle = (): void => {
    for (const [skill, key] of keys) {
      setText(key, keyFor(skill), true);
    }
    if (choseAt === null || performance.now() - choseAt < OFFER.settleMs) return;
    choseAt = null;
    element.classList.remove('choosing');
    for (const card of row.querySelectorAll('.chosen')) card.classList.remove('chosen');
  };

  return {
    element,
    update(): void {
      const open: OpenOffer | null = pendingOffer(context.api.world);
      const id: string | null = open === null ? null : open.offer.id;
      if (id === shown) {
        if (id !== null && leaving === null) settle();
        return;
      }
      if (shown !== null && leaving === null) {
        element.classList.remove('open');
        choseAt = null;
        leaving = window.setTimeout((): void => {
          leaving = null;
          element.classList.remove('choosing');
          shown = null;
        }, OFFER.leaveMs);
        return;
      }
      if (leaving !== null || open === null) return;
      shown = open.offer.id;
      fill(open);
      element.getBoundingClientRect();
      element.classList.add('open');
    },
  };
}

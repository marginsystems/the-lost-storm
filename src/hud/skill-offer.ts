import type { SkillDef } from '../../sim/content/types.ts';
import { placeLearned } from '../../sim/skill-book.ts';
import type { OpenOffer } from '../../sim/skill-book.ts';
import { pendingOffer } from '../../sim/world/learning.ts';
import { slotAction } from '../settings/bindings.ts';
import type { HudContext } from './context.ts';
import { el, label, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import { cardsKey, markerShown, OFFER_IDLE, stepOffer } from './offer-state.ts';
import type { OfferUi } from './offer-state.ts';

const OFFER = {
  leaveMs: 420,
  stagger: 70,
  settleMs: 900,
} as const;

export interface SkillOfferView {
  readonly element: HTMLElement;
  update(): void;
  close(): boolean;
  isOpen(): boolean;
}

export function createSkillOffer(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void, onOpen: () => void): SkillOfferView {
  const host: HTMLElement = context.api.touch ? (parent.closest<HTMLElement>('.hud') ?? parent) : parent;
  const element: HTMLDivElement = el('div', 'skill-offer', host);
  track(element);
  const marker: HTMLButtonElement = el('button', 'skill-offer-mark', host);
  marker.type = 'button';
  track(marker);
  el('span', 'skill-offer-mark-dot', marker);
  label('skill-offer-mark-text', 'Choose a skill', marker);
  label('skill-offer-title', 'Choose a skill', element);
  const row: HTMLDivElement = el('div', 'skill-offer-row', element);
  const later: HTMLButtonElement = el('button', 'skill-offer-later', element);
  later.type = 'button';
  later.textContent = 'Later';
  let ui: OfferUi = OFFER_IDLE;
  let filled: string | null = null;
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
        if (!ui.open || choseAt !== null) return;
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

  const show = (next: OfferUi): void => {
    const was: OfferUi = ui;
    ui = next;
    marker.classList.toggle('shown', markerShown(ui));
    if (was.open === ui.open) return;
    element.classList.toggle('open', ui.open);
    if (ui.open) {
      element.classList.remove('choosing');
      onOpen();
      return;
    }
    choseAt = null;
    window.setTimeout((): void => {
      if (!ui.open) element.classList.remove('choosing');
    }, OFFER.leaveMs);
  };

  later.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    show(stepOffer(ui, { type: 'close' }));
  });

  marker.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const open: OpenOffer | null = pendingOffer(context.api.world);
    if (open === null) return;
    const key: string = cardsKey(open.offer.id, open.choices);
    if (filled !== key) {
      filled = key;
      fill(open);
    }
    element.getBoundingClientRect();
    show(stepOffer(ui, { type: 'open' }));
  });

  return {
    element,
    update(): void {
      const open: OpenOffer | null = pendingOffer(context.api.world);
      show(stepOffer(ui, { type: 'pending', offer: open === null ? null : open.offer.id }));
      if (ui.open) settle();
    },
    close(): boolean {
      if (!ui.open) return false;
      show(stepOffer(ui, { type: 'close' }));
      return true;
    },
    isOpen(): boolean {
      return ui.open;
    },
  };
}

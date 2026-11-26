import type { PartyFlow } from '../party/party-flow.ts';
import type { PartyInvite, PartyState } from '../party/party-model.ts';
import { firstInvite, invitedText, othersOf } from '../party/party-model.ts';
import type { PartyMember } from '../party/party-protocol.ts';
import type { HudContext } from './context.ts';
import { el, label, setText } from './dom.ts';

export const PARTY_PANEL = {
  leaveMs: 520,
  offline: 'Offline',
  leader: 'Leader',
  title: 'Party',
} as const;

export interface PartyMount {
  update(now: number): void;
}

interface MemberRow {
  readonly element: HTMLElement;
  readonly name: HTMLElement;
  readonly mark: HTMLElement;
  readonly away: HTMLElement;
  readonly level: HTMLElement;
  readonly place: HTMLElement;
  leaving: boolean;
}

function actButton(parent: HTMLElement, text: string, className: string): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', `party-act ${className}`, parent);
  button.type = 'button';
  button.textContent = text;
  return button;
}

export function placeText(context: HudContext, member: PartyMember): string {
  if (!member.online) return PARTY_PANEL.offline;
  if (member.zone === null) return '';
  return context.api.world.content.zones.get(member.zone)?.name ?? '';
}

export function levelText(member: PartyMember): string {
  return member.level === null ? '' : `Level ${String(member.level)}`;
}

export function mountParty(parent: HTMLElement, context: HudContext, flow: PartyFlow, track: (element: HTMLElement) => void): PartyMount {
  const frame: HTMLDivElement = el('div', 'party-frame', parent);
  const head: HTMLDivElement = el('div', 'party-head', frame);
  label('party-title', PARTY_PANEL.title, head);
  const leave: HTMLButtonElement = actButton(head, 'Leave', 'party-leave');
  leave.addEventListener('click', (): void => {
    flow.leave();
  });
  const list: HTMLDivElement = el('div', 'party-members', frame);
  track(frame);

  const card: HTMLDivElement = el('div', 'party-invite', parent);
  const cardText: HTMLDivElement = label('party-invite-text', '', card);
  const time: HTMLDivElement = el('div', 'party-invite-time', card);
  const fill: HTMLDivElement = el('div', 'party-invite-fill', time);
  const actions: HTMLDivElement = el('div', 'party-invite-actions', card);
  const accept: HTMLButtonElement = actButton(actions, 'Join', 'party-accept');
  const decline: HTMLButtonElement = actButton(actions, 'Decline', 'party-decline');
  track(card);

  const rows: Map<string, MemberRow> = new Map<string, MemberRow>();
  let shownInvite: { readonly invite: PartyInvite; readonly at: number } | null = null;
  let seen: PartyState | null = null;

  accept.addEventListener('click', (): void => {
    if (shownInvite !== null) flow.answer(shownInvite.invite.id, true);
  });
  decline.addEventListener('click', (): void => {
    if (shownInvite !== null) flow.answer(shownInvite.invite.id, false);
  });

  const rowFor = (member: PartyMember): MemberRow => {
    const element: HTMLDivElement = el('div', 'party-member', list);
    const inner: HTMLDivElement = el('div', 'party-member-inner', element);
    const top: HTMLDivElement = el('div', 'party-member-top', inner);
    const name: HTMLDivElement = label('party-name', member.name, top);
    const mark: HTMLDivElement = label('party-mark', PARTY_PANEL.leader, top);
    const away: HTMLDivElement = label('party-away', PARTY_PANEL.offline, top);
    const bottom: HTMLDivElement = el('div', 'party-member-bottom', inner);
    const level: HTMLDivElement = label('party-level', '', bottom);
    const place: HTMLDivElement = label('party-place', '', bottom);
    const row: MemberRow = { element, name, mark, away, level, place, leaving: false };
    element.getBoundingClientRect();
    element.classList.add('shown');
    return row;
  };

  const showMembers = (state: PartyState): void => {
    const others: readonly PartyMember[] = othersOf(state);
    const names: ReadonlySet<string> = new Set<string>(others.map((member: PartyMember): string => member.name));
    for (const [name, row] of rows) {
      if (names.has(name) || row.leaving) continue;
      row.leaving = true;
      row.element.classList.remove('shown');
      window.setTimeout((): void => {
        if (!row.leaving) return;
        row.element.remove();
        if (rows.get(name) === row) rows.delete(name);
      }, PARTY_PANEL.leaveMs);
    }
    for (const member of others) {
      let row: MemberRow | undefined = rows.get(member.name);
      if (row === undefined || row.leaving) {
        row?.element.remove();
        row = rowFor(member);
        rows.set(member.name, row);
      }
      row.element.classList.toggle('offline', !member.online);
      row.mark.classList.toggle('shown', member.leader);
      row.mark.setAttribute('aria-hidden', String(!member.leader));
      row.away.setAttribute('aria-hidden', String(member.online));
      setText(row.level, levelText(member), true);
      setText(row.place, placeText(context, member), true);
    }
    frame.classList.toggle('shown', others.length > 0);
  };

  const showInvite = (state: PartyState, now: number): void => {
    const invite: PartyInvite | null = firstInvite(state);
    card.classList.toggle('shown', invite !== null);
    if (invite === null) {
      shownInvite = null;
      return;
    }
    if (shownInvite?.invite.id !== invite.id) {
      shownInvite = { invite, at: now };
      setText(cardText, invitedText(invite), true);
    }
    const total: number = Math.max(1, invite.expiresAt - shownInvite.at);
    fill.style.transform = `scaleX(${String(Math.max(0, Math.min(1, (invite.expiresAt - now) / total)))})`;
  };

  return {
    update(now: number): void {
      flow.expire(now);
      const state: PartyState = flow.state();
      if (state !== seen) {
        seen = state;
        showMembers(state);
      }
      showInvite(state, now);
    },
  };
}

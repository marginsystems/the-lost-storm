import { characterSheet } from '../../sim/character-sheet.ts';
import type { CharacterSheet, SheetBonus, SkillOffence } from '../../sim/character-sheet.ts';
import type { HudContext, PanelView } from './context.ts';
import { DEFENCE_ROWS, OFFENCE_ROWS, SOURCES } from './character-rows.ts';
import type { SheetRow } from './character-rows.ts';
import { springTo, stepSpring } from './character-spring.ts';
import type { Spring } from './character-spring.ts';
import { el, label } from './dom.ts';
import { attachTooltip } from './tooltip.ts';

const CHARACTER = {
  refreshInterval: 0.2,
  inventoryGap: 8,
  edge: 16,
} as const;

interface Column {
  readonly title: string;
  readonly rows: readonly SheetRow[];
}

const COLUMNS: readonly Column[] = [
  { title: 'Defence', rows: DEFENCE_ROWS },
  { title: 'Offence', rows: OFFENCE_ROWS },
];

export interface CharacterPanel extends PanelView {
  update(dt: number): void;
}

interface Animated {
  readonly node: HTMLElement;
  readonly springs: Spring[];
  readonly format: (values: readonly number[]) => string;
  text: string;
}

function animated(node: HTMLElement, format: Animated['format']): Animated {
  return { node, springs: [], format, text: '' };
}

function aim(view: Animated, targets: readonly number[]): void {
  if (view.springs.length !== targets.length) {
    view.springs.length = 0;
    for (const target of targets) view.springs.push({ value: target, velocity: 0, target });
  } else {
    targets.forEach((target: number, index: number): void => {
      const spring: Spring | undefined = view.springs[index];
      if (spring !== undefined) springTo(spring, target);
    });
  }
}

function draw(view: Animated, dt: number): void {
  for (const spring of view.springs) stepSpring(spring, dt);
  const text: string = view.format(view.springs.map((spring: Spring): number => spring.value));
  if (text === view.text) return;
  view.text = text;
  view.node.textContent = text;
}

function snap(view: Animated): void {
  for (const spring of view.springs) {
    spring.value = spring.target;
    spring.velocity = 0;
  }
  draw(view, 0);
}

function line(parent: HTMLElement, name: string, value: string): void {
  const row: HTMLDivElement = el('div', 'cs-tip-line', parent);
  label('cs-tip-name', name, row);
  label('cs-tip-value', value, row);
}

function signed(row: SheetRow, values: readonly number[]): string {
  const negative: boolean = values.every((value: number): boolean => value < 0);
  return `${negative ? '−' : '+'}${row.format(values.map((value: number): number => Math.abs(value))).replace(/^\+/, '')}`;
}

function rowTip(row: SheetRow, sheet: CharacterSheet): HTMLElement {
  const tip: HTMLDivElement = el('div', 'tip cs-tip', null);
  label('cs-tip-title', row.name, tip);
  for (const entry of SOURCES) {
    const values: readonly number[] = row.read(sheet, entry.source);
    if (values.every((value: number): boolean => Math.abs(value) < 1e-9)) continue;
    line(tip, entry.title, entry.source === 'base' ? row.format(values) : signed(row, values));
  }
  line(tip, 'Total', row.format(row.read(sheet, 'total')));
  if (row.note !== null) label('cs-tip-note', row.note, tip);
  return tip;
}

function skillTip(skill: SkillOffence): HTMLElement {
  const tip: HTMLDivElement = el('div', 'tip cs-tip', null);
  label('cs-tip-title', skill.name, tip);
  line(tip, 'Weapon damage', `${Math.round(skill.weaponPercent * 100)}%`);
  line(tip, 'Time per use', `${skill.cycle.toFixed(2)}s`);
  if (skill.manaCost > 0) line(tip, 'Mana cost', String(skill.manaCost));
  label('cs-tip-note', 'Per second counts critical hits and the opening blow of a combo.', tip);
  return tip;
}

export function createCharacterPanel(parent: HTMLElement, context: HudContext, inventory: HTMLElement): CharacterPanel {
  const element: HTMLDivElement = el('div', 'hud-panel right character-panel', parent);
  let sheet: CharacterSheet = characterSheet(context.api.world.content, context.api.world.player);
  const views: Animated[] = [];

  const head: HTMLDivElement = el('div', 'cs-head', element);
  const levelView: Animated = animated(label('cs-level', '', head), (values: readonly number[]): string => `Level ${Math.round(values[0] ?? 0)}`);
  const xpView: Animated = animated(label('cs-xp', '', head), (values: readonly number[]): string => (sheet.atMaxLevel ? 'Max level' : `${Math.round(values[0] ?? 0)} / ${Math.round(values[1] ?? 0)} XP`));
  const track: HTMLDivElement = el('div', 'cs-track', element);
  const fill: HTMLDivElement = el('div', 'cs-fill', track);
  views.push(levelView, xpView);

  const columns: HTMLDivElement = el('div', 'cs-cols', element);
  const bound: { readonly row: SheetRow; readonly view: Animated }[] = [];
  for (const group of COLUMNS) {
    const column: HTMLDivElement = el('div', 'cs-col', columns);
    label('cs-heading', group.title, column);
    for (const row of group.rows) {
      const holder: HTMLDivElement = el('div', 'cs-row', column);
      label('cs-name', row.name, holder);
      const view: Animated = animated(el('div', 'cs-value', holder), row.format);
      views.push(view);
      bound.push({ row, view });
      attachTooltip(context.tooltip, holder, (): HTMLElement => rowTip(row, sheet));
    }
  }

  label('cs-heading wide', 'Skills', element);
  const skillTable: HTMLDivElement = el('div', 'cs-skills', element);
  let skillKey: string = '';
  let skillViews: { readonly hit: Animated; readonly rate: Animated }[] = [];

  label('cs-heading wide', 'Bonuses', element);
  const bonusList: HTMLDivElement = el('div', 'cs-bonuses', element);
  let bonusKey: string = '';

  const rebuildSkills = (): void => {
    skillTable.replaceChildren();
    for (const view of skillViews) {
      views.splice(views.indexOf(view.hit), 1);
      views.splice(views.indexOf(view.rate), 1);
    }
    skillViews = sheet.skills.map((skill: SkillOffence): { readonly hit: Animated; readonly rate: Animated } => {
      const holder: HTMLDivElement = el('div', 'cs-skill', skillTable);
      label('cs-name', skill.name, holder);
      const hit: Animated = animated(el('div', 'cs-value', holder), (values: readonly number[]): string => `${Math.round(values[0] ?? 0)}–${Math.round(values[1] ?? 0)}`);
      const rate: Animated = animated(el('div', 'cs-value cs-rate', holder), (values: readonly number[]): string => `${(values[0] ?? 0).toFixed(1)}/s`);
      views.push(hit, rate);
      attachTooltip(context.tooltip, holder, (): HTMLElement | null => {
        const current: SkillOffence | undefined = sheet.skills.find((entry: SkillOffence): boolean => entry.id === skill.id);
        return current === undefined ? null : skillTip(current);
      });
      return { hit, rate };
    });
  };

  const rebuildBonuses = (): void => {
    bonusList.replaceChildren();
    if (sheet.bonuses.length === 0) label('cs-none', 'No bonuses yet', bonusList);
    for (const bonus of sheet.bonuses) label(`cs-bonus ${bonus.source}`, bonus.text, bonusList);
  };

  const aimAll = (): void => {
    aim(levelView, [sheet.level]);
    aim(xpView, [sheet.xp, sheet.xpToNext]);
    for (const entry of bound) aim(entry.view, entry.row.read(sheet, 'total'));
    sheet.skills.forEach((skill: SkillOffence, index: number): void => {
      const pair = skillViews[index];
      if (pair === undefined) return;
      aim(pair.hit, [skill.hitMin, skill.hitMax]);
      aim(pair.rate, [skill.perSecond]);
    });
    fill.style.transform = `scaleX(${sheet.atMaxLevel ? 1 : sheet.xpToNext > 0 ? Math.min(1, sheet.xp / sheet.xpToNext) : 0})`;
  };

  let since: number = 0;
  let fresh: boolean = true;

  const refresh = (): void => {
    sheet = characterSheet(context.api.world.content, context.api.world.player);
    const nextSkillKey: string = sheet.skills.map((skill: SkillOffence): string => skill.id).join(',');
    const rebuilt: boolean = nextSkillKey !== skillKey;
    if (rebuilt) {
      skillKey = nextSkillKey;
      rebuildSkills();
    }
    const nextBonusKey: string = sheet.bonuses.map((bonus: SheetBonus): string => `${bonus.source}:${bonus.text}`).join('|');
    if (nextBonusKey !== bonusKey) {
      bonusKey = nextBonusKey;
      rebuildBonuses();
    }
    aimAll();
    if (fresh || rebuilt) {
      for (const view of views) snap(view);
      fresh = false;
    }
    since = 0;
  };

  const place = (): void => {
    const shifted: boolean = inventory.classList.contains('open');
    element.style.setProperty('--beside-right', `${shifted ? inventory.offsetWidth + CHARACTER.edge + CHARACTER.inventoryGap : CHARACTER.edge}px`);
  };

  return {
    element,
    refresh(): void {
      refresh();
      place();
    },
    update(dt: number): void {
      since += dt;
      if (since >= CHARACTER.refreshInterval) refresh();
      place();
      for (const view of views) draw(view, dt);
    },
  };
}

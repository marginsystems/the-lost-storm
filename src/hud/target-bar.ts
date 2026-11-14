import type { MonsterState, World } from '../../sim/world/types.ts';
import { pickTarget, TARGETING } from '../../sim/world/target.ts';
import type { RecentHit, Target } from '../../sim/world/target.ts';
import targetCss from './target.css?inline';
import { clamp01, el, label, setText } from './dom.ts';
import { monsterLines, monsterSummaryParts, rankPlate, reusedPhrases } from './monster-info.ts';
import type { MonsterLine, RankPlate } from './monster-info.ts';
import { NO_INFO, stepInfo } from './target-info.ts';
import type { InfoState, InfoStep } from './target-info.ts';

export const TARGET_BAR = {
  step: 0.002,
} as const;

export interface TargetBar {
  hit(monsterId: number): void;
  update(dt: number, world: World, hoveredId: number | null): void;
}

function texts(lines: readonly MonsterLine[], kind: 'resist' | 'weak' | 'state'): string {
  return lines.flatMap((line: MonsterLine): string[] => (line.kind === kind ? [line.text] : [])).join(' · ');
}

function fillInfo(info: HTMLDivElement, lines: readonly MonsterLine[]): void {
  const body: HTMLDivElement = el('div', 'target-info-body', null);
  const states: string = texts(lines, 'state');
  if (states.length > 0) label('target-info-state', states, body);
  for (const line of lines) {
    if (line.kind !== 'ability') continue;
    const row: HTMLDivElement = el('div', 'target-info-ability', body);
    const head: HTMLDivElement = el('div', 'target-info-ability-head', row);
    label('target-info-name', line.name, head);
    if (line.tags.length > 0) label('target-info-tags', line.tags, head);
    if (line.effect.length > 0) label('target-info-effect', line.effect, row);
  }
  const resists: string = texts(lines, 'resist');
  const weak: string = texts(lines, 'weak');
  if (resists.length > 0) label('target-info-resist', resists, body);
  if (weak.length > 0) label('target-info-weak', weak, body);
  info.replaceChildren(body);
}

function showPhrases(summary: HTMLElement, parts: readonly string[]): void {
  const shown: Element[] = [...summary.children];
  const reuse: (number | null)[] = reusedPhrases(shown.map((node: Element): string => node.textContent), parts);
  const kept: Set<number> = new Set<number>(reuse.flatMap((at: number | null): number[] => (at === null ? [] : [at])));
  shown.forEach((node: Element, index: number): void => {
    if (!kept.has(index)) node.remove();
  });
  let before: Element | null = summary.firstElementChild;
  parts.forEach((part: string, index: number): void => {
    const at: number | null = reuse[index] ?? null;
    const node: Element | undefined = at === null ? undefined : shown[at];
    if (node !== undefined) {
      before = node.nextElementSibling;
      return;
    }
    summary.insertBefore(label('target-summary-part', part, null), before);
  });
  const room: number = summary.clientWidth;
  if (room === 0) return;
  for (const node of summary.children) {
    if (!(node instanceof HTMLElement)) continue;
    node.classList.remove('too-wide');
    node.classList.toggle('too-wide', node.scrollWidth > room);
  }
}

export function createTargetBar(root: HTMLElement): TargetBar {
  const style: HTMLStyleElement = el('style', '', document.head);
  style.textContent = targetCss;
  const element: HTMLDivElement = el('div', 'hud-target', root);
  const head: HTMLDivElement = el('div', 'target-head', element);
  const name: HTMLSpanElement = el('span', 'target-name', head);
  const summary: HTMLSpanElement = el('span', 'target-summary', head);
  const level: HTMLSpanElement = el('small', 'target-level', head);
  const mods: HTMLDivElement = el('div', 'target-mods', element);
  const track: HTMLDivElement = el('div', 'target-track', element);
  const chip: HTMLDivElement = el('div', 'target-chip', track);
  const fill: HTMLDivElement = el('div', 'target-fill', track);
  const infoBox: HTMLDivElement = el('div', 'target-info', element);
  let recent: RecentHit | null = null;
  let shownId: number | null = null;
  let shownRatio: number = -1;
  let shownSummary: string = '';
  let visible: boolean = false;
  let info: InfoState = NO_INFO;

  return {
    hit(monsterId: number): void {
      recent = { id: monsterId, age: 0 };
    },
    update(dt: number, world: World, hoveredId: number | null): void {
      if (recent !== null) recent = { id: recent.id, age: recent.age + dt };
      const picked: Target | null = pickTarget(world.monsters, hoveredId, recent, TARGETING.grace);
      const target: MonsterState | null = picked !== null && picked.kind === 'monster' ? picked.monster : null;
      const show: boolean = target !== null;
      if (show !== visible) {
        visible = show;
        element.classList.toggle('visible', show);
      }
      const lines: MonsterLine[] = target === null ? [] : monsterLines(world, target);
      const step: InfoStep = stepInfo(info, target === null ? null : { id: target.id, kind: target.def.id, key: JSON.stringify(lines), hasLines: lines.length > 0 }, dt);
      if (step.refill) fillInfo(infoBox, lines);
      if (step.state.informed !== info.informed) infoBox.classList.toggle('visible', step.state.informed);
      info = step.state;
      if (target === null) return;
      if (target.id !== shownId) {
        shownId = target.id;
        shownRatio = -1;
        setText(name, target.def.name, false);
        const plate: RankPlate = rankPlate(world.content, target.def);
        name.style.color = plate.color ?? '';
        mods.style.color = plate.color ?? '';
        setText(mods, plate.mods, false);
        mods.classList.toggle('visible', plate.mods.length > 0);
        track.classList.add('snap');
      }
      const parts: string[] = monsterSummaryParts(lines);
      const said: string = parts.join(' · ');
      if (said !== shownSummary) {
        shownSummary = said;
        showPhrases(summary, parts);
      }
      setText(level, `Level ${target.level}`, false);
      const ratio: number = Math.round(clamp01(target.life / target.maxLife) / TARGET_BAR.step) * TARGET_BAR.step;
      if (ratio === shownRatio) return;
      shownRatio = ratio;
      fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
      chip.style.transform = `scaleX(${ratio.toFixed(3)})`;
      if (track.classList.contains('snap')) {
        track.getBoundingClientRect();
        track.classList.remove('snap');
      }
    },
  };
}

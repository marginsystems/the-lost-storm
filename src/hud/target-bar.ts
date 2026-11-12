import type { MonsterState, World } from '../../sim/world/types.ts';
import { pickTarget, TARGETING } from '../../sim/world/target.ts';
import type { RecentHit, Target } from '../../sim/world/target.ts';
import targetCss from './target.css?inline';
import { clamp01, el, label, setText } from './dom.ts';
import { monsterLines, monsterSummary } from './monster-info.ts';
import type { MonsterLine } from './monster-info.ts';
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

export function createTargetBar(root: HTMLElement): TargetBar {
  const style: HTMLStyleElement = el('style', '', document.head);
  style.textContent = targetCss;
  const element: HTMLDivElement = el('div', 'hud-target', root);
  const head: HTMLDivElement = el('div', 'target-head', element);
  const name: HTMLSpanElement = el('span', 'target-name', head);
  const summary: HTMLSpanElement = el('span', 'target-summary', head);
  const level: HTMLSpanElement = el('small', 'target-level', head);
  const track: HTMLDivElement = el('div', 'target-track', element);
  const chip: HTMLDivElement = el('div', 'target-chip', track);
  const fill: HTMLDivElement = el('div', 'target-fill', track);
  const infoBox: HTMLDivElement = el('div', 'target-info', element);
  let recent: RecentHit | null = null;
  let shownId: number | null = null;
  let shownRatio: number = -1;
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
        track.classList.add('snap');
      }
      setText(summary, monsterSummary(lines), false);
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

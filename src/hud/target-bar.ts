import type { MonsterState, World } from '../../sim/world/types.ts';
import { pickTarget, TARGETING } from '../../sim/world/target.ts';
import type { RecentHit, Target } from '../../sim/world/target.ts';
import targetCss from './target.css?inline';
import { clamp01, el, label, setText } from './dom.ts';
import { monsterLines, monsterSummary } from './monster-info.ts';
import type { MonsterLine } from './monster-info.ts';

export const TARGET_BAR = {
  step: 0.002,
  infoDelay: 0.35,
  fadeOut: 0.3,
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
  const info: HTMLDivElement = el('div', 'target-info', element);
  let recent: RecentHit | null = null;
  let shownId: number | null = null;
  let shownRatio: number = -1;
  let shownInfo: string = '';
  let dwell: number = 0;
  let visible: boolean = false;
  let informed: boolean = false;
  let quiet: number = TARGET_BAR.fadeOut;

  const inform = (show: boolean): void => {
    if (show === informed) return;
    informed = show;
    if (!show) quiet = 0;
    info.classList.toggle('visible', show);
  };

  return {
    hit(monsterId: number): void {
      recent = { id: monsterId, age: 0 };
    },
    update(dt: number, world: World, hoveredId: number | null): void {
      if (recent !== null) recent = { id: recent.id, age: recent.age + dt };
      if (!informed) quiet += dt;
      const picked: Target | null = pickTarget(world.monsters, hoveredId, recent, TARGETING.grace);
      const target: MonsterState | null = picked !== null && picked.kind === 'monster' ? picked.monster : null;
      const show: boolean = target !== null;
      if (show !== visible) {
        visible = show;
        element.classList.toggle('visible', show);
      }
      if (target === null) {
        dwell = 0;
        inform(false);
        return;
      }
      if (target.id !== shownId) {
        shownId = target.id;
        shownRatio = -1;
        dwell = 0;
        inform(false);
        setText(name, target.def.name, false);
        track.classList.add('snap');
      }
      dwell += dt;
      const lines: MonsterLine[] = monsterLines(world, target);
      const key: string = JSON.stringify(lines);
      setText(summary, monsterSummary(lines), false);
      const settled: boolean = informed || quiet >= TARGET_BAR.fadeOut;
      if (key !== shownInfo && settled) {
        shownInfo = key;
        fillInfo(info, lines);
      }
      inform(dwell >= TARGET_BAR.infoDelay && lines.length > 0 && key === shownInfo);
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

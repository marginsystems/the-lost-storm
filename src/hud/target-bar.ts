import type { MonsterState } from '../../sim/world/types.ts';
import { pickTarget, TARGETING } from '../../sim/world/target.ts';
import type { RecentHit, Target } from '../../sim/world/target.ts';
import targetCss from './target.css?inline';
import { clamp01, el, setText } from './dom.ts';

export const TARGET_BAR = {
  step: 0.002,
} as const;

export interface TargetBar {
  hit(monsterId: number): void;
  update(dt: number, monsters: readonly MonsterState[], hoveredId: number | null): void;
}

export function createTargetBar(root: HTMLElement): TargetBar {
  const style: HTMLStyleElement = el('style', '', document.head);
  style.textContent = targetCss;
  const element: HTMLDivElement = el('div', 'hud-target', root);
  const head: HTMLDivElement = el('div', 'target-head', element);
  const name: HTMLSpanElement = el('span', 'target-name', head);
  const level: HTMLSpanElement = el('small', 'target-level', head);
  const track: HTMLDivElement = el('div', 'target-track', element);
  const chip: HTMLDivElement = el('div', 'target-chip', track);
  const fill: HTMLDivElement = el('div', 'target-fill', track);
  let recent: RecentHit | null = null;
  let shownId: number | null = null;
  let shownRatio: number = -1;
  let visible: boolean = false;

  return {
    hit(monsterId: number): void {
      recent = { id: monsterId, age: 0 };
    },
    update(dt: number, monsters: readonly MonsterState[], hoveredId: number | null): void {
      if (recent !== null) recent = { id: recent.id, age: recent.age + dt };
      const picked: Target | null = pickTarget(monsters, hoveredId, recent, TARGETING.grace);
      const target: MonsterState | null = picked !== null && picked.kind === 'monster' ? picked.monster : null;
      const show: boolean = target !== null;
      if (show !== visible) {
        visible = show;
        element.classList.toggle('visible', show);
      }
      if (target === null) return;
      if (target.id !== shownId) {
        shownId = target.id;
        shownRatio = -1;
        setText(name, target.def.name, false);
        track.classList.add('snap');
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

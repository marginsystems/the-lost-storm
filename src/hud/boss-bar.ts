import type { BossDef } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { pickTarget } from '../../sim/world/target.ts';
import type { Target } from '../../sim/world/target.ts';
import { clamp01, el, setText } from './dom.ts';

const BOSS_BAR = {
  step: 0.002,
} as const;

export interface BossBar {
  readonly element: HTMLElement;
  update(world: World): void;
}

function fighting(world: World): MonsterState | null {
  const picked: Target | null = pickTarget(world.monsters, null, null, 0);
  return picked !== null && picked.kind === 'boss' ? picked.monster : null;
}

export function createBossBar(root: HTMLElement): BossBar {
  const element: HTMLDivElement = el('div', 'hud-boss', root);
  const name: HTMLDivElement = el('div', 'boss-name', element);
  const title: HTMLDivElement = el('div', 'boss-title', element);
  const track: HTMLDivElement = el('div', 'boss-track', element);
  const chip: HTMLDivElement = el('div', 'boss-chip', track);
  const fill: HTMLDivElement = el('div', 'boss-fill', track);
  const marks: HTMLDivElement = el('div', 'boss-marks', track);
  let shownId: number | null = null;
  let shownRatio: number = -1;
  let visible: boolean = false;

  const describe = (monster: MonsterState, boss: BossDef): void => {
    setText(name, monster.def.name, false);
    setText(title, boss.title, false);
    marks.replaceChildren();
    for (const phase of boss.phases.slice(1)) {
      const mark: HTMLElement = el('i', 'boss-mark', marks);
      mark.style.left = `${(phase.below * 100).toFixed(1)}%`;
    }
  };

  return {
    element,
    update(world: World): void {
      const monster: MonsterState | null = fighting(world);
      const boss: BossDef | null = monster?.def.boss ?? null;
      const show: boolean = monster !== null && boss !== null;
      if (show !== visible) {
        visible = show;
        element.classList.toggle('visible', show);
      }
      if (monster === null || boss === null) {
        if (shownId !== null && shownRatio !== 0) {
          shownRatio = 0;
          fill.style.transform = 'scaleX(0)';
          chip.style.transform = 'scaleX(0)';
        }
        shownId = null;
        return;
      }
      if (monster.id !== shownId) {
        shownId = monster.id;
        shownRatio = -1;
        describe(monster, boss);
      }
      const ratio: number = Math.round(clamp01(monster.life / monster.maxLife) / BOSS_BAR.step) * BOSS_BAR.step;
      if (ratio === shownRatio) return;
      shownRatio = ratio;
      fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
      chip.style.transform = `scaleX(${ratio.toFixed(3)})`;
    },
  };
}

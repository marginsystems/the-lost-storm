import { Color } from 'three';
import type { RankLook } from '../../sim/content/rank-types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { ShadeMotion } from './shadow-shade.ts';
import { stepShade } from './shadow-shade.ts';

export interface RankRim {
  readonly color: Color;
  readonly amount: number;
}

interface Lit {
  readonly color: Color;
  readonly look: RankLook;
  readonly shown: ShadeMotion;
  monster: MonsterState;
}

export interface RankLookView {
  update(dt: number, world: World): void;
  rimOf(monsterId: number): RankRim | null;
}

export function rankLookOf(monster: MonsterState): RankLook | null {
  return monster.def.rank?.look ?? null;
}

export function rankRimStrength(monster: MonsterState, look: RankLook): number {
  return look.rim * (monster.def.rank?.leader === true ? look.leader : 1);
}

export function rankShown(monster: MonsterState): boolean {
  return monster.alive;
}

export function createRankLook(): RankLookView {
  const lit: Map<number, Lit> = new Map<number, Lit>();
  return {
    update(dt: number, world: World): void {
      const here: Map<number, MonsterState> = new Map<number, MonsterState>();
      for (const monster of world.monsters) {
        here.set(monster.id, monster);
        const look: RankLook | null = rankLookOf(monster);
        const aura: string | null = monster.def.rank?.aura ?? null;
        if (look === null || aura === null || !monster.alive || lit.has(monster.id)) continue;
        lit.set(monster.id, { color: new Color(aura), look, shown: { value: 0, speed: 0 }, monster });
      }
      for (const [id, entry] of lit) {
        const found: MonsterState | undefined = here.get(id);
        const monster: MonsterState | undefined = found !== undefined && rankLookOf(found) === entry.look ? found : undefined;
        if (monster !== undefined) entry.monster = monster;
        const shown: boolean = monster !== undefined && rankShown(monster);
        stepShade(entry.shown, shown ? 1 : 0, dt);
        if (shown || entry.shown.value > 0) continue;
        lit.delete(id);
      }
    },
    rimOf(monsterId: number): RankRim | null {
      const entry: Lit | undefined = lit.get(monsterId);
      return entry === undefined ? null : { color: entry.color, amount: entry.shown.value * rankRimStrength(entry.monster, entry.look) };
    },
  };
}

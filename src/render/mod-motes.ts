import { Color } from 'three';
import type { ModMotes, MonsterModDef } from '../../sim/content/combat-types.ts';
import type { Content, MonsterDef } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { ParticleSystem } from './particles.ts';

export const MOD_MOTES = {
  bodyShare: 0.9,
  life: { min: 0.6, max: 1.2 },
  size: { min: 0.18, max: 0.4 },
  speed: { min: 0.1, max: 0.5 },
  gravity: -0.6,
  drag: 1.4,
  jitter: 0.2,
  most: 4,
} as const;

interface MoteSource {
  readonly motes: ModMotes;
  readonly color: Color;
}

export interface ModMotesView {
  update(dt: number, world: World): void;
}

export function motesOf(content: Content, def: MonsterDef): ModMotes[] {
  return def.mods.flatMap((id: string): ModMotes[] => {
    const mod: MonsterModDef | undefined = content.monsterMods.get(id);
    return mod?.motes === null || mod?.motes === undefined ? [] : [mod.motes];
  });
}

export function motesDue(carry: number, rate: number, dt: number): { readonly count: number; readonly carry: number } {
  const total: number = carry + rate * dt;
  const count: number = Math.min(MOD_MOTES.most, Math.floor(total));
  return { count, carry: Math.min(1, total - count) };
}

export function createModMotes(particles: ParticleSystem, content: Content): ModMotesView {
  const sources: Map<MonsterDef, readonly MoteSource[]> = new Map<MonsterDef, readonly MoteSource[]>();
  const carries: Map<string, number> = new Map<string, number>();
  const sourcesOf = (def: MonsterDef): readonly MoteSource[] => {
    const known: readonly MoteSource[] | undefined = sources.get(def);
    if (known !== undefined) return known;
    const made: MoteSource[] = motesOf(content, def).map((motes: ModMotes): MoteSource => ({ motes, color: new Color(motes.color) }));
    sources.set(def, made);
    return made;
  };
  const emit = (monster: MonsterState, source: MoteSource, index: number, dt: number): void => {
    const key: string = `${monster.id}:${index}`;
    const due = motesDue(carries.get(key) ?? 0, source.motes.rate, dt);
    carries.set(key, due.carry);
    if (due.count === 0) return;
    const reach: number = monster.radius * MOD_MOTES.bodyShare;
    const angle: number = Math.random() * Math.PI * 2;
    particles.burst({
      x: monster.pos.x + Math.cos(angle) * reach,
      y: source.motes.lift,
      z: monster.pos.z + Math.sin(angle) * reach,
      count: due.count,
      color: source.color,
      speed: MOD_MOTES.speed,
      lift: { min: source.motes.lift * 0.5, max: source.motes.lift * 1.5 },
      life: MOD_MOTES.life,
      size: MOD_MOTES.size,
      gravity: MOD_MOTES.gravity,
      drag: MOD_MOTES.drag,
      dirX: 0,
      dirZ: 1,
      spread: Math.PI * 2,
      jitter: MOD_MOTES.jitter,
    });
  };
  return {
    update(dt: number, world: World): void {
      for (const monster of world.monsters) {
        if (!monster.alive || monster.spawnTime > 0 || monster.def.mods.length === 0) continue;
        sourcesOf(monster.def).forEach((source: MoteSource, index: number): void => emit(monster, source, index, dt));
      }
      if (carries.size > world.monsters.length * MOD_MOTES.most * 2) carries.clear();
    },
  };
}

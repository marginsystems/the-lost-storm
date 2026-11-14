import type { MonsterModDef } from '../content/combat-types.ts';
import type { MonsterDef } from '../content/types.ts';

function withMod(def: MonsterDef, mod: MonsterModDef): MonsterDef {
  return {
    ...def,
    name: `${mod.prefix} ${def.name}`,
    scale: def.scale * mod.sizeScale,
    life: def.life * mod.lifeScale,
    damageMin: def.damageMin * mod.damageScale,
    damageMax: def.damageMax * mod.damageScale,
    moveSpeed: def.moveSpeed * mod.speedScale,
    xp: def.xp * mod.xpScale,
    loot: {
      goldChance: Math.min(1, def.loot.goldChance * mod.lootScale),
      goldMin: def.loot.goldMin * mod.lootScale,
      goldMax: def.loot.goldMax * mod.lootScale,
      itemChance: Math.min(1, def.loot.itemChance * mod.lootScale),
    },
    color: mod.color,
    deathSkill: mod.deathSkill ?? def.deathSkill,
    summon: mod.summon ?? def.summon,
    poise: { ...def.poise, stagger: def.poise.stagger * mod.staggerScale },
    regen: def.regen + mod.regen,
    mods: [...def.mods, mod.id],
  };
}

export function withMods(def: MonsterDef, mods: readonly MonsterModDef[]): MonsterDef {
  return mods.reduce(withMod, def);
}

export function modsNamed(known: ReadonlyMap<string, MonsterModDef>, ids: readonly string[]): MonsterModDef[] {
  return ids.flatMap((id: string): MonsterModDef[] => {
    const mod: MonsterModDef | undefined = known.get(id);
    return mod === undefined ? [] : [mod];
  });
}

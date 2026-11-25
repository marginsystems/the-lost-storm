import type { MonsterScaling, XpBeyond } from '../content/types.ts';

export function monsterXpScale(scaling: MonsterScaling, level: number): number {
  const beyond: XpBeyond | null = scaling.xpBeyond;
  if (beyond === null || level <= beyond.from) return 1 + scaling.xpPerLevel * (level - 1);
  return (1 + scaling.xpPerLevel * (beyond.from - 1)) * beyond.lift * Math.pow(beyond.growth, level - beyond.from);
}

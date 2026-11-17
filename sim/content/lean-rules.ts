import type { Content, DropLean } from './types.ts';

function leanProblemsOf(content: Content, lean: DropLean): string[] {
  const owner: string = `drop lean ${lean.id}`;
  const problems: string[] = [];
  if (lean.zones.length === 0) problems.push(`${owner} names no zone`);
  for (const zone of lean.zones) if (!content.zones.has(zone)) problems.push(`${owner} names unknown zone ${zone}`);
  for (const weapon of lean.weapons) if (!content.chart.weaponGroups.some((group): boolean => group.id === weapon)) problems.push(`${owner} favours unknown weapon group ${weapon}`);
  for (const family of lean.families) if (!content.families.has(family)) problems.push(`${owner} favours unknown family ${family}`);
  const favours: boolean = lean.share > 1 && lean.weapons.length + lean.slots.length + lean.families.length > 0;
  if (!favours && lean.legendary <= 1) problems.push(`${owner} favours nothing`);
  return problems;
}

export function leanProblems(content: Content): string[] {
  const problems: string[] = content.leans.flatMap((lean: DropLean): string[] => leanProblemsOf(content, lean));
  const seen: Set<string> = new Set<string>();
  for (const lean of content.leans) {
    for (const zone of lean.zones) {
      if (seen.has(zone)) problems.push(`zone ${zone} is in two drop leans`);
      seen.add(zone);
    }
  }
  return problems;
}

export function leanOf(content: Content, zone: string | null): DropLean | null {
  if (zone === null || !content.leaning) return null;
  return content.leans.find((lean: DropLean): boolean => lean.zones.includes(zone)) ?? null;
}

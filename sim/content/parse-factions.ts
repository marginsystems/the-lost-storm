import type { FactionDef, FactionPalette, Regard } from './combat-types.ts';
import { PLAYER_SIDE, REGARDS } from './combat-types.ts';
import type { Fields } from './read.ts';
import { choice, ContentError, fields, text, textList } from './read.ts';
import type { Content } from './types.ts';

function palette(value: unknown, where: string): FactionPalette {
  const source: Fields = fields(value, where);
  const tints: string[] = textList(source, 'tints', where);
  if (tints.length === 0) throw new ContentError(`${where}.tints`, 'a palette needs at least one tint');
  return { tints, glow: text(source, 'glow', where) };
}

function regards(value: unknown, where: string): Record<string, Regard> {
  const source: Fields = fields(value, where);
  const read: Record<string, Regard> = {};
  for (const key of Object.keys(source)) read[key] = choice(source, key, REGARDS, where);
  return read;
}

export function faction(value: unknown, where: string): FactionDef {
  const source: Fields = fields(value, where);
  const id: string = text(source, 'id', where);
  if (id === PLAYER_SIDE) throw new ContentError(`${where}.id`, `${PLAYER_SIDE} names the hero, not a people`);
  return {
    id,
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    palette: palette(source['palette'], `${where}.palette`),
    wearables: textList(source, 'wearables', where),
    weapons: textList(source, 'weapons', where),
    regards: regards(source['regards'], `${where}.regards`),
  };
}

interface Member {
  readonly holder: string;
  readonly faction: string;
  readonly tint: string;
  readonly color: string;
  readonly wear: readonly string[];
  readonly gear: readonly string[];
}

export function factionProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const def of content.factions.values()) {
    for (const worn of def.wearables) need(content.wearables.has(worn), `faction ${def.id} lists unknown wearable ${worn}`);
    for (const held of def.weapons) need(content.attachments.has(held), `faction ${def.id} lists unknown weapon ${held}`);
    for (const [other, regard] of Object.entries(def.regards)) {
      need(other === PLAYER_SIDE || content.factions.has(other), `faction ${def.id} regards unknown side ${other}`);
      need(other !== def.id || regard === 'friendly', `faction ${def.id} must be friendly to itself`);
    }
  }
  const members: Member[] = [
    ...[...content.monsters.values()].map((def): Member => ({ holder: `monster ${def.id}`, faction: def.faction, tint: def.tint, color: def.color, wear: def.wear, gear: def.gear })),
    ...[...content.npcs.values()].flatMap((def): Member[] => (def.faction === null ? [] : [{ holder: `npc ${def.id}`, faction: def.faction, tint: def.tint, color: def.color, wear: def.wear, gear: def.gear }])),
  ];
  for (const member of members) {
    const people: FactionDef | undefined = content.factions.get(member.faction);
    need(people !== undefined, `${member.holder} belongs to unknown faction ${member.faction}`);
    if (people === undefined) continue;
    need(people.palette.tints.includes(member.tint), `${member.holder} has tint ${member.tint}, outside the ${people.id} palette`);
    need(people.palette.glow === member.color, `${member.holder} glows ${member.color}, not the ${people.id} glow ${people.palette.glow}`);
    for (const worn of member.wear) need(people.wearables.includes(worn), `${member.holder} wears ${worn}, which the ${people.id} do not wear`);
    for (const held of member.gear) need(people.weapons.includes(held), `${member.holder} carries ${held}, which the ${people.id} do not carry`);
  }
  return problems;
}

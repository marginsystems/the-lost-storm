import type { ActDef, AtlasPoint, AtlasRoad, Content, MapPlace, ZoneDef, ZoneExit } from './types.ts';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function within(point: AtlasPoint, act: ActDef): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= act.atlas.width && point.y <= act.atlas.height;
}

function actProblems(content: Content, act: ActDef): string[] {
  const problems: string[] = [];
  const at: string = `act ${act.id}`;
  const placed: Set<string> = new Set<string>();
  const spots: Set<string> = new Set<string>();
  for (const place of act.atlas.places) {
    if (!content.zones.has(place.zone)) problems.push(`world map places unknown zone ${place.zone}`);
    if (placed.has(place.zone)) problems.push(`${at} places zone ${place.zone} twice`);
    if (spots.has(`${place.x},${place.y}`)) problems.push(`${at} puts two zones at ${place.x},${place.y}`);
    if (!within(place, act)) problems.push(`${at} places zone ${place.zone} off the map`);
    placed.add(place.zone);
    spots.add(`${place.x},${place.y}`);
  }
  if (!within(act.atlas.compass, act)) problems.push(`${at} puts the compass off the map`);
  const roads: Set<string> = new Set<string>();
  const linked = (from: string, to: string): boolean => content.zones.get(from)?.exits.some((exit: ZoneExit): boolean => exit.to === to) ?? false;
  act.atlas.roads.forEach((road: AtlasRoad): void => {
    const name: string = `${at} road ${road.from} to ${road.to}`;
    const key: string = pairKey(road.from, road.to);
    if (!placed.has(road.from) || !placed.has(road.to)) problems.push(`${name} joins a zone with no place in the act`);
    if (roads.has(key)) problems.push(`${name} is drawn twice`);
    if (!linked(road.from, road.to) && !linked(road.to, road.from)) problems.push(`${name} follows no exit`);
    if (road.via.some((point: AtlasPoint): boolean => !within(point, act))) problems.push(`${name} leaves the map`);
    roads.add(key);
  });
  for (const place of act.atlas.places) {
    const zone: ZoneDef | undefined = content.zones.get(place.zone);
    if (zone === undefined) continue;
    for (const exit of zone.exits) {
      if (placed.has(exit.to) && !roads.has(pairKey(zone.id, exit.to))) problems.push(`${at} draws no road from ${zone.id} to ${exit.to}`);
    }
  }
  return problems;
}

export function atlasProblems(content: Content): string[] {
  return content.world.acts.flatMap((act: ActDef): string[] => actProblems(content, act));
}

export function actOf(content: Content, zoneId: string): ActDef | undefined {
  return content.world.acts.find((act: ActDef): boolean => act.atlas.places.some((place: MapPlace): boolean => place.zone === zoneId)) ?? content.world.acts[0];
}

import type { Content, PropDef, ZoneDef, ZoneExit } from '../../sim/content/types.ts';

export function zoneProps(zone: ZoneDef): string[] {
  const walls: string[] = zone.walls === null ? [] : [...zone.walls.tall, zone.walls.low, zone.walls.corner];
  return [...walls, ...zone.props.map((placed): string => placed.prop), ...(zone.outside?.edge?.props ?? []), ...zone.scatter.flatMap((rule): readonly string[] => rule.props), ...(zone.void?.shore?.props ?? []).map((placed): string => placed.prop)];
}

export function zoneModels(content: Content, zone: ZoneDef): Set<string> {
  const models: Set<string> = new Set<string>();
  for (const propId of zoneProps(zone)) {
    const def: PropDef | undefined = content.props.get(propId);
    if (def !== undefined) models.add(def.model);
  }
  return models;
}

export function zoneSurfaces(content: Content, zone: ZoneDef): Set<string> {
  const ids: Set<string> = new Set<string>(Object.values(zone.floors));
  if (zone.outside !== null) ids.add(zone.outside.surface);
  const shoreSurface: string | null = zone.void?.shore?.surface ?? null;
  if (shoreSurface !== null) ids.add(shoreSurface);
  const pathSurface: string | null = zone.void?.shore?.path?.surface ?? null;
  if (pathSurface !== null) ids.add(pathSurface);
  for (const propId of zoneProps(zone)) {
    const def: PropDef | undefined = content.props.get(propId);
    if (def !== undefined) for (const id of Object.values(def.surfaces)) ids.add(id);
  }
  for (const attachment of content.attachments.values()) for (const id of Object.values(attachment.surfaces)) ids.add(id);
  return ids;
}

export function momentSurfaces(content: Content): Set<string> {
  const ids: Set<string> = new Set<string>();
  for (const def of content.moments.defs.values()) {
    ids.add(def.ground);
    for (const placed of def.props) {
      const prop: PropDef | undefined = content.props.get(placed.prop);
      if (prop !== undefined) for (const id of Object.values(prop.surfaces)) ids.add(id);
    }
  }
  return ids;
}

export function neighbourZones(content: Content, zone: ZoneDef): ZoneDef[] {
  const ids: Set<string> = new Set<string>(zone.exits.map((exit: ZoneExit): string => exit.to));
  ids.delete(zone.id);
  return [...ids].map((id: string): ZoneDef | undefined => content.zones.get(id)).filter((found: ZoneDef | undefined): found is ZoneDef => found !== undefined);
}

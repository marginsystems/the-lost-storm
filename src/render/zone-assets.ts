import type { Content, PropDef, ZoneDef } from '../../sim/content/types.ts';

export function zoneProps(zone: ZoneDef): string[] {
  return [...zone.walls.tall, zone.walls.low, zone.walls.corner, ...zone.props.map((placed): string => placed.prop)];
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
  for (const propId of zoneProps(zone)) {
    const def: PropDef | undefined = content.props.get(propId);
    if (def !== undefined) for (const id of Object.values(def.surfaces)) ids.add(id);
  }
  for (const attachment of content.attachments.values()) for (const id of Object.values(attachment.surfaces)) ids.add(id);
  return ids;
}

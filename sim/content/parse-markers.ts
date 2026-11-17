import type { Fields } from './read.ts';
import { byId, choice, colour, ContentError, each, fields, nonNegative, positive, text, textList } from './read.ts';
import type { MarkerFocal, MarkerKind, MarkerLevels, MarkerLibrary, MarkerLight, MarkerPick, MarkerRole, MarkerSeal, MarkerVeil } from './marker-types.ts';
import { MARKER_FACINGS, MARKER_ROLES, VEIL_FLOWS, VEIL_SHAPES } from './marker-types.ts';

function dressing(value: unknown, where: string): Record<string, string> {
  const source: Fields = fields(value, where);
  const mapped: Record<string, string> = {};
  for (const key of Object.keys(source)) mapped[key] = text(source, key, where);
  return mapped;
}

function focal(value: unknown, where: string): MarkerFocal | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { node: text(source, 'node', where), lift: nonNegative(source, 'lift', where), spin: nonNegative(source, 'spin', where), bob: nonNegative(source, 'bob', where) };
}

function seal(value: unknown, where: string): MarkerSeal | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { node: text(source, 'node', where), sink: positive(source, 'sink', where) };
}

function veil(value: unknown, where: string): MarkerVeil | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { node: text(source, 'node', where), shape: choice(source, 'shape', VEIL_SHAPES, where), flow: choice(source, 'flow', VEIL_FLOWS, where), edge: colour(source, 'edge', where), core: colour(source, 'core', where) };
}

function light(value: unknown, where: string): MarkerLight {
  const source: Fields = fields(value, where);
  return { intensity: nonNegative(source, 'intensity', where), distance: positive(source, 'distance', where), height: nonNegative(source, 'height', where) };
}

function pick(value: unknown, where: string): MarkerPick {
  const source: Fields = fields(value, where);
  return { radius: nonNegative(source, 'radius', where), height: nonNegative(source, 'height', where) };
}

function levels(value: unknown, where: string): MarkerLevels {
  const source: Fields = fields(value, where);
  const read: MarkerLevels = { dormant: nonNegative(source, 'dormant', where), awake: nonNegative(source, 'awake', where), aimed: nonNegative(source, 'aimed', where), used: nonNegative(source, 'used', where) };
  if (!(read.dormant <= read.awake && read.awake <= read.aimed && read.aimed <= read.used)) throw new ContentError(where, 'levels must rise from dormant to awake to aimed to used');
  return read;
}

function kind(value: unknown, where: string): MarkerKind {
  const source: Fields = fields(value, where);
  const model: string = text(source, 'model', where);
  if (!model.startsWith('models/')) throw new ContentError(`${where}.model`, 'a marker is a solid model under models/');
  return {
    id: text(source, 'id', where),
    model,
    surfaces: dressing(source['surfaces'], `${where}.surfaces`),
    color: colour(source, 'color', where),
    glow: textList(source, 'glow', where),
    focal: focal(source['focal'], `${where}.focal`),
    seal: seal(source['seal'], `${where}.seal`),
    veil: veil(source['veil'], `${where}.veil`),
    light: light(source['light'], `${where}.light`),
    shadow: nonNegative(source, 'shadow', where),
    pick: pick(source['pick'], `${where}.pick`),
    label: nonNegative(source, 'label', where),
    facing: choice(source, 'facing', MARKER_FACINGS, where),
    levels: levels(source['levels'], `${where}.levels`),
  };
}

export function markerLibrary(value: unknown, where: string): MarkerLibrary {
  const source: Fields = fields(value, where);
  const kinds: Map<string, MarkerKind> = byId(each(source['kinds'], `${where}.kinds`, kind), `${where}.kinds`);
  const roleFields: Fields = fields(source['roles'], `${where}.roles`);
  const roles: Record<MarkerRole, string> = { waypoint: '', checkpoint: '', down: '', up: '' };
  for (const role of MARKER_ROLES) {
    const id: string = text(roleFields, role, `${where}.roles`);
    if (!kinds.has(id)) throw new ContentError(`${where}.roles.${role}`, `names unknown marker kind ${id}`);
    roles[role] = id;
  }
  return { kinds, roles };
}

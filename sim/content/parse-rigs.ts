import type { RigActionClip, RigClips, RigDef, RigSocket, RigUnarmedClips, Triple } from './types.ts';
import type { Fields } from './read.ts';
import { ContentError, each, fields, nullableText, numeric, text, textList } from './read.ts';
import { rigGaits } from './parse-gaits.ts';

function actionClips(value: unknown, where: string): Record<string, RigActionClip> {
  const actionFields: Fields = fields(value, where);
  const actions: Record<string, RigActionClip> = {};
  for (const key of Object.keys(actionFields)) {
    const entry: Fields = fields(actionFields[key], `${where}.${key}`);
    const impactFraction: number = numeric(entry, 'impactFraction', `${where}.${key}`);
    if (impactFraction < 0 || impactFraction >= 1) throw new ContentError(`${where}.${key}.impactFraction`, 'expected a number from 0 up to, but not including, 1');
    actions[key] = { clip: text(entry, 'clip', `${where}.${key}`), impactFraction };
  }
  return actions;
}

function unarmedClips(value: unknown, where: string): RigUnarmedClips | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { idle: text(source, 'idle', where), actions: actionClips(source['actions'], `${where}.actions`) };
}

function rigClips(value: unknown, where: string): RigClips {
  const source: Fields = fields(value, where);
  const actions: Record<string, RigActionClip> = actionClips(source['actions'], `${where}.actions`);
  const hit: string[] = textList(source, 'hit', where);
  const death: string[] = textList(source, 'death', where);
  if (hit.length === 0) throw new ContentError(`${where}.hit`, 'a rig needs at least one hit clip');
  if (death.length === 0) throw new ContentError(`${where}.death`, 'a rig needs at least one death clip');
  return { idle: text(source, 'idle', where), run: text(source, 'run', where), hit, death, rise: source['rise'] === undefined ? null : nullableText(source, 'rise', where), actions, unarmed: unarmedClips(source['unarmed'], `${where}.unarmed`) };
}

function triple(source: Fields, key: string, where: string): Triple {
  const values: number[] = each(source[key], `${where}.${key}`, (entry: unknown, entryWhere: string): number => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new ContentError(entryWhere, 'expected a number');
    return entry;
  });
  const [x, y, z] = values;
  if (values.length !== 3 || x === undefined || y === undefined || z === undefined) throw new ContentError(`${where}.${key}`, 'expected three numbers');
  return [x, y, z];
}

function rigSocket(value: unknown, where: string): RigSocket {
  const source: Fields = fields(value, where);
  return { bone: text(source, 'bone', where), position: triple(source, 'position', where), rotationDegrees: triple(source, 'rotationDegrees', where), scale: numeric(source, 'scale', where) };
}

function restHands(value: unknown, sockets: Readonly<Record<string, RigSocket>>, where: string): Record<string, Record<string, Triple>> {
  if (value === undefined) return {};
  const handFields: Fields = fields(value, where);
  const hands: Record<string, Record<string, Triple>> = {};
  for (const socket of Object.keys(handFields)) {
    if (sockets[socket] === undefined) throw new ContentError(`${where}.${socket}`, 'a resting hand must name one of the rig\'s sockets');
    const boneFields: Fields = fields(handFields[socket], `${where}.${socket}`);
    const bones: Record<string, Triple> = {};
    for (const bone of Object.keys(boneFields)) bones[bone] = triple(boneFields, bone, `${where}.${socket}`);
    hands[socket] = bones;
  }
  return hands;
}

export function rig(value: unknown, where: string): RigDef {
  const source: Fields = fields(value, where);
  const socketFields: Fields = fields(source['sockets'], `${where}.sockets`);
  const sockets: Record<string, RigSocket> = {};
  for (const key of Object.keys(socketFields)) sockets[key] = rigSocket(socketFields[key], `${where}.sockets.${key}`);
  const partFields: Fields = fields(source['bodyParts'], `${where}.bodyParts`);
  const bodyParts: Record<string, readonly string[]> = {};
  for (const key of Object.keys(partFields)) bodyParts[key] = textList(partFields, key, `${where}.bodyParts`);
  return {
    id: text(source, 'id', where),
    url: text(source, 'url', where),
    clipFolder: text(source, 'clipFolder', where),
    scale: numeric(source, 'scale', where),
    yawOffsetDegrees: numeric(source, 'yawOffsetDegrees', where),
    height: numeric(source, 'height', where),
    rootMotionBone: nullableText(source, 'rootMotionBone', where),
    gaits: rigGaits(source['gaits'], `${where}.gaits`),
    idleRate: source['idleRate'] === undefined ? 1 : numeric(source, 'idleRate', where),
    clips: rigClips(source['clips'], `${where}.clips`),
    sockets,
    hiddenNodes: textList(source, 'hiddenNodes', where),
    bodyParts,
    base: source['base'] === undefined ? [] : textList(source, 'base', where),
    restHands: restHands(source['restHands'], sockets, `${where}.restHands`),
  };
}

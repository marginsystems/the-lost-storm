import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Quad, Triple } from '../sim/content/types.ts';

export type Side = 'L' | 'R';

export interface SavedPose {
  readonly bonesWorld: ReadonlyMap<string, Matrix4>;
  readonly weapon: Matrix4 | null;
}

export interface HoldSeat {
  readonly position: Triple;
  readonly rotationDegrees: Triple;
  readonly scale: number;
}

export interface ExportedHold {
  readonly bones: Readonly<Record<string, Quad>>;
  readonly seat: HoldSeat | null;
}

export const HOLD_EXPORT = {
  decimals: 1e6,
  seatDecimals: 1e4,
  angleDecimals: 10,
  uniformScale: 1e-3,
} as const;

const DIGITS: readonly string[] = ['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky'];
const GLTF_TO_BLENDER_LOCAL: Matrix4 = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const DEGREES: number = 180 / Math.PI;

export function heldBones(side: Side): readonly string[] {
  const arm: string[] = [`DEF-shoulder.${side}`, `DEF-upper_arm.${side}`, `DEF-forearm.${side}`, `DEF-hand.${side}`];
  const fingers: string[] = DIGITS.flatMap((digit: string): string[] => [1, 2, 3].map((joint: number): string => `DEF-${digit}.0${joint}.${side}`));
  return [...arm, ...fingers];
}

export function parentOf(bone: string, side: Side): string {
  if (bone === `DEF-shoulder.${side}`) return 'DEF-spine.003';
  if (bone === `DEF-upper_arm.${side}`) return `DEF-shoulder.${side}`;
  if (bone === `DEF-forearm.${side}`) return `DEF-upper_arm.${side}`;
  if (bone === `DEF-hand.${side}`) return `DEF-forearm.${side}`;
  const finger: RegExpExecArray | null = /^DEF-(thumb|f_[a-z]+)\.0([123])\.[LR]$/.exec(bone);
  const digit: string | undefined = finger?.[1];
  const joint: number = Number(finger?.[2]);
  if (digit === undefined) throw new Error(`no parent rule for ${bone}`);
  return joint === 1 ? `DEF-hand.${side}` : `DEF-${digit}.0${joint - 1}.${side}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMatrix(value: unknown, where: string): Matrix4 {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${where}: expected four rows`);
  const numbers: number[] = value.flatMap((row: unknown, index: number): number[] => {
    if (!Array.isArray(row) || row.length !== 4) throw new Error(`${where}[${index}]: expected four numbers`);
    return row.map((entry: unknown): number => {
      if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`${where}[${index}]: expected a number`);
      return entry;
    });
  });
  const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p] = numbers;
  return new Matrix4().set(a ?? 0, b ?? 0, c ?? 0, d ?? 0, e ?? 0, f ?? 0, g ?? 0, h ?? 0, i ?? 0, j ?? 0, k ?? 0, l ?? 0, m ?? 0, n ?? 0, o ?? 0, p ?? 1);
}

export function readSavedPose(value: unknown): SavedPose {
  if (!isRecord(value)) throw new Error('a saved pose is a JSON object');
  const world: unknown = value['bones_world'];
  if (!isRecord(world)) throw new Error('a saved pose needs bones_world');
  const bonesWorld: Map<string, Matrix4> = new Map<string, Matrix4>(Object.entries(world).map(([name, rows]: [string, unknown]): [string, Matrix4] => [name, readMatrix(rows, `bones_world.${name}`)]));
  const gun: unknown = value['gun'];
  const weapon: Matrix4 | null = isRecord(gun) && gun['matrix_world'] !== undefined ? readMatrix(gun['matrix_world'], 'gun.matrix_world') : null;
  return { bonesWorld, weapon };
}

const round = (value: number, decimals: number): number => Math.round(value * decimals) / decimals;

function turnOf(pose: SavedPose, bone: string): Quaternion {
  const world: Matrix4 | undefined = pose.bonesWorld.get(bone);
  if (world === undefined) throw new Error(`the saved pose has no ${bone}`);
  const position: Vector3 = new Vector3();
  const turn: Quaternion = new Quaternion();
  world.decompose(position, turn, new Vector3());
  return turn;
}

export function seatIn(hand: Matrix4, weapon: Matrix4): HoldSeat {
  const relative: Matrix4 = hand.clone().invert().multiply(weapon).multiply(GLTF_TO_BLENDER_LOCAL);
  const position: Vector3 = new Vector3();
  const turn: Quaternion = new Quaternion();
  const scale: Vector3 = new Vector3();
  relative.decompose(position, turn, scale);
  if (Math.abs(scale.x - scale.y) > HOLD_EXPORT.uniformScale || Math.abs(scale.x - scale.z) > HOLD_EXPORT.uniformScale) throw new Error('the held weapon is scaled unevenly; scale it the same on every axis');
  const angles: Euler = new Euler().setFromQuaternion(turn, 'XYZ');
  return {
    position: [round(position.x, HOLD_EXPORT.seatDecimals), round(position.y, HOLD_EXPORT.seatDecimals), round(position.z, HOLD_EXPORT.seatDecimals)],
    rotationDegrees: [round(angles.x * DEGREES, HOLD_EXPORT.angleDecimals), round(angles.y * DEGREES, HOLD_EXPORT.angleDecimals), round(angles.z * DEGREES, HOLD_EXPORT.angleDecimals)],
    scale: round(scale.x, HOLD_EXPORT.seatDecimals),
  };
}

export function exportHold(pose: SavedPose, side: Side, withSeat: boolean): ExportedHold {
  const bones: Record<string, Quad> = {};
  for (const bone of heldBones(side)) {
    const local: Quaternion = turnOf(pose, parentOf(bone, side)).invert().multiply(turnOf(pose, bone)).normalize();
    if (local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
    bones[bone] = [round(local.x, HOLD_EXPORT.decimals), round(local.y, HOLD_EXPORT.decimals), round(local.z, HOLD_EXPORT.decimals), round(local.w, HOLD_EXPORT.decimals)];
  }
  const hand: Matrix4 | undefined = pose.bonesWorld.get(`DEF-hand.${side}`);
  return { bones, seat: !withSeat || pose.weapon === null || hand === undefined ? null : seatIn(hand, pose.weapon) };
}

const INLINE_KEYS: ReadonlySet<string> = new Set<string>(['restHands', 'holds', 'base']);

function isScalar(value: unknown): boolean {
  return value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

export function formatRigs(value: unknown, depth: number = 0, inline: boolean = false): string {
  const indent: string = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (inline && value.every(isScalar)) return `[${value.map((entry: unknown): string => JSON.stringify(entry)).join(', ')}]`;
    return `[\n${value.map((entry: unknown): string => `${indent}  ${formatRigs(entry, depth + 1, inline)}`).join(',\n')}\n${indent}]`;
  }
  if (isRecord(value)) {
    const entries: [string, unknown][] = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([key, entry]: [string, unknown]): string => `${indent}  ${JSON.stringify(key)}: ${formatRigs(entry, depth + 1, inline || INLINE_KEYS.has(key))}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function rigEntry(rigs: unknown, rigId: string): Readonly<Record<string, unknown>> {
  const rig: unknown = Array.isArray(rigs) ? rigs.find((entry: unknown): boolean => isRecord(entry) && entry['id'] === rigId) : undefined;
  if (!isRecord(rig)) throw new Error(`rigs.json has no rig ${rigId}`);
  return rig;
}

export function withHold(rigs: unknown, rigId: string, attachment: string, hold: ExportedHold, seat: boolean): unknown {
  if (!Array.isArray(rigs)) throw new Error('rigs.json is a list of rigs');
  const rig: Readonly<Record<string, unknown>> = rigEntry(rigs, rigId);
  const holds: Readonly<Record<string, unknown>> = isRecord(rig['holds']) ? rig['holds'] : {};
  const earlier: unknown = holds[attachment];
  const kept: unknown = isRecord(earlier) && earlier['seat'] !== undefined ? earlier['seat'] : null;
  const entry: Readonly<Record<string, unknown>> = { seat: seat && hold.seat !== null ? hold.seat : kept, bones: hold.bones };
  return rigs.map((candidate: unknown): unknown => (candidate === rig ? { ...rig, holds: { ...holds, [attachment]: entry } } : candidate));
}

export function sideOf(rigs: unknown, attachments: unknown, rigId: string, attachment: string): Side {
  const found: unknown = Array.isArray(attachments) ? attachments.find((entry: unknown): boolean => isRecord(entry) && entry['id'] === attachment) : undefined;
  const socket: unknown = isRecord(found) ? found['socket'] : undefined;
  if (typeof socket !== 'string') throw new Error(`attachments.json has no attachment ${attachment}`);
  const sockets: unknown = rigEntry(rigs, rigId)['sockets'];
  const socketEntry: unknown = isRecord(sockets) ? sockets[socket] : undefined;
  const bone: unknown = isRecord(socketEntry) ? socketEntry['bone'] : undefined;
  if (typeof bone !== 'string') throw new Error(`${rigId} has no socket ${socket} for ${attachment}`);
  if (bone.endsWith('.L')) return 'L';
  if (bone.endsWith('.R')) return 'R';
  throw new Error(`${rigId}.${socket} is not on a hand`);
}

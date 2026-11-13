import jerkinOnMan from '../../data/covers/human_man/leather_jerkin.json' with { type: 'json' };
import undertunicOnMan from '../../data/covers/human_man/undertunic.json' with { type: 'json' };
import braiesOnMan from '../../data/covers/human_man/braies.json' with { type: 'json' };
import undertunicOnWoman from '../../data/covers/human_woman/undertunic_woman.json' with { type: 'json' };
import braiesOnWoman from '../../data/covers/human_woman/braies.json' with { type: 'json' };
import undertunicOnElder from '../../data/covers/human_elder/undertunic.json' with { type: 'json' };
import braiesOnElder from '../../data/covers/human_elder/braies.json' with { type: 'json' };
import braiesUnderTunic from '../../data/covers/wear/braies/wool_tunic.json' with { type: 'json' };
import braiesUnderJerkin from '../../data/covers/wear/braies/leather_jerkin.json' with { type: 'json' };
import braiesUnderRobe from '../../data/covers/wear/braies/monk_robe.json' with { type: 'json' };
import braiesUnderMail from '../../data/covers/wear/braies/mail_tunic.json' with { type: 'json' };

export interface BodyCover {
  readonly body: string;
  readonly mesh: string;
  readonly wearable: string;
  readonly triangles: number;
  readonly hidden: readonly (readonly [number, number])[];
}

export interface BodyGroup {
  readonly mask: number;
  readonly covers: readonly string[];
}

export interface CoverableWearable {
  readonly model: string;
  readonly hides: readonly string[];
}

const COVER_PREFIX: string = 'cover:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRange(value: unknown, where: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${where}: expected [first, last]`);
  const entries: readonly unknown[] = value;
  const first: unknown = entries[0];
  const last: unknown = entries[1];
  if (typeof first !== 'number' || typeof last !== 'number' || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) throw new Error(`${where}: expected two ascending triangle numbers`);
  return [first, last];
}

export function readCover(value: unknown, where: string): BodyCover {
  if (!isRecord(value)) throw new Error(`${where}: expected an object`);
  const { body, mesh, wearable, triangles, hidden } = value;
  if (typeof body !== 'string' || typeof mesh !== 'string' || typeof wearable !== 'string') throw new Error(`${where}: body, mesh and wearable must be text`);
  if (typeof triangles !== 'number' || !Number.isInteger(triangles) || triangles <= 0) throw new Error(`${where}: triangles must be a positive whole number`);
  if (!Array.isArray(hidden)) throw new Error(`${where}: hidden must be a list of ranges`);
  const ranges: (readonly [number, number])[] = hidden.map((entry: unknown, index: number): readonly [number, number] => readRange(entry, `${where}.hidden[${String(index)}]`));
  if (ranges.some(([, last]: readonly [number, number]): boolean => last >= triangles)) throw new Error(`${where}: a range runs past the body's ${String(triangles)} triangles`);
  return { body, mesh, wearable, triangles, hidden: ranges };
}

export const BODY_COVERS: readonly BodyCover[] = [
  readCover(jerkinOnMan, 'data/covers/human_man/leather_jerkin.json'),
  readCover(undertunicOnMan, 'data/covers/human_man/undertunic.json'),
  readCover(braiesOnMan, 'data/covers/human_man/braies.json'),
  readCover(undertunicOnWoman, 'data/covers/human_woman/undertunic_woman.json'),
  readCover(braiesOnWoman, 'data/covers/human_woman/braies.json'),
  readCover(undertunicOnElder, 'data/covers/human_elder/undertunic.json'),
  readCover(braiesOnElder, 'data/covers/human_elder/braies.json'),
  readCover(braiesUnderTunic, 'data/covers/wear/braies/wool_tunic.json'),
  readCover(braiesUnderJerkin, 'data/covers/wear/braies/leather_jerkin.json'),
  readCover(braiesUnderRobe, 'data/covers/wear/braies/monk_robe.json'),
  readCover(braiesUnderMail, 'data/covers/wear/braies/mail_tunic.json'),
];

export function coverKey(wearableModel: string): string {
  return `${COVER_PREFIX}${wearableModel}`;
}

export function coversOf(covers: readonly BodyCover[], body: string, mesh: string, triangles: number): BodyCover[] {
  return covers.filter((cover: BodyCover): boolean => cover.body === body && cover.mesh === mesh && cover.triangles === triangles);
}

export function coveringKeys(covers: readonly BodyCover[], triangles: number): string[][] {
  const keys: string[][] = Array.from({ length: triangles }, (): string[] => []);
  for (const cover of covers) {
    for (const [first, last] of cover.hidden) {
      for (let triangle: number = first; triangle <= last; triangle += 1) keys[triangle]?.push(coverKey(cover.wearable));
    }
  }
  return keys;
}

export function hiddenWithCovers(worn: readonly CoverableWearable[], hiddenParts: readonly string[], coveredModels: ReadonlySet<string>): string[] {
  const listed: readonly CoverableWearable[] = worn.filter((piece: CoverableWearable): boolean => coveredModels.has(piece.model));
  if (listed.length === 0) return [...hiddenParts];
  const unlisted: readonly CoverableWearable[] = worn.filter((piece: CoverableWearable): boolean => !coveredModels.has(piece.model));
  const listedParts: ReadonlySet<string> = new Set<string>(listed.flatMap((piece: CoverableWearable): readonly string[] => piece.hides));
  const keptParts: ReadonlySet<string> = new Set<string>(unlisted.flatMap((piece: CoverableWearable): readonly string[] => piece.hides));
  const parts: string[] = hiddenParts.filter((part: string): boolean => !listedParts.has(part) || keptParts.has(part));
  return [...parts, ...new Set<string>(listed.map((piece: CoverableWearable): string => coverKey(piece.model)))];
}

export function groupHidden(group: BodyGroup, hidden: readonly string[], maskIsHidden: (mask: number) => boolean): boolean {
  return maskIsHidden(group.mask) || group.covers.some((key: string): boolean => hidden.includes(key));
}

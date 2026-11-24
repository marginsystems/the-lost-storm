import type { Content, SkillTreeNodeDef } from '../../../sim/content/types.ts';
import { placeTint } from '../chart-model.ts';
import { SKILL_ART } from '../skill-art/index.ts';
import { artInstance } from '../skill-art/instance.ts';
import type { ArtCounter } from '../skill-art/instance.ts';
import { paint } from '../skill-art/kit.ts';
import type { Palette } from '../skill-art/kit.ts';
import { tintPalette } from './palette.ts';
import { TREE_DEFS } from './parts.ts';
import { SHAPES } from './shapes.ts';
import { STRIKES } from './strikes.ts';
import { VITALS } from './vitals.ts';
import type { Motif } from './vitals.ts';

const MOTIFS: ReadonlyMap<string, Motif> = new Map<string, Motif>([...VITALS, ...STRIKES, ...SHAPES]);

export const COMMON_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['common_life', 'life'],
  ['common_mana', 'mana'],
  ['common_both', 'vigour'],
  ['common_armour', 'armour'],
  ['common_shelter', 'frost_ward'],
  ['common_step', 'swift'],
]);

const painted: Map<string, string> = new Map<string, string>();

function motifOf(icon: string): Motif | undefined {
  return MOTIFS.get(COMMON_ART.get(icon) ?? icon);
}

export function hasTreeArt(icon: string): boolean {
  return motifOf(icon) !== undefined;
}

export function treeArtIds(): readonly string[] {
  return [...MOTIFS.keys()];
}

export function treeArtSvg(icon: string, tint: string): string | null {
  const motif: Motif | undefined = motifOf(icon);
  if (motif === undefined) return null;
  const palette: Palette = tintPalette(tint);
  return paint(palette, `${TREE_DEFS}${motif(palette)}`);
}

function asImage(key: string, svg: () => string | null): string | null {
  const known: string | undefined = painted.get(key);
  if (known !== undefined) return known;
  const drawn: string | null = svg();
  if (drawn === null) return null;
  const url: string = `url("data:image/svg+xml,${encodeURIComponent(drawn)}")`;
  painted.set(key, url);
  return url;
}

const SPLIT: string = '<path d="M64 0L0 64" stroke="#05070c" stroke-width="2.4"/><path d="M64 0L0 64" stroke="#ffffff" stroke-opacity="0.3" stroke-width="0.7"/>';

export function splitArt(first: string, second: string): string {
  const counter: ArtCounter = { next: 0 };
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="splitA"><path d="M0 0H64L0 64Z"/></clipPath><clipPath id="splitB"><path d="M64 0V64H0Z"/></clipPath></defs><g clip-path="url(#splitA)">${artInstance(first, counter)}</g><g clip-path="url(#splitB)">${artInstance(second, counter)}</g>${SPLIT}</svg>`;
}

function skillImage(skills: readonly string[]): string | null {
  const first: string | undefined = skills[0] === undefined ? undefined : SKILL_ART.get(skills[0]);
  if (first === undefined) return null;
  const second: string | undefined = skills[1] === undefined ? undefined : SKILL_ART.get(skills[1]);
  return asImage(`skill:${skills.join('+')}`, (): string => (second === undefined ? first : splitArt(first, second)));
}

export function placeSkills(content: Content, node: SkillTreeNodeDef): readonly string[] {
  const given: readonly string[] = node.unlock === null ? node.variants.map((variant): string => variant.becomes) : [node.unlock];
  return given.flatMap((skill: string): string[] => {
    const icon: string | undefined = content.skills.get(skill)?.icon;
    return icon === undefined ? [] : [icon];
  });
}

export function placeArt(content: Content, node: SkillTreeNodeDef): string | null {
  const skill: string | null = skillImage(placeSkills(content, node));
  if (skill !== null) return skill;
  const tint: string = placeTint(content, node);
  return asImage(`${node.icon}@${tint}`, (): string | null => treeArtSvg(node.icon, tint));
}

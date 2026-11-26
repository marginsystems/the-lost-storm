import type { Content, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import type { ChartPoint } from './chart-model.ts';
import { placeTint } from './chart-model.ts';
import { el } from './dom.ts';
import { placeArt } from './tree-art/index.ts';
import { familyMark, placeFamily } from './weapon-family.ts';
import { artSource, bakeArt, cssImage } from './tree-art/bake.ts';
import type { BakedArt } from './tree-art/bake.ts';

interface ArtGroup {
  readonly colour: HTMLElement[];
  readonly grey: HTMLElement[];
}

export interface TreeIcons {
  add(button: HTMLElement, art: string): void;
  bake(): void;
}

function showBaked(group: ArtGroup, baked: BakedArt | null): void {
  if (baked === null) return;
  for (const glyph of group.colour) glyph.style.backgroundImage = cssImage(baked.colour);
  for (const grey of group.grey) {
    grey.style.backgroundImage = cssImage(baked.grey);
    grey.classList.remove('raw');
  }
}

export function createTreeIcons(): TreeIcons {
  const groups: Map<string, ArtGroup> = new Map<string, ArtGroup>();
  let baking: Promise<void> | null = null;
  return {
    add(button: HTMLElement, art: string): void {
      const grey: HTMLSpanElement = el('span', 'tree-socket-grey raw', button);
      const glyph: HTMLSpanElement = el('span', 'tree-socket-glyph', button);
      grey.style.backgroundImage = art;
      glyph.style.backgroundImage = art;
      const group: ArtGroup | undefined = groups.get(art);
      if (group === undefined) groups.set(art, { colour: [glyph], grey: [grey] });
      else {
        group.colour.push(glyph);
        group.grey.push(grey);
      }
    },
    bake(): void {
      baking ??= [...groups].reduce(async (before: Promise<void>, [art, group]: [string, ArtGroup]): Promise<void> => {
        await before;
        const source: string | null = artSource(art);
        showBaked(group, source === null ? null : await bakeArt(source));
      }, Promise.resolve());
    },
  };
}

export function createSocket(board: HTMLElement, content: Content, node: SkillTreeNodeDef, centre: ChartPoint, icons: TreeIcons): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', `tree-socket ${node.kind} locked`, board);
  button.type = 'button';
  button.setAttribute('aria-label', node.name);
  button.style.left = `${centre.x}px`;
  button.style.top = `${centre.y}px`;
  button.style.setProperty('--tint', placeTint(content, node));
  if (node.common !== null) button.classList.add('common');
  if (node.specialty !== null) button.classList.add('specialty');
  if (node.variants.length > 0) button.classList.add('variant');
  if (node.unlock !== null) button.classList.add('ability');
  el('span', 'tree-socket-rim', button);
  el('span', 'tree-socket-well', button);
  el('span', 'tree-socket-fill', button);
  icons.add(button, placeArt(content, node) ?? 'none');
  const family: WeaponGroup | null = placeFamily(content, node);
  if (family !== null) familyMark(family, 'tree-socket-family', button);
  return button;
}

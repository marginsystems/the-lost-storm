import type { DitherLayer } from './layer.ts';
import { mountDither } from './layer.ts';
import { BACKDROPS, edgeFor } from './backdrops.ts';

const MOUNT = {
  sharp: 2,
  soft: 1,
  goneClass: 'gone',
  voidKind: 'void',
  zoneKindAttribute: 'data-zone-kind',
} as const;

function keepWhileShown(title: HTMLElement, backdrop: DitherLayer): void {
  title.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.target === title && event.propertyName === 'opacity' && title.classList.contains(MOUNT.goneClass)) backdrop.release();
  });
  new MutationObserver((): void => {
    if (!title.classList.contains(MOUNT.goneClass)) backdrop.paint();
  }).observe(title, { attributes: true, attributeFilter: ['class'] });
}

export function mountBackdrops(): void {
  const title: HTMLElement | null = document.getElementById('title');
  if (title !== null) keepWhileShown(title, mountDither(title, { className: 'title-backdrop', layers: BACKDROPS.title, eager: true, marksHost: true, maxRatio: MOUNT.sharp }));
  const fade: HTMLElement | null = document.getElementById('fade');
  if (fade !== null) mountDither(fade, { className: 'veil-mist', layers: BACKDROPS.veilMist, eager: true, marksHost: true, maxRatio: MOUNT.soft });
  const vignette: HTMLElement | null = document.getElementById('vignette');
  if (vignette === null) return;
  const edge: DitherLayer = mountDither(vignette, { className: 'vignette-edge', layers: edgeFor(document.body.dataset['zoneKind']), eager: true, marksHost: true, maxRatio: MOUNT.soft });
  const lit: DitherLayer = mountDither(vignette, { className: 'vignette-lit', layers: BACKDROPS.voidLit, eager: false, marksHost: false, maxRatio: MOUNT.soft });
  const wake: DitherLayer = mountDither(vignette, { className: 'vignette-wake', layers: BACKDROPS.wakeSoft, eager: false, marksHost: false, maxRatio: MOUNT.soft });
  mountDither(vignette, { className: 'vignette-hurt', layers: BACKDROPS.hurt, eager: true, marksHost: false, maxRatio: MOUNT.soft });
  let kind: string | undefined = document.body.dataset['zoneKind'];
  new MutationObserver((): void => {
    const next: string | undefined = document.body.dataset['zoneKind'];
    if (next === kind) return;
    kind = next;
    edge.show(edgeFor(next));
    if (next !== MOUNT.voidKind) return;
    lit.paint();
    wake.paint();
  }).observe(document.body, { attributes: true, attributeFilter: [MOUNT.zoneKindAttribute] });
  if (kind !== MOUNT.voidKind) return;
  lit.paint();
  wake.paint();
}

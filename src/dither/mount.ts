import type { DitherLayer } from './layer.ts';
import { mountDither } from './layer.ts';
import { mountDitherImage } from './image.ts';
import { BACKDROPS } from './backdrops.ts';

const MOUNT = {
  painted: 'dithered',
  litPainted: 'dithered-lit',
  hurtPainted: 'dithered-hurt',
  voidPainted: 'dithered-void',
  sharp: 2,
  soft: 1,
  goneClass: 'gone',
  voidKind: 'void',
  zoneKindAttribute: 'data-zone-kind',
  bloomPseudo: '::after',
  bloomProperty: '--threshold-bloom',
  bloomPainted: 'bloomed',
} as const;

function keepWhileShown(title: HTMLElement, backdrop: DitherLayer): void {
  title.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.target === title && event.propertyName === 'opacity' && title.classList.contains(MOUNT.goneClass)) backdrop.release();
  });
  new MutationObserver((): void => {
    if (!title.classList.contains(MOUNT.goneClass)) backdrop.paint();
  }).observe(title, { attributes: true, attributeFilter: ['class'] });
}

export function mountThresholdBloom(button: HTMLElement): void {
  mountDitherImage(button, { pseudo: MOUNT.bloomPseudo, property: MOUNT.bloomProperty, marks: MOUNT.bloomPainted, layers: BACKDROPS.thresholdBloom, maxRatio: MOUNT.sharp });
}

export function mountBackdrops(): void {
  const title: HTMLElement | null = document.getElementById('title');
  if (title !== null) keepWhileShown(title, mountDither(title, { className: 'title-backdrop', layers: BACKDROPS.title, eager: true, marks: MOUNT.painted, maxRatio: MOUNT.sharp }));
  const enter: HTMLElement | null = document.getElementById('title-enter');
  if (enter !== null) mountThresholdBloom(enter);
  const fade: HTMLElement | null = document.getElementById('fade');
  if (fade !== null) mountDither(fade, { className: 'veil-mist', layers: BACKDROPS.veilMist, eager: true, marks: MOUNT.painted, maxRatio: MOUNT.soft });
  const vignette: HTMLElement | null = document.getElementById('vignette');
  if (vignette === null) return;
  mountDither(vignette, { className: 'vignette-edge', layers: BACKDROPS.edge, eager: true, marks: MOUNT.painted, maxRatio: MOUNT.soft });
  const voidEdge: DitherLayer = mountDither(vignette, { className: 'vignette-void-edge', layers: BACKDROPS.voidEdge, eager: false, marks: MOUNT.voidPainted, maxRatio: MOUNT.soft });
  const lit: DitherLayer = mountDither(vignette, { className: 'vignette-lit', layers: BACKDROPS.voidLit, eager: false, marks: MOUNT.litPainted, maxRatio: MOUNT.soft });
  const wake: DitherLayer = mountDither(vignette, { className: 'vignette-wake', layers: BACKDROPS.wakeSoft, eager: false, marks: null, maxRatio: MOUNT.soft });
  mountDither(vignette, { className: 'vignette-hurt', layers: BACKDROPS.hurt, eager: true, marks: MOUNT.hurtPainted, maxRatio: MOUNT.soft });
  let kind: string | undefined = document.body.dataset['zoneKind'];
  new MutationObserver((): void => {
    const next: string | undefined = document.body.dataset['zoneKind'];
    if (next === kind) return;
    kind = next;
    if (next !== MOUNT.voidKind) return;
    voidEdge.paint();
    lit.paint();
    wake.paint();
  }).observe(document.body, { attributes: true, attributeFilter: [MOUNT.zoneKindAttribute] });
  if (kind !== MOUNT.voidKind) return;
  voidEdge.paint();
  lit.paint();
  wake.paint();
}

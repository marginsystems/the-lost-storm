import type { Object3D } from 'three';
import { Light, SpotLight } from 'three';

function kindOf(light: Light): string {
  const shadow: string = light.castShadow ? '+shadow' : '';
  const mapped: string = light instanceof SpotLight && light.map !== null ? '+map' : '';
  return `${light.type}${shadow}${mapped}`;
}

export function lightCensus(scene: Object3D): string {
  const counts: Map<string, number> = new Map<string, number>();
  scene.traverseVisible((object: Object3D): void => {
    if (!(object instanceof Light)) return;
    const kind: string = kindOf(object);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });
  return [...counts.keys()]
    .toSorted()
    .map((kind: string): string => `${kind}:${counts.get(kind) ?? 0}`)
    .join(',');
}

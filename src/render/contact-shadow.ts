import { CircleGeometry, Color, DataTexture, LinearFilter, Mesh, MeshBasicMaterial, RGBAFormat } from 'three';

export const CONTACT_SHADOW = {
  radius: 0.62,
  opacity: 0.62,
  lift: 0.025,
  segments: 20,
  textureSize: 32,
  falloff: 1.6,
  offset: -1,
} as const;

export function contactAlpha(distance: number): number {
  const edge: number = Math.min(1, Math.max(0, distance));
  return Math.pow(1 - edge * edge, CONTACT_SHADOW.falloff);
}

function radialTexture(): DataTexture {
  const size: number = CONTACT_SHADOW.textureSize;
  const data: Uint8Array = new Uint8Array(size * size * 4);
  for (let y: number = 0; y < size; y += 1) {
    for (let x: number = 0; x < size; x += 1) {
      const dx: number = ((x + 0.5) / size) * 2 - 1;
      const dy: number = ((y + 0.5) / size) * 2 - 1;
      const value: number = Math.round(contactAlpha(Math.hypot(dx, dy)) * 255);
      const at: number = (y * size + x) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  const texture: DataTexture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const CONTACT_SHADOW_NAME: string = 'contact-shadow';

let shared: { readonly geometry: CircleGeometry; readonly material: MeshBasicMaterial } | null = null;

export function contactShadow(): Mesh {
  if (shared === null) {
    const geometry: CircleGeometry = new CircleGeometry(CONTACT_SHADOW.radius, CONTACT_SHADOW.segments);
    geometry.rotateX(-Math.PI / 2);
    const material: MeshBasicMaterial = new MeshBasicMaterial({ color: new Color(0x000000), alphaMap: radialTexture(), transparent: true, opacity: CONTACT_SHADOW.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: CONTACT_SHADOW.offset, polygonOffsetUnits: CONTACT_SHADOW.offset });
    shared = { geometry, material };
  }
  const mesh: Mesh = new Mesh(shared.geometry, shared.material);
  mesh.position.y = CONTACT_SHADOW.lift;
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = CONTACT_SHADOW_NAME;
  return mesh;
}

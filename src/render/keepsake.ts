import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';

export const KEEPSAKE = {
  cover: 0x4b3a2b,
  pages: 0xd9d0bc,
  width: 0.46,
  depth: 0.34,
  thickness: 0.09,
  pageInset: 0.03,
  yaw: 0.5,
} as const;

export interface Keepsake {
  readonly group: Group;
  dispose(): void;
}

export function createKeepsake(): Keepsake {
  const group: Group = new Group();
  const coverGeometry: BoxGeometry = new BoxGeometry(KEEPSAKE.width, KEEPSAKE.thickness, KEEPSAKE.depth);
  const coverMaterial: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(KEEPSAKE.cover), roughness: 0.85 });
  const cover: Mesh = new Mesh(coverGeometry, coverMaterial);
  cover.position.y = KEEPSAKE.thickness / 2;
  cover.castShadow = true;
  const pageGeometry: BoxGeometry = new BoxGeometry(KEEPSAKE.width - KEEPSAKE.pageInset, KEEPSAKE.thickness * 0.7, KEEPSAKE.depth - KEEPSAKE.pageInset * 2);
  const pageMaterial: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(KEEPSAKE.pages), roughness: 0.95 });
  const pages: Mesh = new Mesh(pageGeometry, pageMaterial);
  pages.position.set(KEEPSAKE.pageInset, KEEPSAKE.thickness / 2, 0);
  const book: Group = new Group();
  book.add(cover, pages);
  book.rotation.y = KEEPSAKE.yaw;
  group.add(book);
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const geometry of [coverGeometry, pageGeometry]) geometry.dispose();
      for (const material of [coverMaterial, pageMaterial]) material.dispose();
    },
  };
}

import type { BufferGeometry } from 'three';
import { AdditiveBlending, BoxGeometry, CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KEEPSAKE = {
  cover: 0x4b3a2b,
  pages: 0xd9d0bc,
  width: 0.46,
  depth: 0.34,
  thickness: 0.09,
  pageInset: 0.03,
  yaw: 0.5,
  beamColor: 0xf6efe0,
  beamWidth: 0.42,
  beamHeight: 9,
  beamOpacity: 0.28,
  haloRadius: 1.1,
  haloOpacity: 0.22,
  renderOrder: 8,
} as const;

export interface Keepsake {
  readonly group: Group;
  dispose(): void;
}

function beamGeometry(): BufferGeometry {
  const planes: BufferGeometry[] = [0, Math.PI / 2].map((yaw: number): BufferGeometry => {
    const plane: PlaneGeometry = new PlaneGeometry(KEEPSAKE.beamWidth, KEEPSAKE.beamHeight);
    plane.rotateY(yaw);
    plane.translate(0, KEEPSAKE.beamHeight / 2, 0);
    return plane;
  });
  return mergeGeometries(planes);
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
  const beam: BufferGeometry = beamGeometry();
  const glowMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: new Color(KEEPSAKE.beamColor), transparent: true, opacity: KEEPSAKE.beamOpacity, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  const beamMesh: Mesh = new Mesh(beam, glowMaterial);
  beamMesh.renderOrder = KEEPSAKE.renderOrder;
  const haloGeometry: CircleGeometry = new CircleGeometry(KEEPSAKE.haloRadius, 28);
  haloGeometry.rotateX(-Math.PI / 2);
  const haloMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: new Color(KEEPSAKE.beamColor), transparent: true, opacity: KEEPSAKE.haloOpacity, depthWrite: false, blending: AdditiveBlending });
  const halo: Mesh = new Mesh(haloGeometry, haloMaterial);
  halo.position.y = 0.01;
  halo.renderOrder = KEEPSAKE.renderOrder;
  group.add(book, beamMesh, halo);
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const geometry of [coverGeometry, pageGeometry, beam, haloGeometry]) geometry.dispose();
      for (const material of [coverMaterial, pageMaterial, glowMaterial, haloMaterial]) material.dispose();
    },
  };
}

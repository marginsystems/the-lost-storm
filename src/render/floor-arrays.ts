import type { Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import { LinearFilter, LinearMipmapLinearFilter, Mesh, NoColorSpace, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, UnsignedByteType, WebGLArrayRenderTarget } from 'three';

export const FLOOR_ARRAYS = {
  size: 1024,
  smallSize: 512,
  anisotropy: 8,
} as const;

export interface FloorSource {
  readonly colour: Texture;
  readonly normal: Texture | null;
  readonly orm: Texture | null;
}

export interface FloorArrays {
  readonly colour: Texture;
  readonly detail: Texture;
  dispose(): void;
}

const VERTEX: string = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4( position.xy, 0.0, 1.0 );\n}';

const COLOUR: string = 'uniform sampler2D source;\nvarying vec2 vUv;\nvoid main() {\n  gl_FragColor = vec4( texture2D( source, vUv ).rgb, 1.0 );\n}';

const DETAIL: string = [
  'uniform sampler2D normalSource;',
  'uniform sampler2D ormSource;',
  'uniform float hasNormal;',
  'uniform float hasOrm;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec2 tilt = hasNormal > 0.5 ? texture2D( normalSource, vUv ).rg : vec2( 0.5 );',
  '  float occlusion = hasOrm > 0.5 ? texture2D( ormSource, vUv ).r : 1.0;',
  '  gl_FragColor = vec4( tilt, occlusion, 1.0 );',
  '}',
].join('\n');

function setUniform(material: ShaderMaterial, name: string, value: unknown): void {
  const held: unknown = material.uniforms[name];
  if (held !== undefined && held !== null && typeof held === 'object') Reflect.set(held, 'value', value);
}

export function floorArraySize(halfTextures: boolean, maxTextureSize: number): number {
  return Math.min(halfTextures ? FLOOR_ARRAYS.smallSize : FLOOR_ARRAYS.size, maxTextureSize);
}

function arrayTarget(size: number, depth: number, colour: boolean): WebGLArrayRenderTarget {
  const target: WebGLArrayRenderTarget = new WebGLArrayRenderTarget(size, size, depth, { type: UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, colorSpace: colour ? SRGBColorSpace : NoColorSpace });
  target.texture.wrapS = RepeatWrapping;
  target.texture.wrapT = RepeatWrapping;
  target.texture.anisotropy = FLOOR_ARRAYS.anisotropy;
  return target;
}

export function bakeFloorArrays(renderer: WebGLRenderer, sources: readonly FloorSource[], size: number): FloorArrays {
  const depth: number = Math.max(1, sources.length);
  const colour: WebGLArrayRenderTarget = arrayTarget(size, depth, true);
  const detail: WebGLArrayRenderTarget = arrayTarget(size, depth, false);
  const plane: PlaneGeometry = new PlaneGeometry(2, 2);
  const copyColour: ShaderMaterial = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: COLOUR, uniforms: { source: { value: null } }, depthTest: false, depthWrite: false });
  const copyDetail: ShaderMaterial = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: DETAIL, uniforms: { normalSource: { value: null }, ormSource: { value: null }, hasNormal: { value: 0 }, hasOrm: { value: 0 } }, depthTest: false, depthWrite: false });
  const quad: Mesh = new Mesh(plane, copyColour);
  quad.frustumCulled = false;
  const scene: Scene = new Scene();
  scene.add(quad);
  const camera: OrthographicCamera = new OrthographicCamera();
  const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
  const draw = (target: WebGLArrayRenderTarget, layer: number): void => {
    renderer.setRenderTarget(target, layer);
    renderer.render(scene, camera);
  };
  try {
    sources.forEach((source: FloorSource, layer: number): void => {
      quad.material = copyColour;
      setUniform(copyColour, 'source', source.colour);
      draw(colour, layer);
      quad.material = copyDetail;
      setUniform(copyDetail, 'normalSource', source.normal);
      setUniform(copyDetail, 'ormSource', source.orm);
      setUniform(copyDetail, 'hasNormal', source.normal === null ? 0 : 1);
      setUniform(copyDetail, 'hasOrm', source.orm === null ? 0 : 1);
      draw(detail, layer);
    });
  } catch (error: unknown) {
    colour.dispose();
    detail.dispose();
    throw error;
  } finally {
    renderer.setRenderTarget(previous);
    plane.dispose();
    copyColour.dispose();
    copyDetail.dispose();
  }
  return {
    colour: colour.texture,
    detail: detail.texture,
    dispose(): void {
      colour.dispose();
      detail.dispose();
    },
  };
}

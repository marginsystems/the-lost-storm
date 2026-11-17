import type { IUniform, Material, PerspectiveCamera, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import type { Object3D } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { PassThrough } from './terrain-lift.ts';
import type { Point3, TerrainSight } from './terrain-sight.ts';
import { meshBlocks, prepareTrees } from './triangle-tree.ts';
import type { Intersection } from 'three';
import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Sphere, Vector2, Vector3 } from 'three';

export const CUTAWAY = {
  radius: 0.115,
  widest: 0.5,
  company: 4,
  body: 0.06,
  core: 0.8,
  narrow: 1.2,
  deepest: 1,
  ghost: 0.2,
  waist: 0.95,
  waistFeather: 0.45,
  feather: 0.3,
  margin: 0.6,
  depthFeather: 1.2,
  heroHeight: 1,
  far: -1e5,
  tallFrom: 1.5,
  feet: 0,
  chest: 1.3,
  head: 1.75,
  stiffness: 90,
  damping: 18,
  rest: 0.002,
  longestStep: 1 / 30,
  open: 0.45,
  band: 0.06,
  noiseDepth: 0.2,
  noiseScale: 2.4,
  outline: 0.35,
  lineShift: 3.7,
  soft: 0.3,
  edgeShade: 0.55,
  ghostCap: 0.22,
  ghostShade: 0.8,
  cleared: 0.6,
  sightSlack: 0.01,
} as const;

export interface CutawayUniforms {
  readonly uCutCentre: IUniform<Vector2>;
  readonly uCutRadius: IUniform<number>;
  readonly uCutDepth: IUniform<number>;
  readonly uCutLevel: IUniform<number>;
  readonly uCutWorld: IUniform<Matrix4>;
  readonly uCutFloor: IUniform<number>;
}

export const CUTAWAY_UNIFORMS: CutawayUniforms = {
  uCutCentre: { value: new Vector2(CUTAWAY.far, CUTAWAY.far) },
  uCutRadius: { value: 1 },
  uCutDepth: { value: 0 },
  uCutLevel: { value: 0 },
  uCutWorld: { value: new Matrix4() },
  uCutFloor: { value: 0 },
};

export interface CutSpring {
  readonly level: number;
  readonly velocity: number;
}

const probe: Raycaster = new Raycaster();
const probeFrom: Vector3 = new Vector3();
const probeTo: Vector3 = new Vector3();

function shown(object: Object3D): boolean {
  for (let node: Object3D | null = object; node !== null; node = node.parent) if (!node.visible) return false;
  return true;
}

export interface CutHero {
  readonly x: number;
  readonly z: number;
  readonly floor: number;
}

const BODY_LIFTS: readonly number[] = [CUTAWAY.chest, CUTAWAY.head];
const SIGHT_LIFTS: readonly number[] = [CUTAWAY.feet, CUTAWAY.chest, CUTAWAY.head];
const hits: Intersection[] = [];
const single: Mesh = new Mesh();
const unionSphere: Sphere = new Sphere();
const instanceSphere: Sphere = new Sphere();
const instanceLocal: Matrix4 = new Matrix4();
const instanceWorld: Matrix4 = new Matrix4();

interface InstanceSpheres {
  readonly world: Matrix4;
  readonly source: Sphere;
  version: number;
  count: number;
  spheres: Float64Array;
}

const instanceSpheres: WeakMap<InstancedMesh, InstanceSpheres> = new WeakMap<InstancedMesh, InstanceSpheres>();

function current(cached: InstanceSpheres, mesh: InstancedMesh, source: Sphere): boolean {
  return cached.version === mesh.instanceMatrix.version && cached.count === mesh.count && cached.world.equals(mesh.matrixWorld) && cached.source.equals(source);
}

function spheresOf(mesh: InstancedMesh, source: Sphere): Float64Array {
  const cached: InstanceSpheres | undefined = instanceSpheres.get(mesh);
  if (cached !== undefined && current(cached, mesh, source)) return cached.spheres;
  const spheres: Float64Array = new Float64Array(mesh.count * 4);
  for (let index: number = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, instanceLocal);
    instanceWorld.multiplyMatrices(mesh.matrixWorld, instanceLocal);
    instanceSphere.copy(source).applyMatrix4(instanceWorld);
    spheres[index * 4] = instanceSphere.center.x;
    spheres[index * 4 + 1] = instanceSphere.center.y;
    spheres[index * 4 + 2] = instanceSphere.center.z;
    spheres[index * 4 + 3] = instanceSphere.radius;
  }
  instanceSpheres.set(mesh, { world: mesh.matrixWorld.clone(), source: source.clone(), version: mesh.instanceMatrix.version, count: mesh.count, spheres });
  return spheres;
}

function segmentMisses(spheres: Float64Array, index: number): boolean {
  const origin: Vector3 = probe.ray.origin;
  const direction: Vector3 = probe.ray.direction;
  const dx: number = (spheres[index * 4] ?? 0) - origin.x;
  const dy: number = (spheres[index * 4 + 1] ?? 0) - origin.y;
  const dz: number = (spheres[index * 4 + 2] ?? 0) - origin.z;
  const along: number = Math.min(probe.far, Math.max(0, dx * direction.x + dy * direction.y + dz * direction.z));
  const ox: number = dx - direction.x * along;
  const oy: number = dy - direction.y * along;
  const oz: number = dz - direction.z * along;
  const reach: number = (spheres[index * 4 + 3] ?? Infinity) + CUTAWAY.sightSlack;
  return ox * ox + oy * oy + oz * oz > reach * reach;
}

function instanceBlocks(mesh: InstancedMesh): boolean {
  if (!mesh.layers.test(probe.layers)) return false;
  if (mesh.boundingSphere === null) mesh.computeBoundingSphere();
  const bounds: Sphere | null = mesh.boundingSphere;
  if (bounds === null || !probe.ray.intersectsSphere(unionSphere.copy(bounds).applyMatrix4(mesh.matrixWorld))) return false;
  if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
  const source: Sphere | null = mesh.geometry.boundingSphere;
  if (source === null) return false;
  const spheres: Float64Array = spheresOf(mesh, source);
  single.geometry = mesh.geometry;
  single.material = mesh.material;
  for (let index: number = 0; index < mesh.count; index += 1) {
    if (segmentMisses(spheres, index)) continue;
    mesh.getMatrixAt(index, instanceLocal);
    single.matrixWorld.multiplyMatrices(mesh.matrixWorld, instanceLocal);
    if (meshBlocks(single, probe, hits)) return true;
  }
  return false;
}

function isInstanced(object: Object3D): object is InstancedMesh {
  return object instanceof InstancedMesh;
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function blocksProbe(object: Object3D): boolean {
  hits.length = 0;
  if (isInstanced(object)) return instanceBlocks(object);
  if (isMesh(object)) return object.layers.test(probe.layers) && meshBlocks(object, probe, hits);
  probe.intersectObject(object, false, hits);
  return hits.length > 0;
}

function behindSeen(hero: CutHero, eye: Vector3, seen: readonly Object3D[]): boolean {
  if (seen.length === 0) return false;
  for (const lift of BODY_LIFTS) {
    probeFrom.set(hero.x, hero.floor + lift, hero.z);
    probeTo.copy(eye).sub(probeFrom);
    const far: number = probeTo.length();
    if (far <= 0) continue;
    probe.set(probeFrom, probeTo.divideScalar(far));
    probe.far = far;
    for (const object of seen) if (blocksProbe(object)) return true;
  }
  return false;
}

export function heroBehind(hero: CutHero, eye: Vector3, list: readonly Object3D[]): boolean {
  return behindSeen(hero, eye, list.filter(shown));
}

export function springCut(state: CutSpring, target: number, dt: number): CutSpring {
  const step: number = Math.min(Math.max(0, dt), CUTAWAY.longestStep);
  const velocity: number = state.velocity + ((target - state.level) * CUTAWAY.stiffness - state.velocity * CUTAWAY.damping) * step;
  const level: number = Math.min(1, Math.max(0, state.level + velocity * step));
  if (target === 0 && level < CUTAWAY.rest) return { level: 0, velocity: 0 };
  return { level, velocity };
}

export function cutawayPreamble(): string {
  return [
    'uniform vec2 uCutCentre;',
    'uniform float uCutRadius;',
    'uniform float uCutDepth;',
    'uniform float uCutLevel;',
    'uniform mat4 uCutWorld;',
    'uniform float uCutFloor;',
    'uniform float uCutKeep;',
    'float cutValueHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
    'float cutValueNoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( cutValueHash( i ), cutValueHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cutValueHash( i + vec2( 0.0, 1.0 ) ), cutValueHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }',
    'float cutOutline( vec2 p ) { return cutValueNoise( p ) * 0.6 + cutValueNoise( p * 2.3 + 7.1 ) * 0.4; }',
  ].join('\n');
}

export function cutawayChunk(): string {
  return [
    `vec2 cutSpot = ( gl_FragCoord.xy - uCutCentre ) / uCutRadius * ${CUTAWAY.noiseScale.toFixed(3)};`,
    `float cutRing = 1.0 - smoothstep( uCutRadius * ${(1 - CUTAWAY.feather).toFixed(3)}, uCutRadius, length( ( gl_FragCoord.xy - uCutCentre ) * vec2( ${CUTAWAY.narrow.toFixed(3)}, 1.0 ) ) * ( 1.0 + ( cutOutline( cutSpot ) - 0.5 ) * ${CUTAWAY.outline.toFixed(3)} ) );`,
    `float cutFront = 1.0 - smoothstep( uCutDepth - ${(CUTAWAY.margin + CUTAWAY.depthFeather).toFixed(3)}, uCutDepth - ${CUTAWAY.margin.toFixed(3)}, vViewPosition.z );`,
    `float cutHigh = smoothstep( ${CUTAWAY.waist.toFixed(3)}, ${(CUTAWAY.waist + CUTAWAY.waistFeather).toFixed(3)}, ( uCutWorld * vec4( -vViewPosition, 1.0 ) ).y - uCutFloor );`,
    `float cutLine = ${CUTAWAY.open.toFixed(3)} + ( cutOutline( cutSpot + ${CUTAWAY.lineShift.toFixed(3)} ) - 0.5 ) * ${CUTAWAY.noiseDepth.toFixed(3)};`,
    'uvec2 cutPixel = uvec2( gl_FragCoord.xy ) & 3u;',
    'uint cutCross = cutPixel.x ^ cutPixel.y;',
    'uint cutOrder = ( ( cutCross & 1u ) << 3u ) | ( ( cutPixel.y & 1u ) << 2u ) | ( cutCross & 2u ) | ( ( cutPixel.y & 2u ) >> 1u );',
    `float cutWeight = cutRing * cutFront * cutHigh * uCutLevel * ( ${CUTAWAY.deepest.toFixed(3)} - uCutKeep );`,
    `if ( clamp( ( cutWeight - cutLine ) / ${CUTAWAY.band.toFixed(3)} + 0.5, 0.0, 1.0 ) > ( float( cutOrder ) + 0.5 ) / 16.0 ) discard;`,
    `gl_FragColor.rgb *= 1.0 - ${CUTAWAY.edgeShade.toFixed(3)} * smoothstep( cutLine - ${CUTAWAY.soft.toFixed(3)}, cutLine, cutWeight );`,
    `gl_FragColor.rgb = mix( gl_FragColor.rgb, min( gl_FragColor.rgb, vec3( ${CUTAWAY.ghostCap.toFixed(3)} ) ) * ${CUTAWAY.ghostShade.toFixed(3)}, cutWeight * step( 0.0001, uCutKeep ) );`,
  ].join('\n');
}

const patched: WeakSet<Material> = new WeakSet<Material>();

export function patchCutawayShader(shader: Pick<WebGLProgramParametersWithUniforms, 'fragmentShader' | 'uniforms'>, keep: IUniform<number> = { value: 0 }): void {
  shader.uniforms['uCutKeep'] = keep;
  shader.uniforms['uCutCentre'] = CUTAWAY_UNIFORMS.uCutCentre;
  shader.uniforms['uCutRadius'] = CUTAWAY_UNIFORMS.uCutRadius;
  shader.uniforms['uCutDepth'] = CUTAWAY_UNIFORMS.uCutDepth;
  shader.uniforms['uCutLevel'] = CUTAWAY_UNIFORMS.uCutLevel;
  shader.uniforms['uCutWorld'] = CUTAWAY_UNIFORMS.uCutWorld;
  shader.uniforms['uCutFloor'] = CUTAWAY_UNIFORMS.uCutFloor;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${cutawayPreamble()}\nvoid main() {`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${cutawayChunk()}`);
}

interface Ghost {
  readonly keep: IUniform<number>;
  readonly width: number;
}

let ghosts: Ghost[] = [];

export function ghostKeep(propWidth: number, windowWidth: number): number {
  return propWidth < windowWidth ? CUTAWAY.ghost : 0;
}

export function windowMetres(camera: PerspectiveCamera, depth: number, radius: number = CUTAWAY.radius): number {
  return (2 * radius * depth * Math.tan((camera.fov * Math.PI) / 360) * 2) / CUTAWAY.narrow;
}

export function withCutaway(material: Material, width: number = Infinity): Material {
  if (!(material instanceof MeshStandardMaterial) || patched.has(material)) return material;
  patched.add(material);
  const keep: IUniform<number> = { value: 0 };
  ghosts.push({ keep, width });
  const before: MeshStandardMaterial['onBeforeCompile'] = material.onBeforeCompile.bind(material);
  const key: string = material.customProgramCacheKey();
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    before(shader, renderer);
    patchCutawayShader(shader, keep);
  };
  material.customProgramCacheKey = (): string => `${key}|cutaway`;
  return material;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function frontWeight(heroDepth: number, depth: number): number {
  return 1 - smoothstep(heroDepth - CUTAWAY.margin - CUTAWAY.depthFeather, heroDepth - CUTAWAY.margin, depth);
}

export function highWeight(aboveFloor: number): number {
  return smoothstep(CUTAWAY.waist, CUTAWAY.waist + CUTAWAY.waistFeather, aboveFloor);
}

export function ringWeight(across: number, up: number, radius: number = CUTAWAY.radius): number {
  return 1 - smoothstep(radius * (1 - CUTAWAY.feather), radius, Math.hypot(across * CUTAWAY.narrow, up) * (1 + CUTAWAY.outline / 2));
}

export function radiusFor(across: number, up: number): number {
  return Math.min(CUTAWAY.widest, Math.max(CUTAWAY.radius, ((Math.hypot(across * CUTAWAY.narrow, up) + CUTAWAY.body) * (1 + CUTAWAY.outline / 2)) / CUTAWAY.core));
}

export interface CutOther {
  readonly pos: Vec2;
  readonly alive: boolean;
}

export function cutawayCompany(hero: CutHero, others: readonly CutOther[], floorAt: (x: number, z: number) => number): CutHero[] {
  return others
    .filter((other: CutOther): boolean => other.alive && Math.hypot(other.pos.x - hero.x, other.pos.z - hero.z) <= CUTAWAY.company)
    .map((other: CutOther): CutHero => ({ x: other.pos.x, z: other.pos.z, floor: floorAt(other.pos.x, other.pos.z) }));
}

export function terrainHides(sight: TerrainSight, hero: CutHero, eye: Point3): boolean {
  for (const lift of SIGHT_LIFTS) if (sight.blocks(eye, { x: hero.x, y: hero.floor + lift, z: hero.z }, null)) return true;
  return false;
}

export interface CutView {
  readonly level: number;
  readonly depth: number;
  readonly floor: number;
  readonly across: number;
  readonly up: number;
  readonly radius: number;
  readonly inverse: Matrix4;
}

const viewPoint3: Vector3 = new Vector3();

export function throughWindow(view: CutView): PassThrough | null {
  const ring: number = ringWeight(view.across, view.up, view.radius) * view.level;
  if (ring < CUTAWAY.open) return null;
  return (x: number, y: number, z: number): boolean => {
    const depth: number = -viewPoint3.set(x, y, z).applyMatrix4(view.inverse).z;
    return ring * frontWeight(view.depth, depth) * highWeight(y - view.floor) >= CUTAWAY.open;
  };
}

export function isTall(height: number): boolean {
  return height >= CUTAWAY.tallFrom;
}

const heroPoint: Vector3 = new Vector3();
const viewPoint: Vector3 = new Vector3();
const eye: Vector3 = new Vector3();
let occluders: readonly Object3D[] = [];
const shownOccluders: Object3D[] = [];
let terrain: TerrainSight | null = null;
let owner: symbol | null = null;
const windowCentre: Vector2 = new Vector2(CUTAWAY.far, CUTAWAY.far);
const lastInverse: Matrix4 = new Matrix4();
let lastAspect: number = 1;
let spring: CutSpring = { level: 0, velocity: 0 };
let reach: CutSpring = { level: 0, velocity: 0 };
let company: readonly CutHero[] = [];
let radius: number = CUTAWAY.radius;
const otherPoint: Vector3 = new Vector3();

export function setCutawayCompany(list: readonly CutHero[]): void {
  company = list;
}

function hidden(hero: CutHero): boolean {
  return behindSeen(hero, eye, shownOccluders) || (terrain !== null && terrainHides(terrain, hero, eye));
}

function neededRadius(camera: PerspectiveCamera, centre: Vector3, aspect: number): number {
  let needed: number = CUTAWAY.radius;
  for (const other of company) {
    if (!hidden(other)) continue;
    otherPoint.set(other.x, other.floor + CUTAWAY.heroHeight, other.z).project(camera);
    needed = Math.max(needed, radiusFor(((otherPoint.x - centre.x) / 2) * aspect, (otherPoint.y - centre.y) / 2));
  }
  return needed;
}

export function setOccluders(list: readonly Object3D[]): void {
  prepareTrees(list);
  occluders = list;
}

export function setTerrainSight(sight: TerrainSight | null): void {
  terrain = sight;
}

export function claimCutaway(list: readonly Object3D[], sight: TerrainSight | null): symbol {
  prepareTrees(list);
  occluders = list;
  terrain = sight;
  owner = Symbol('cutaway');
  return owner;
}

export function resetCutaway(claim: symbol | null = null): void {
  if (claim !== null && claim !== owner) return;
  owner = null;
  occluders = [];
  shownOccluders.length = 0;
  terrain = null;
  company = [];
  ghosts = [];
}

export function aimCutaway(camera: PerspectiveCamera, hero: CutHero, width: number, height: number, dt: number): void {
  camera.updateMatrixWorld();
  camera.getWorldPosition(eye);
  CUTAWAY_UNIFORMS.uCutWorld.value.copy(camera.matrixWorld);
  shownOccluders.length = 0;
  for (const occluder of occluders) if (shown(occluder)) shownOccluders.push(occluder);
  const behind: boolean = hidden(hero);
  spring = springCut(spring, behind ? 1 : 0, dt);
  CUTAWAY_UNIFORMS.uCutLevel.value = spring.level;
  CUTAWAY_UNIFORMS.uCutFloor.value = hero.floor;
  heroPoint.set(hero.x, hero.floor + CUTAWAY.heroHeight, hero.z);
  viewPoint.copy(heroPoint).applyMatrix4(camera.matrixWorldInverse);
  heroPoint.project(camera);
  windowCentre.set(heroPoint.x, heroPoint.y);
  lastInverse.copy(camera.matrixWorldInverse);
  lastAspect = height > 0 ? width / height : 1;
  const needed: number = behind ? neededRadius(camera, heroPoint, lastAspect) : CUTAWAY.radius;
  reach = springCut(reach, (needed - CUTAWAY.radius) / (CUTAWAY.widest - CUTAWAY.radius), dt);
  radius = CUTAWAY.radius + (CUTAWAY.widest - CUTAWAY.radius) * reach.level;
  CUTAWAY_UNIFORMS.uCutCentre.value.set((heroPoint.x * 0.5 + 0.5) * width, (heroPoint.y * 0.5 + 0.5) * height);
  CUTAWAY_UNIFORMS.uCutRadius.value = radius * height;
  CUTAWAY_UNIFORMS.uCutDepth.value = -viewPoint.z;
  const across: number = windowMetres(camera, -viewPoint.z, radius);
  for (const ghost of ghosts) ghost.keep.value = ghostKeep(ghost.width, across);
}

export function clickThrough(pointer: Vector2): PassThrough | null {
  return throughWindow({
    level: CUTAWAY_UNIFORMS.uCutLevel.value,
    depth: CUTAWAY_UNIFORMS.uCutDepth.value,
    floor: CUTAWAY_UNIFORMS.uCutFloor.value,
    across: ((pointer.x - windowCentre.x) / 2) * lastAspect,
    up: (pointer.y - windowCentre.y) / 2,
    radius,
    inverse: lastInverse,
  });
}

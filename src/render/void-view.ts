import type { IUniform } from 'three';
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, PlaneGeometry, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from 'three';
import type { ZoneDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { wakeProgress } from '../../sim/world/void.ts';
import type { World } from '../../sim/world/types.ts';
import { CAMERA } from './iso-camera.ts';
import { GROUND_FRAGMENT, GROUND_VERTEX, MIST_FRAGMENT, MIST_VERTEX, MOTE_FRAGMENT, MOTE_VERTEX } from './void-shaders.ts';
import type { ZoneView } from './zone-view.ts';

export const VOID_VIEW = {
  groundSize: 240,
  groundColor: 0xbabfc4,
  groundShade: 0x959ba2,
  ripple: 0.06,
  heroShadow: 0.32,
  mistSize: 150,
  mistColor: 0xeef0f2,
  stormColor: 0x9097a0,
  deepColor: 0x4b535d,
  nearClear: 3,
  farStorm: 30,
  flashColor: 0xd8e4ff,
  layers: [
    { height: 0.35, opacity: 0.42, scale: 0.21, drift: 0.11 },
    { height: 1.1, opacity: 0.42, scale: 0.17, drift: 0.09 },
    { height: 2.1, opacity: 0.45, scale: 0.14, drift: 0.075 },
    { height: 3.3, opacity: 0.48, scale: 0.11, drift: 0.06 },
    { height: 4.8, opacity: 0.52, scale: 0.085, drift: 0.045 },
  ],
  clear: 3.3,
  sleepingClear: 0.42,
  lead: 5.5,
  behind: 0.8,
  feather: 0.75,
  stiffness: 9,
  damping: 5.2,
  dirStiffness: 20,
  springStep: 1 / 120,
  stillBelow: 0.4,
  leadShare: 0.45,
  openRate: 1.6,
  seedStep: 17.3,
  moteRise: 0.5,
  moteLift: 0.3,
  speedSmoothing: 6,
  firstFlash: 3,
  flashMin: 6,
  flashMax: 15,
  flashNear: 20,
  flashFar: 42,
  flashReach: 16,
  flashRise: 0.06,
  flashDecay: 2.6,
  flickerAt: 0.16,
  flickerPower: 0.65,
  motes: 260,
  moteBox: { x: 46, y: 7, z: 46 },
  moteSize: 1.7,
  moteColor: 0x3d4248,
  moteOpacity: 0.55,
  moteDrift: 0.35,
  maxPixelRatio: 1.5,
} as const;

interface Spring {
  readonly at: Vector2;
  readonly velocity: Vector2;
}

interface Lightning {
  wait: number;
  flash: number;
  flicker: number;
  readonly at: Vector2;
}

type Uniforms = Record<string, IUniform>;

function color(hex: number): IUniform<Color> {
  return { value: new Color(hex) };
}

function stepSpring(spring: Spring, target: Vector2, stiffness: number, damping: number, dt: number): void {
  const steps: number = Math.max(1, Math.ceil(dt / VOID_VIEW.springStep));
  const step: number = dt / steps;
  for (let index = 0; index < steps; index += 1) {
    const ax: number = (target.x - spring.at.x) * stiffness - spring.velocity.x * damping;
    const az: number = (target.y - spring.at.y) * stiffness - spring.velocity.y * damping;
    spring.velocity.x += ax * step;
    spring.velocity.y += az * step;
    spring.at.x += spring.velocity.x * step;
    spring.at.y += spring.velocity.y * step;
  }
}

function viewOffset(): Vector2 {
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const run: number = Math.cos(pitch) / Math.sin(pitch);
  return new Vector2(Math.sin(yaw) * run, Math.cos(yaw) * run);
}

function moteGeometry(): BufferGeometry {
  const count: number = VOID_VIEW.motes;
  const positions: Float32Array = new Float32Array(count * 3);
  const drifts: Float32Array = new Float32Array(count * 3);
  for (let index: number = 0; index < count; index += 1) {
    positions[index * 3] = Math.random() * VOID_VIEW.moteBox.x;
    positions[index * 3 + 1] = Math.random() * VOID_VIEW.moteBox.y;
    positions[index * 3 + 2] = Math.random() * VOID_VIEW.moteBox.z;
    drifts[index * 3] = (Math.random() - 0.5) * VOID_VIEW.moteDrift;
    drifts[index * 3 + 1] = (Math.random() - VOID_VIEW.moteLift) * VOID_VIEW.moteDrift * VOID_VIEW.moteRise;
    drifts[index * 3 + 2] = (Math.random() - 0.5) * VOID_VIEW.moteDrift;
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('drift', new BufferAttribute(drifts, 3));
  return geometry;
}

export function buildVoidView(zone: ZoneDef): ZoneView {
  const group: Group = new Group();
  const shift: IUniform<Vector2> = { value: new Vector2() };
  const hero: IUniform<Vector2> = { value: new Vector2() };
  const time: IUniform<number> = { value: 0 };
  const flash: IUniform<number> = { value: 0 };
  const flashPos: IUniform<Vector2> = { value: new Vector2() };
  const flashReach: IUniform<number> = { value: VOID_VIEW.flashReach };
  const flashColor: IUniform<Color> = color(VOID_VIEW.flashColor);
  const pocket: IUniform<Vector2> = { value: new Vector2() };
  const dir: IUniform<Vector2> = { value: new Vector2(0, 1) };
  const size: IUniform<Vector3> = { value: new Vector3(VOID_VIEW.clear, VOID_VIEW.clear, VOID_VIEW.clear) };
  const feather: IUniform<number> = { value: VOID_VIEW.feather };
  const view: IUniform<Vector2> = { value: viewOffset() };

  const groundUniforms: Uniforms = UniformsUtils.merge([UniformsLib.fog]);
  Object.assign(groundUniforms, { uColor: color(VOID_VIEW.groundColor), uShade: color(VOID_VIEW.groundShade), uFlashColor: flashColor, uShift: shift, uHero: hero, uFlashPos: flashPos, uFlash: flash, uFlashReach: flashReach, uRipple: { value: VOID_VIEW.ripple }, uShadow: { value: VOID_VIEW.heroShadow } });
  const groundMaterial: ShaderMaterial = new ShaderMaterial({ uniforms: groundUniforms, vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT, fog: true });
  const groundGeometry: PlaneGeometry = new PlaneGeometry(VOID_VIEW.groundSize, VOID_VIEW.groundSize);
  const ground: Mesh = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = zone.floorHeight;
  group.add(ground);

  const mistGeometry: PlaneGeometry = new PlaneGeometry(VOID_VIEW.mistSize, VOID_VIEW.mistSize);
  const layers: Mesh[] = VOID_VIEW.layers.map((layer, index: number): Mesh => {
    const material: ShaderMaterial = new ShaderMaterial({
      uniforms: { uMist: color(VOID_VIEW.mistColor), uStorm: color(VOID_VIEW.stormColor), uDeep: color(VOID_VIEW.deepColor), uHero: hero, uNear: { value: new Vector2(VOID_VIEW.nearClear, VOID_VIEW.farStorm) }, uFlashColor: flashColor, uShift: shift, uView: view, uFlashPos: flashPos, uFlash: flash, uFlashReach: flashReach, uTime: time, uHeight: { value: layer.height }, uOpacity: { value: layer.opacity }, uSeed: { value: index * VOID_VIEW.seedStep }, uScale: { value: layer.scale }, uDrift: { value: layer.drift }, uPocket: pocket, uDir: dir, uSize: size, uFeather: feather },
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const mesh: Mesh = new Mesh(mistGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = zone.floorHeight + layer.height;
    mesh.renderOrder = 10 + index;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });

  const moteMaterial: ShaderMaterial = new ShaderMaterial({
    uniforms: { uHero: hero, uShift: shift, uBox: { value: new Vector3(VOID_VIEW.moteBox.x, VOID_VIEW.moteBox.y, VOID_VIEW.moteBox.z) }, uTime: time, uSize: { value: VOID_VIEW.moteSize }, uPixelRatio: { value: Math.min(window.devicePixelRatio, VOID_VIEW.maxPixelRatio) }, uColor: color(VOID_VIEW.moteColor), uOpacity: { value: VOID_VIEW.moteOpacity } },
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const moteGeometryBuilt: BufferGeometry = moteGeometry();
  const motes: Points = new Points(moteGeometryBuilt, moteMaterial);
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  group.add(motes);

  const centre: Spring = { at: new Vector2(), velocity: new Vector2() };
  const heading: Spring = { at: new Vector2(0, 1), velocity: new Vector2() };
  const target: Vector2 = new Vector2();
  const lightning: Lightning = { wait: VOID_VIEW.firstFlash, flash: 0, flicker: -1, at: new Vector2() };
  let last: Vec2 | null = null;
  let lastShift: Vec2 = { x: 0, z: 0 };
  let speed: number = 0;
  let opening: number = VOID_VIEW.sleepingClear;

  const strike = (world: World): void => {
    const angle: number = Math.random() * Math.PI * 2;
    const reach: number = VOID_VIEW.flashNear + Math.random() * (VOID_VIEW.flashFar - VOID_VIEW.flashNear);
    lightning.at.set(world.player.pos.x + Math.cos(angle) * reach, world.player.pos.z + Math.sin(angle) * reach);
    lightning.flash = 1;
    lightning.flicker = VOID_VIEW.flickerAt;
    lightning.wait = VOID_VIEW.flashMin + Math.random() * (VOID_VIEW.flashMax - VOID_VIEW.flashMin);
  };

  const stepLightning = (world: World, dt: number): void => {
    lightning.wait -= dt;
    if (lightning.wait <= 0) strike(world);
    lightning.flash = Math.max(0, lightning.flash - VOID_VIEW.flashDecay * dt * Math.max(0.25, lightning.flash));
    if (lightning.flicker > 0) {
      lightning.flicker -= dt;
      if (lightning.flicker <= 0) lightning.flash = Math.max(lightning.flash, VOID_VIEW.flickerPower);
    }
    flash.value += (lightning.flash - flash.value) * Math.min(1, dt / VOID_VIEW.flashRise);
    flashPos.value.copy(lightning.at);
  };

  const follow = (world: World, dt: number): void => {
    const pos: Vec2 = world.player.pos;
    const moved: Vec2 = { x: world.shift.x - lastShift.x, z: world.shift.z - lastShift.z };
    lastShift = { x: world.shift.x, z: world.shift.z };
    lightning.at.x += moved.x;
    lightning.at.y += moved.z;
    last ??= { x: pos.x, z: pos.z };
    const stepX: number = pos.x - last.x - moved.x;
    const stepZ: number = pos.z - last.z - moved.z;
    last = { x: pos.x, z: pos.z };
    const instant: number = dt > 0 ? Math.hypot(stepX, stepZ) / dt : 0;
    speed += (instant - speed) * Math.min(1, dt * VOID_VIEW.speedSmoothing);
    const going: number = Math.min(1, speed / Math.max(world.player.stats.moveSpeed, 1e-3));
    if (instant > VOID_VIEW.stillBelow) target.set(stepX, stepZ).normalize();
    else target.copy(heading.at);
    stepSpring(heading, target, VOID_VIEW.dirStiffness, VOID_VIEW.dirStiffness, dt);
    if (heading.at.lengthSq() > 1e-6) dir.value.copy(heading.at).normalize();
    target.set(dir.value.x * VOID_VIEW.lead * going * VOID_VIEW.leadShare, dir.value.y * VOID_VIEW.lead * going * VOID_VIEW.leadShare);
    stepSpring(centre, target, VOID_VIEW.stiffness, VOID_VIEW.damping, dt);
    pocket.value.set(pos.x + centre.at.x, pos.z + centre.at.y);
    const wanted: number = world.wake === null ? 1 : VOID_VIEW.sleepingClear + (1 - VOID_VIEW.sleepingClear) * wakeProgress(world.wake);
    opening += (wanted - opening) * Math.min(1, dt * VOID_VIEW.openRate);
    const clear: number = VOID_VIEW.clear * opening;
    size.value.set(clear, clear + VOID_VIEW.lead * going, clear * (1 - (1 - VOID_VIEW.behind) * going));
    hero.value.set(pos.x, pos.z);
  };

  return {
    zone,
    group,
    torches: [],
    lightsVersion: 0,
    setLightBudget(): void {},
    update(now: number, dt: number, world: World): void {
      time.value = now;
      shift.value.set(world.shift.x, world.shift.z);
      follow(world, dt);
      stepLightning(world, dt);
      ground.position.set(world.player.pos.x, zone.floorHeight, world.player.pos.z);
      for (const layer of layers) layer.position.set(world.player.pos.x, layer.position.y, world.player.pos.z);
    },
    dispose(): void {
      group.removeFromParent();
      groundGeometry.dispose();
      groundMaterial.dispose();
      mistGeometry.dispose();
      for (const layer of layers) if (layer.material instanceof ShaderMaterial) layer.material.dispose();
      moteGeometryBuilt.dispose();
      moteMaterial.dispose();
    },
  };
}

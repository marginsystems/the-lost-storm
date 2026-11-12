import type { IUniform } from 'three';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, Points, RedFormat, RepeatWrapping, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3, Vector4 } from 'three';
import type { SurfaceDef, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { Vec2 } from '../../sim/math.ts';
import { wakeProgress } from '../../sim/world/wake.ts';
import type { GroundItem, ShoreState, World } from '../../sim/world/types.ts';
import type { VoidShore } from '../../sim/content/story-types.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { Eddy, MistDrive, MistField } from './mist-field.ts';
import { createMistDrive, createMistField, MIST, stepDrive, stepField } from './mist-field.ts';
import { CAMERA } from './iso-camera.ts';
import type { VoidLight } from './void-light.ts';
import { createVoidLight, VOID_LIGHT } from './void-light.ts';
import type { ShoreRock } from './shore-rock.ts';
import { createShoreRock } from './shore-rock.ts';
import { GROUND_FRAGMENT, GROUND_VERTEX, MIST_FRAGMENT, MIST_VERTEX, MOTE_FRAGMENT, MOTE_VERTEX } from './void-shaders.ts';
import type { ViewFocus, ZoneView } from './zone-view.ts';
import { FIGURE_GAUGE } from './figure-gauge.ts';

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
  lightColor: 0xfff1d6,
  layers: [
    { height: 0.35, opacity: 0.42, scale: 0.21, drift: 0.11, need: 0.2, tear: 0.5, warp: 1.4, streak: 0.85 },
    { height: 1.1, opacity: 0.42, scale: 0.17, drift: 0.09, need: 0.28, tear: 0.55, warp: 1.9, streak: 0.4 },
    { height: 2.1, opacity: 0.45, scale: 0.14, drift: 0.075, need: 0.36, tear: 0.62, warp: 2.4, streak: 0.15 },
    { height: 3.3, opacity: 0.48, scale: 0.11, drift: 0.06, need: 0.45, tear: 0.7, warp: 2.9, streak: 0 },
    { height: 4.8, opacity: 0.52, scale: 0.085, drift: 0.045, need: 0.54, tear: 0.78, warp: 3.4, streak: 0 },
  ],
  tiers: {
    desktop: { cells: 64, layers: [0, 1, 2, 3, 4], octaves: 3, motes: 260 },
    mobile: { cells: 32, layers: [0, 2, 4], octaves: 2, motes: 110 },
  },
  edgeFeather: 0.13,
  fray: 0.85,
  figureClear: { inner: 1.15, outer: 2.7, margin: 0.45 },
  rest: { tear: 1.8, feather: 1.7, breathe: 0.3, curl: 0.24 },
  restWall: 0.2,
  motionRate: 2.2,
  groundClear: { inner: 1.4, outer: 2.6 },
  pocketShade: { edge: 0.06, inner: 0.05 },
  rockColor: 0x1d2026,
  rockShade: 0x0d0f12,
  heroPool: { radius: 1.5, strength: 0.16, color: 0x9fb4cc },
  firePool: { radius: 9, strength: 0.22 },
  shoreFray: 9,
  shoreRate: 0.8,
  wallLight: 0.55,
  glimpseColor: 0x6d747d,
  glimpseOpacity: 0.75,
  glimpseRate: 2.4,
  glimpseShare: 0.86,
  glimpseStones: [
    { x: 0, z: 0, width: 1.1, height: 9.5 },
    { x: 1.6, z: 0.7, width: 0.8, height: 6.2 },
    { x: -1.3, z: 0.9, width: 0.6, height: 4.4 },
  ],
  sleepingClear: 0.42,
  stillBelow: 0.4,
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
  moteBox: { x: 46, y: 7, z: 46 },
  moteSize: 1.7,
  moteColor: 0x3d4248,
  moteOpacity: 0.55,
  moteDrift: 0.35,
  maxPixelRatio: 1.5,
} as const;

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

function viewOffset(): Vector2 {
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const run: number = Math.cos(pitch) / Math.sin(pitch);
  return new Vector2(Math.sin(yaw) * run, Math.cos(yaw) * run);
}

function moteGeometry(count: number): BufferGeometry {
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

type VoidTier = (typeof VOID_VIEW.tiers)[QualityName];

function eddyUniforms(): Vector4[] {
  return Array.from({ length: MIST.eddies }, (): Vector4 => new Vector4(0, 0, 0, 0));
}

function shiftedEddies(eddies: readonly Eddy[], target: Vector4[]): void {
  target.forEach((slot: Vector4, index: number): void => {
    const eddy: Eddy | undefined = eddies[index];
    if (eddy === undefined) slot.set(0, 0, 0, 0);
    else slot.set(eddy.at.x, eddy.at.z, eddy.spin, Math.max(0, eddy.life));
  });
}

function buildGlimpse(floor: number): { readonly group: Group; readonly material: MeshBasicMaterial; readonly geometries: BoxGeometry[] } {
  const group: Group = new Group();
  const material: MeshBasicMaterial = new MeshBasicMaterial({ color: VOID_VIEW.glimpseColor, transparent: true, opacity: 0, depthWrite: false });
  const geometries: BoxGeometry[] = VOID_VIEW.glimpseStones.map((stone): BoxGeometry => {
    const geometry: BoxGeometry = new BoxGeometry(stone.width, stone.height, stone.width);
    const mesh: Mesh = new Mesh(geometry, material);
    mesh.position.set(stone.x, floor + stone.height / 2, stone.z);
    mesh.renderOrder = 5;
    group.add(mesh);
    return geometry;
  });
  group.visible = false;
  return { group, material, geometries };
}

function findsIn(world: World): Vec2[] {
  const items: Vec2[] = world.ground.flatMap((ground: GroundItem): Vec2[] => (ground.find === null ? [] : [{ x: ground.pos.x - world.shift.x, z: ground.pos.z - world.shift.z }]));
  const lights: Vec2[] = world.zone.exits.flatMap((exit: ZoneExit): Vec2[] => (exit.hiddenWhenLocked && allHold(world, exit.requires) ? [{ x: exit.x - world.shift.x, z: exit.z - world.shift.z }] : []));
  return [...items, ...lights];
}

export function buildVoidView(zone: ZoneDef, quality: QualityName, rockSurface: SurfaceDef | null): ZoneView {
  const tier: VoidTier = VOID_VIEW.tiers[quality];
  const defines: Record<string, number> = { VOID_OCTAVES: tier.octaves, VOID_EDDIES: MIST.eddies };
  const group: Group = new Group();
  const shift: IUniform<Vector2> = { value: new Vector2() };
  const hero: IUniform<Vector2> = { value: new Vector2() };
  const time: IUniform<number> = { value: 0 };
  const flash: IUniform<number> = { value: 0 };
  const flashPos: IUniform<Vector2> = { value: new Vector2() };
  const flashReach: IUniform<number> = { value: VOID_VIEW.flashReach };
  const flashColor: IUniform<Color> = color(VOID_VIEW.flashColor);
  const dir: IUniform<Vector2> = { value: new Vector2(0, 1) };
  const view: IUniform<Vector2> = { value: viewOffset() };
  const eddies: IUniform<Vector4[]> = { value: eddyUniforms() };
  const field: MistField = createMistField(tier.cells);
  const drive: MistDrive = createMistDrive();
  const fieldTexture: DataTexture = new DataTexture(field.bytes, tier.cells, tier.cells, RedFormat);
  fieldTexture.wrapS = RepeatWrapping;
  fieldTexture.wrapT = RepeatWrapping;
  fieldTexture.magFilter = LinearFilter;
  fieldTexture.minFilter = LinearFilter;
  fieldTexture.needsUpdate = true;
  const fieldUniform: IUniform<DataTexture> = { value: fieldTexture };
  const openScale: IUniform<number> = { value: VOID_VIEW.sleepingClear };
  const shoreLine: IUniform<Vector4> = { value: new Vector4(0, 0, 1, 0) };
  const shoreLook: IUniform<Vector3> = { value: new Vector3(1, 0, VOID_VIEW.shoreFray) };
  const figure: IUniform<Vector3> = { value: new Vector3(FIGURE_GAUGE.fallback, VOID_VIEW.figureClear.inner, VOID_VIEW.figureClear.outer) };
  const motion: IUniform<number> = { value: 0 };
  const light: VoidLight = createVoidLight(zone.floorHeight);
  group.add(light.group);
  const glimpse = buildGlimpse(zone.floorHeight);
  group.add(glimpse.group);
  const rock: ShoreRock | null = rockSurface === null ? null : createShoreRock(rockSurface);
  if (rock !== null) group.add(rock.mesh);

  const groundUniforms: Uniforms = UniformsUtils.merge([UniformsLib.fog]);
  Object.assign(groundUniforms, { uColor: color(VOID_VIEW.groundColor), uShade: color(VOID_VIEW.groundShade), uFlashColor: flashColor, uShift: shift, uHero: hero, uFlashPos: flashPos, uFlash: flash, uFlashReach: flashReach, uRipple: { value: VOID_VIEW.ripple }, uShadow: { value: VOID_VIEW.heroShadow }, uField: fieldUniform, uSpan: { value: MIST.span }, uFieldReach: { value: (MIST.span / 2) * MIST.edgeEnd }, uOpen: openScale, uGroundClear: { value: new Vector2(VOID_VIEW.groundClear.inner, VOID_VIEW.groundClear.outer) }, uPocketShade: { value: new Vector2(VOID_VIEW.pocketShade.edge, VOID_VIEW.pocketShade.inner) }, uShore: shoreLine, uShoreLook: shoreLook, uRock: color(VOID_VIEW.rockColor), uRockShade: color(VOID_VIEW.rockShade), uLight: light.uniform, uLightColor: color(VOID_LIGHT.color), uLift: { value: new Vector4(VOID_VIEW.heroPool.radius, VOID_VIEW.heroPool.strength, VOID_VIEW.firePool.strength, VOID_VIEW.firePool.radius) }, uLiftColor: color(VOID_VIEW.heroPool.color) });
  const groundMaterial: ShaderMaterial = new ShaderMaterial({ uniforms: groundUniforms, defines, vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT, fog: true });
  const groundGeometry: PlaneGeometry = new PlaneGeometry(VOID_VIEW.groundSize, VOID_VIEW.groundSize);
  const ground: Mesh = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = zone.floorHeight;
  group.add(ground);

  const mistGeometry: PlaneGeometry = new PlaneGeometry(VOID_VIEW.mistSize, VOID_VIEW.mistSize);
  const layers: Mesh[] = tier.layers.map((which: number, index: number): Mesh => {
    const layer = VOID_VIEW.layers[which] ?? VOID_VIEW.layers[0];
    const material: ShaderMaterial = new ShaderMaterial({
      uniforms: { uMist: color(VOID_VIEW.mistColor), uStorm: color(VOID_VIEW.stormColor), uDeep: color(VOID_VIEW.deepColor), uHero: hero, uNear: { value: new Vector2(VOID_VIEW.nearClear, VOID_VIEW.farStorm) }, uFlashColor: flashColor, uShift: shift, uView: view, uFlashPos: flashPos, uFlash: flash, uFlashReach: flashReach, uTime: time, uHeight: { value: layer.height }, uOpacity: { value: layer.opacity }, uSeed: { value: which * VOID_VIEW.seedStep }, uScale: { value: layer.scale }, uDrift: { value: layer.drift }, uDir: dir, uSpan: { value: MIST.span }, uNeed: { value: layer.need }, uTear: { value: layer.tear }, uWarp: { value: layer.warp }, uFeather: { value: VOID_VIEW.edgeFeather }, uFray: { value: VOID_VIEW.fray }, uFigure: figure, uRest: { value: new Vector4(VOID_VIEW.rest.tear, VOID_VIEW.rest.feather, VOID_VIEW.rest.breathe, VOID_VIEW.rest.curl) }, uMotion: motion, uRestWall: { value: VOID_VIEW.restWall }, uFieldReach: { value: (MIST.span / 2) * MIST.edgeEnd }, uStreak: { value: layer.streak }, uWall: { value: VOID_VIEW.wallLight }, uEddyRadius: { value: MIST.eddyRadius }, uEddies: eddies, uField: fieldUniform, uOpen: openScale, uLight: light.uniform, uLightColor: color(VOID_VIEW.lightColor), uShore: shoreLine, uShoreLook: shoreLook },
      defines,
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
  const moteGeometryBuilt: BufferGeometry = moteGeometry(tier.motes);
  const motes: Points = new Points(moteGeometryBuilt, moteMaterial);
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  group.add(motes);

  const lightning: Lightning = { wait: VOID_VIEW.firstFlash, flash: 0, flicker: -1, at: new Vector2() };
  let last: Vec2 | null = null;
  let lastShift: Vec2 | null = null;
  let speed: number = 0;
  let glimpseAlpha: number = 0;
  let glimpseFor: MistDrive['gust'] = null;

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

  const stepGlimpse = (world: World, dt: number): void => {
    const gust: MistDrive['gust'] = drive.gust;
    if (gust !== null && gust !== glimpseFor && !gust.aimed) {
      glimpseFor = gust;
      const reach: number = MIST.gustReach * VOID_VIEW.glimpseShare;
      glimpse.group.position.set(world.player.pos.x + gust.dir.x * reach, 0, world.player.pos.z + gust.dir.z * reach);
      glimpse.group.rotation.y = Math.random() * Math.PI;
    }
    const wanted: number = gust !== null && !gust.aimed ? gust.strength * VOID_VIEW.glimpseOpacity : 0;
    glimpseAlpha += (wanted - glimpseAlpha) * Math.min(1, dt * VOID_VIEW.glimpseRate);
    glimpse.material.opacity = glimpseAlpha;
    glimpse.group.visible = glimpseAlpha > 0.01;
  };

  const follow = (world: World, dt: number, look: Vec2 | null): void => {
    motion.value += (drive.momentum - motion.value) * Math.min(1, dt * VOID_VIEW.motionRate);
    const pos: Vec2 = world.player.pos;
    const before: Vec2 = lastShift ?? world.shift;
    const moved: Vec2 = { x: world.shift.x - before.x, z: world.shift.z - before.z };
    lastShift = { x: world.shift.x, z: world.shift.z };
    lightning.at.x += moved.x;
    lightning.at.y += moved.z;
    glimpse.group.position.x += moved.x;
    glimpse.group.position.z += moved.z;
    const arriving: boolean = last === null;
    last ??= { x: pos.x, z: pos.z };
    const stepX: number = pos.x - last.x - moved.x;
    const stepZ: number = pos.z - last.z - moved.z;
    last = { x: pos.x, z: pos.z };
    const instant: number = dt > 0 ? Math.hypot(stepX, stepZ) / dt : 0;
    speed += (instant - speed) * Math.min(1, dt * VOID_VIEW.speedSmoothing);
    const moveDir: Vec2 | null = instant > VOID_VIEW.stillBelow ? { x: stepX / (instant * dt), z: stepZ / (instant * dt) } : null;
    const lookAway: number = look === null ? 0 : Math.hypot(look.x - pos.x, look.z - pos.z);
    const lookDir: Vec2 | null = look === null || lookAway < VOID_VIEW.stillBelow ? null : { x: (look.x - pos.x) / lookAway, z: (look.z - pos.z) / lookAway };
    const anchored: Vec2 = { x: pos.x - world.shift.x, z: pos.z - world.shift.z };
    const lying: boolean = world.wake !== null;
    stepDrive(drive, { hero: anchored, speed: lying ? 0 : speed, maxSpeed: world.player.stats.moveSpeed, moveDir: lying ? null : moveDir, look: lying ? null : lookDir, finds: findsIn(world), dt, random: Math.random });
    stepField(field, drive, anchored, dt);
    fieldTexture.needsUpdate = true;
    dir.value.set(drive.dir.x, drive.dir.z);
    shiftedEddies(drive.eddies, eddies.value);
    const wanted: number = world.wake === null ? 1 : VOID_VIEW.sleepingClear + (1 - VOID_VIEW.sleepingClear) * wakeProgress(world.wake);
    openScale.value = arriving ? wanted : openScale.value + (wanted - openScale.value) * Math.min(1, dt * VOID_VIEW.openRate);
    const shore: ShoreState | null = world.shore;
    const rules: VoidShore | null = world.zone.void?.shore ?? null;
    if (shore !== null && rules !== null) {
      shoreLine.value.set(shore.at.x - world.shift.x, shore.at.z - world.shift.z, shore.facing.x, shore.facing.z);
      shoreLook.value.x = rules.thin;
    }
    const shoreOn: number = shore !== null && rules !== null ? 1 : 0;
    shoreLook.value.y = arriving ? shoreOn : shoreLook.value.y + (shoreOn - shoreLook.value.y) * Math.min(1, dt * VOID_VIEW.shoreRate);
    hero.value.set(pos.x, pos.z);
    rock?.update(shore === null ? null : { hero: pos, shift: world.shift, at: shore.at, facing: shore.facing, shown: shoreLook.value.y }, zone.floorHeight);
  };

  return {
    zone,
    group,
    torches: [],
    lightsVersion: 0,
    setLightBudget(): void {},
    update(now: number, dt: number, world: World, focus: ViewFocus): void {
      time.value = now;
      shift.value.set(world.shift.x, world.shift.z);
      const inner: number = Math.max(VOID_VIEW.figureClear.inner, focus.figure.reach + VOID_VIEW.figureClear.margin);
      figure.value.set(focus.figure.height, inner, inner + VOID_VIEW.figureClear.outer - VOID_VIEW.figureClear.inner);
      follow(world, dt, focus.look);
      stepLightning(world, dt);
      stepGlimpse(world, dt);
      light.update(world, now, dt);
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
      fieldTexture.dispose();
      glimpse.material.dispose();
      for (const geometry of glimpse.geometries) geometry.dispose();
      light.dispose();
      rock?.dispose();
    },
  };
}

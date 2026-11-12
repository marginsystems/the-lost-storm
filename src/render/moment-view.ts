import type { AnimationAction, AnimationClip, Camera, IUniform, Material, MeshBasicMaterial, Object3D, Scene, WebGLRenderer } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, Group, LoopRepeat, Mesh, MeshStandardMaterial, PointLight, ShaderMaterial, SphereGeometry } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MomentDef, MomentEcho, MomentProp } from '../../sim/content/moment-types.ts';
import type { Content, MonsterDef, PropDef, SurfaceDef } from '../../sim/content/types.ts';
import { distance } from '../../sim/math.ts';
import { wornWearables, hiddenBodyParts } from '../../sim/wear.ts';
import type { MomentFigure, MomentState, World, WorldEvent } from '../../sim/world/types.ts';
import type { QualityTier } from '../mobile/quality.ts';
import type { CharacterLibrary, Dresser, LoadedRig, RigInstance } from './character-loader.ts';
import { hasWear, instantiateRig, loadKeptModel } from './character-loader.ts';
import { disposeObject, groundArcs, skyBolt } from './effect-shapes.ts';
import type { GhostUniforms } from './ghost-material.ts';
import { createGhostUniforms, makeGhost } from './ghost-material.ts';
import { DOME_FRAGMENT, DOME_VERTEX, FLOOR_FRAGMENT, FLOOR_VERTEX } from './moment-shaders.ts';
import type { Press } from './membrane.ts';
import { MEMBRANE, pressAngle, pressTarget, SLACK, stepPress } from './membrane.ts';
import { surfaceMaterial } from './surfaces.ts';

export const MOMENT_VIEW = {
  domeSegments: 40,
  domeRings: 14,
  phoneDomeSegments: 20,
  phoneDomeRings: 8,
  floorSegments: 48,
  floorLift: 0.04,
  groundLift: 0.02,
  groundSegments: 40,
  phoneGroundSegments: 20,
  groundRings: 12,
  groundFade: 0.16,
  groundJag: 0.22,
  groundCrumble: 0.55,
  stillMix: 0.45,
  groundOffset: -2,
  lensWhite: 0.75,
  domeAlpha: 0.07,
  floorAlpha: 0.22,
  shimmerSpeed: 1.3,
  appearRate: 5.5,
  wakeRate: 3,
  turnFade: 0.35,
  echoMix: 0.12,
  echoRim: 0.25,
  echoRimAwake: 0.2,
  echoOpacity: 0.62,
  awakeOpacity: 0.8,
  lightHeight: 3.2,
  lightReach: 1.8,
  dormantLight: 14,
  awakeLight: 30,
  lightDecay: 1.4,
  desktopLights: 4,
  phoneLights: 0,
  boltTime: 0.32,
  arcTime: 0.45,
  flashPower: 0.55,
  brightFlash: 0.8,
  strikeTrauma: 0.22,
  markRings: 3,
  markAlpha: 0.2,
  markPulse: 9,
} as const;

const WHITE: Color = new Color(0xffffff);
const STILL: Color = new Color(0xdde1e8);
const STRIKE_WHITE: Color = new Color(0xe8f2ff);
const MARK: Color = new Color(0xb8d2ff);


interface SurfaceUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uTint: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
  readonly uMark: IUniform<number>;
  readonly uPress: IUniform<number>;
  readonly uAngle: IUniform<number>;
  readonly uPressGlow: IUniform<number>;
  readonly uPressWidth: IUniform<number>;
}

function surfaceUniforms(tint: Color): SurfaceUniforms {
  return { uTint: { value: tint.clone() }, uStrength: { value: 0 }, uTime: { value: 0 }, uMark: { value: 0 }, uPress: { value: 0 }, uAngle: { value: 0 }, uPressGlow: { value: MEMBRANE.glow }, uPressWidth: { value: MEMBRANE.width } };
}

function glowMaterial(vertex: string, fragment: string, uniforms: SurfaceUniforms): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending });
}

interface FigureView {
  readonly rig: RigInstance;
  readonly action: AnimationAction;
  readonly echo: number;
  readonly ghost: GhostUniforms;
  shown: number;
}

interface MomentEntry {
  readonly group: Group;
  readonly dome: Mesh<BufferGeometry, ShaderMaterial>;
  readonly floor: Mesh<BufferGeometry, ShaderMaterial>;
  readonly ground: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  readonly domeUniforms: SurfaceUniforms;
  readonly floorUniforms: SurfaceUniforms;
  readonly props: Group;
  readonly propGhost: GhostUniforms;
  readonly propMaterials: MeshStandardMaterial[];
  readonly figures: FigureView[];
  readonly tint: Color;
  readonly lens: Color;
  readonly glow: Color;
  light: PointLight | null;
  shown: number;
  awake: number;
  press: Press;
}

interface Flash {
  readonly object: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly duration: number;
  age: number;
}

interface WarmTarget {
  readonly renderer: WebGLRenderer;
  readonly camera: Camera;
}

export interface MomentViewDeps {
  readonly scene: Scene;
  readonly loader: GLTFLoader;
  readonly content: Content;
  readonly library: CharacterLibrary;
  readonly dresser: Dresser;
  readonly tier: QualityTier;
  readonly flash: (power: number) => void;
  readonly trauma: (amount: number) => void;
}

export interface MomentView {
  handle(events: readonly WorldEvent[]): void;
  update(dt: number, world: World): void;
  prepare(renderer: WebGLRenderer, camera: Camera): Promise<void>;
  showWarm(x: number, z: number): () => void;
  clear(): void;
}

function easeToward(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function clipOf(rig: RigInstance, name: string): AnimationClip {
  switch (name) {
    case 'idle':
      return rig.clips.idle;
    case 'run':
      return rig.clips.run;
    case 'hit':
      return rig.clips.hit[0] ?? rig.clips.idle;
    case 'death':
      return rig.clips.death[0] ?? rig.clips.idle;
    default:
      return rig.clips.actions.get(name)?.clip ?? rig.clips.idle;
  }
}

function fadeOf(moment: MomentState, world: World): number {
  return moment.phase === 'fading' ? Math.min(1, moment.phaseTime / world.content.moments.fade) : 0;
}

function hashOf(text: string): number {
  let hash: number = 0;
  for (let index: number = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 100_003;
  return hash;
}

function grain(value: number): number {
  const wave: number = Math.sin(value * 12.9898) * 43_758.5453;
  return wave - Math.floor(wave);
}

function edgeAt(angle: number, seed: number): number {
  const wobble: number = 0.5 * Math.sin(3 * angle + seed) + 0.3 * Math.sin(7 * angle + seed * 2) + 0.2 * Math.sin(13 * angle + seed * 3);
  return 1 - MOMENT_VIEW.groundJag * (0.5 + 0.5 * wobble);
}

function groundAlpha(reach: number, angle: number, seed: number, vertex: number): number {
  const edge: number = edgeAt(angle, seed);
  const inside: number = Math.min(1, Math.max(0, (edge - reach) / MOMENT_VIEW.groundFade));
  if (inside >= 1) return 1;
  return inside * (1 - MOMENT_VIEW.groundCrumble * grain(vertex + seed));
}

function groundGeometry(radius: number, segments: number, seed: number): BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0, 0];
  const colours: number[] = [1, 1, 1, 1];
  const index: number[] = [];
  for (let ring: number = 1; ring <= MOMENT_VIEW.groundRings; ring += 1) {
    const reach: number = Math.sqrt(ring / MOMENT_VIEW.groundRings);
    for (let step: number = 0; step < segments; step += 1) {
      const angle: number = (step / segments) * Math.PI * 2;
      const alpha: number = groundAlpha(reach, angle, seed, ring * segments + step);
      const x: number = Math.cos(angle) * reach * radius;
      const z: number = Math.sin(angle) * reach * radius;
      positions.push(x, 0, z);
      uvs.push(x, -z);
      colours.push(1, 1, 1, alpha);
    }
  }
  const at = (ring: number, step: number): number => (ring === 0 ? 0 : 1 + (ring - 1) * segments + (step % segments));
  for (let step: number = 0; step < segments; step += 1) index.push(0, at(1, step + 1), at(1, step));
  for (let ring: number = 1; ring < MOMENT_VIEW.groundRings; ring += 1) {
    for (let step: number = 0; step < segments; step += 1) {
      index.push(at(ring, step), at(ring, step + 1), at(ring + 1, step), at(ring, step + 1), at(ring + 1, step + 1), at(ring + 1, step));
    }
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colours), 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function groundMaterial(def: SurfaceDef): MeshStandardMaterial {
  const base: MeshStandardMaterial = surfaceMaterial(def, 'solid');
  return new MeshStandardMaterial({
    color: base.color,
    map: base.map,
    normalMap: base.normalMap,
    normalScale: base.normalScale,
    roughness: base.roughness,
    metalness: 0,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: MOMENT_VIEW.groundOffset,
    polygonOffsetUnits: MOMENT_VIEW.groundOffset,
  });
}

export function createMomentView(deps: MomentViewDeps): MomentView {
  const { scene, content, library } = deps;
  const phone: boolean = deps.tier.name === 'mobile';
  const domeGeometry: SphereGeometry = new SphereGeometry(1, phone ? MOMENT_VIEW.phoneDomeSegments : MOMENT_VIEW.domeSegments, phone ? MOMENT_VIEW.phoneDomeRings : MOMENT_VIEW.domeRings, 0, Math.PI * 2, 0, Math.PI / 2);
  const floorGeometry: CircleGeometry = new CircleGeometry(1, MOMENT_VIEW.floorSegments);
  const entries: Map<number, MomentEntry> = new Map<number, MomentEntry>();
  let kept: MomentEntry[] = [];
  let keptStrike: readonly Object3D[] = [];
  let warmed: WarmTarget | null = null;
  let warmedRigs: number = 0;
  let warming: boolean = false;
  const flashes: Flash[] = [];
  const models: Map<string, GLTF> = new Map<string, GLTF>();
  const lights: PointLight[] = [];
  const zeroFlash: IUniform<Color> = { value: new Color(0, 0, 0) };
  const grounds: Map<string, BufferGeometry> = new Map<string, BufferGeometry>();
  const groundOf = (def: MomentDef): BufferGeometry => {
    const known: BufferGeometry | undefined = grounds.get(def.id);
    if (known !== undefined) return known;
    const made: BufferGeometry = groundGeometry(def.radius, phone ? MOMENT_VIEW.phoneGroundSegments : MOMENT_VIEW.groundSegments, hashOf(def.id));
    grounds.set(def.id, made);
    return made;
  };
  let clock: number = 0;
  for (let index: number = 0; index < (phone ? MOMENT_VIEW.phoneLights : MOMENT_VIEW.desktopLights); index += 1) {
    const light: PointLight = new PointLight(0xffffff, 0, 1, MOMENT_VIEW.lightDecay);
    light.visible = true;
    lights.push(light);
    scene.add(light);
  }
  const freeLights: PointLight[] = [...lights];

  const loadProps = async (defs: Iterable<MomentDef>): Promise<void> => {
    const wanted: Set<string> = new Set<string>();
    for (const def of defs) for (const placed of def.props) {
      const prop: PropDef | undefined = content.props.get(placed.prop);
      if (prop !== undefined && !models.has(prop.model)) wanted.add(prop.model);
    }
    await Promise.all([...wanted].map(async (model: string): Promise<void> => {
      const gltf: GLTF | null = await loadKeptModel(deps.loader, model).catch((): null => null);
      if (gltf !== null) models.set(model, gltf);
    }));
  };

  const placeProp = (entry: MomentEntry, placed: MomentProp): void => {
    const prop: PropDef | undefined = content.props.get(placed.prop);
    const gltf: GLTF | undefined = prop === undefined ? undefined : models.get(prop.model);
    if (prop === undefined || gltf === undefined) return;
    const object: Object3D = gltf.scene.clone(true);
    object.position.set(placed.x, 0, placed.z);
    object.rotation.y = (placed.rotationDegrees * Math.PI) / 180;
    object.scale.setScalar(prop.scale);
    object.traverse((child: Object3D): void => {
      if (!(child instanceof Mesh)) return;
      const source: unknown = child.material;
      if (!(source instanceof MeshStandardMaterial)) return;
      const dressedMaterial: Material = deps.dresser(prop.surfaces, source);
      const material: MeshStandardMaterial = dressedMaterial instanceof MeshStandardMaterial ? dressedMaterial.clone() : source.clone();
      makeGhost(material, zeroFlash, entry.propGhost);
      entry.propMaterials.push(material);
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = true;
    });
    entry.props.add(object);
  };

  const makeFigure = (entry: MomentEntry, figure: MomentFigure, echo: MomentEcho): FigureView | null => {
    const monster: MonsterDef | undefined = content.monsters.get(echo.monster);
    if (monster === undefined) return null;
    const rigId: string = echo.look?.rig ?? monster.rig;
    const wear: readonly string[] = echo.look?.wear ?? monster.wear;
    const gear: readonly string[] = echo.look?.gear ?? monster.gear;
    const loaded: LoadedRig | undefined = library.rigs.get(rigId);
    if (loaded === undefined || !hasWear(library, wornWearables(content, wear, null), gear)) return null;
    const ghost: GhostUniforms = createGhostUniforms(STILL, MOMENT_VIEW.echoMix);
    const rig: RigInstance = instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost });
    rig.setGear(gear);
    const worn: string[] = wornWearables(content, wear, null);
    rig.setWear(worn, hiddenBodyParts(content, worn));
    rig.root.position.set(figure.pos.x - entry.group.position.x, 0, figure.pos.z - entry.group.position.z);
    rig.root.rotation.y = figure.facing;
    rig.root.scale.setScalar(echo.look?.scale ?? monster.scale);
    const clip: AnimationClip = clipOf(rig, echo.pose.clip);
    const action: AnimationAction = rig.mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    action.time = echo.pose.at * clip.duration;
    action.timeScale = 0;
    rig.mixer.update(0);
    rig.setOpacity(0);
    entry.group.add(rig.root);
    return { rig, action, echo: figure.echo, ghost, shown: 0 };
  };

  const build = (moment: MomentState): MomentEntry => {
    const tint: Color = new Color(moment.def.tint);
    const lens: Color = tint.clone().lerp(WHITE, MOMENT_VIEW.lensWhite);
    const domeUniforms: SurfaceUniforms = surfaceUniforms(lens);
    const floorUniforms: SurfaceUniforms = surfaceUniforms(tint);
    const dome: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(domeGeometry, glowMaterial(DOME_VERTEX, DOME_FRAGMENT, domeUniforms));
    const floor: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(floorGeometry, glowMaterial(FLOOR_VERTEX, FLOOR_FRAGMENT, floorUniforms));
    dome.renderOrder = 6;
    floor.renderOrder = 3;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = MOMENT_VIEW.floorLift;
    dome.scale.setScalar(moment.def.radius);
    floor.scale.setScalar(moment.def.radius);
    dome.frustumCulled = false;
    dome.visible = !phone;
    const group: Group = new Group();
    group.position.set(moment.pos.x, 0, moment.pos.z);
    const props: Group = new Group();
    const propGhost: GhostUniforms = createGhostUniforms(STILL, 0);
    propGhost.rim.value = 0;
    const surface: SurfaceDef | undefined = content.surfaces.get(moment.def.ground);
    const ground: Mesh<BufferGeometry, MeshStandardMaterial> | null = surface === undefined ? null : new Mesh(groundOf(moment.def), groundMaterial(surface));
    if (ground !== null) {
      makeGhost(ground.material, zeroFlash, propGhost);
      ground.material.depthWrite = false;
      ground.position.y = MOMENT_VIEW.groundLift;
      ground.renderOrder = 2;
      ground.receiveShadow = true;
      group.add(ground);
    }
    group.add(floor, props, dome);
    const entry: MomentEntry = { group, dome, floor, ground, domeUniforms, floorUniforms, props, propGhost, propMaterials: [], figures: [], tint, lens, glow: new Color(moment.def.light), light: null, shown: 0, awake: 0, press: SLACK };
    scene.add(group);
    return entry;
  };

  const dressProps = (entry: MomentEntry, moment: MomentState): void => {
    const missing: boolean = moment.def.props.some((placed: MomentProp): boolean => {
      const prop: PropDef | undefined = content.props.get(placed.prop);
      return prop !== undefined && !models.has(prop.model);
    });
    if (!missing) {
      for (const placed of moment.def.props) placeProp(entry, placed);
      return;
    }
    const placeAll = async (): Promise<void> => {
      await loadProps([moment.def]);
      if (entries.get(moment.id) === entry) for (const placed of moment.def.props) placeProp(entry, placed);
    };
    placeAll().catch((): void => undefined);
  };

  const dressFigures = (entry: MomentEntry, moment: MomentState): void => {
    for (const figure of moment.figures) {
      if (figure.turned || entry.figures.some((view: FigureView): boolean => view.echo === figure.echo)) continue;
      const echo: MomentEcho | undefined = moment.def.echoes[figure.echo];
      const view: FigureView | null = echo === undefined ? null : makeFigure(entry, figure, echo);
      if (view !== null) entry.figures.push(view);
    }
  };

  const dispose = (entry: MomentEntry): void => {
    for (const figure of entry.figures) figure.rig.dispose();
    for (const material of entry.propMaterials) material.dispose();
    entry.dome.material.dispose();
    entry.floor.material.dispose();
    entry.ground?.material.dispose();
    if (entry.light !== null) {
      entry.light.intensity = 0;
      freeLights.push(entry.light);
    }
    entry.group.removeFromParent();
  };

  const strike = (moment: MomentState): void => {
    const color: Color = STRIKE_WHITE.clone().lerp(new Color(moment.def.tint), 0.25);
    const bolt: Mesh<BufferGeometry, MeshBasicMaterial> = skyBolt(color);
    bolt.position.set(moment.pos.x, 0, moment.pos.z);
    scene.add(bolt);
    flashes.push({ object: bolt, duration: MOMENT_VIEW.boltTime, age: 0 });
    const arcs: Mesh<BufferGeometry, MeshBasicMaterial> = groundArcs(color, moment.def.radius);
    arcs.position.set(moment.pos.x, MOMENT_VIEW.floorLift, moment.pos.z);
    scene.add(arcs);
    flashes.push({ object: arcs, duration: MOMENT_VIEW.arcTime, age: 0 });
    deps.flash(moment.def.bright ? MOMENT_VIEW.brightFlash : MOMENT_VIEW.flashPower);
    deps.trauma(MOMENT_VIEW.strikeTrauma);
  };

  const stepEntry = (entry: MomentEntry, moment: MomentState, world: World, dt: number): void => {
    const marking: boolean = moment.phase === 'mark';
    const fade: number = fadeOf(moment, world);
    entry.shown = easeToward(entry.shown, marking ? 0 : 1, MOMENT_VIEW.appearRate, dt);
    entry.awake = easeToward(entry.awake, moment.phase === 'awake' ? 1 : 0, MOMENT_VIEW.wakeRate, dt);
    const reach: number = distance(world.player.pos, moment.pos);
    entry.press = stepPress(entry.press, moment.phase === 'awake' && world.player.alive ? pressTarget(reach, moment.def.radius) : 0, dt);
    const angle: number = pressAngle(world.player.pos, moment.pos);
    for (const uniforms of [entry.domeUniforms, entry.floorUniforms]) {
      uniforms.uPress.value = entry.press.level;
      uniforms.uAngle.value = angle;
    }
    const strength: number = entry.shown * (1 - fade);
    entry.domeUniforms.uStrength.value = MOMENT_VIEW.domeAlpha * strength * (1 + entry.awake * 0.5);
    entry.floorUniforms.uStrength.value = MOMENT_VIEW.floorAlpha * strength * (1 + entry.awake * 0.4);
    entry.floorUniforms.uMark.value = marking ? MOMENT_VIEW.markAlpha * (0.6 + 0.4 * Math.sin(clock * MOMENT_VIEW.markPulse)) : 0;
    entry.floorUniforms.uTint.value.copy(marking ? MARK : entry.lens);
    entry.domeUniforms.uTime.value = clock * MOMENT_VIEW.shimmerSpeed;
    entry.floorUniforms.uTime.value = clock * MOMENT_VIEW.shimmerSpeed;
    entry.dome.scale.setScalar(moment.def.radius * (0.6 + 0.4 * entry.shown));
    entry.propGhost.dissolve.value = marking ? 1 : Math.max(1 - entry.shown, fade);
    entry.propGhost.mix.value = MOMENT_VIEW.stillMix * (1 - entry.awake);
    entry.group.position.set(moment.pos.x, 0, moment.pos.z);
    if (entry.light === null && !marking) entry.light = freeLights.pop() ?? null;
    if (entry.light !== null) {
      entry.light.color.copy(entry.glow);
      entry.light.position.set(moment.pos.x, MOMENT_VIEW.lightHeight, moment.pos.z);
      entry.light.distance = moment.def.radius * MOMENT_VIEW.lightReach;
      entry.light.intensity = (MOMENT_VIEW.dormantLight + (MOMENT_VIEW.awakeLight - MOMENT_VIEW.dormantLight) * entry.awake) * strength;
    }
    for (const view of entry.figures) {
      const figure: MomentFigure | undefined = moment.figures.find((candidate: MomentFigure): boolean => candidate.echo === view.echo);
      const gone: boolean = figure?.turned === true;
      view.shown = gone ? Math.max(0, view.shown - dt / MOMENT_VIEW.turnFade) : easeToward(view.shown, marking ? 0 : 1, MOMENT_VIEW.appearRate, dt);
      view.action.timeScale = moment.phase === 'awake' ? 1 : 0;
      view.rig.mixer.update(dt);
      view.rig.setOpacity((MOMENT_VIEW.echoOpacity + (MOMENT_VIEW.awakeOpacity - MOMENT_VIEW.echoOpacity) * entry.awake) * view.shown * (1 - fade * 0.5));
      view.ghost.dissolve.value = Math.max(fade, 1 - view.shown);
      view.ghost.mix.value = MOMENT_VIEW.echoMix + MOMENT_VIEW.stillMix * (1 - entry.awake);
      view.ghost.rim.value = MOMENT_VIEW.echoRim + entry.awake * MOMENT_VIEW.echoRimAwake;
      view.rig.root.visible = view.shown > 0;
      if (figure !== undefined) view.rig.root.position.set(figure.pos.x - moment.pos.x, 0, figure.pos.z - moment.pos.z);
    }
  };

  const clear = (): void => {
    for (const entry of entries.values()) dispose(entry);
    entries.clear();
    for (const flash of flashes) {
      disposeObject(flash.object);
      flash.object.removeFromParent();
    }
    flashes.length = 0;
  };

  const view: MomentView = {
    handle(events: readonly WorldEvent[]): void {
      for (const event of events) {
        if (event.type === 'moment_strike') strike(event.moment);
        if (event.type === 'zone_changed') clear();
      }
    },
    update(dt: number, world: World): void {
      if (warmed !== null && !warming && library.rigs.size !== warmedRigs) {
        warming = true;
        view
          .prepare(warmed.renderer, warmed.camera)
          .catch((): void => undefined)
          .finally((): void => {
            warming = false;
          });
      }
      clock += dt;
      const live: Set<number> = new Set<number>();
      for (const moment of world.moments) {
        live.add(moment.id);
        let entry: MomentEntry | undefined = entries.get(moment.id);
        if (entry === undefined) {
          entry = build(moment);
          entries.set(moment.id, entry);
          dressProps(entry, moment);
        }
        if (moment.phase !== 'fading' && entry.figures.length < moment.figures.length) dressFigures(entry, moment);
        stepEntry(entry, moment, world, dt);
      }
      for (const [id, entry] of entries) {
        if (live.has(id)) continue;
        dispose(entry);
        entries.delete(id);
      }
      for (let index: number = flashes.length - 1; index >= 0; index -= 1) {
        const flash: Flash | undefined = flashes[index];
        if (flash === undefined) continue;
        flash.age += dt;
        const left: number = 1 - flash.age / flash.duration;
        flash.object.material.opacity = Math.max(0, left);
        if (left > 0) continue;
        disposeObject(flash.object);
        flash.object.removeFromParent();
        flashes.splice(index, 1);
      }
    },
    async prepare(renderer: WebGLRenderer, camera: Camera): Promise<void> {
      warmed = { renderer, camera };
      warmedRigs = library.rigs.size;
      await loadProps(content.moments.defs.values());
      const warm: MomentEntry[] = [];
      for (const def of content.moments.defs.values()) {
        const moment: MomentState = { id: -1, def, combat: false, level: 1, pos: { x: 0, z: 0 }, phase: 'dormant', timeLeft: 1, phaseTime: 0, armed: false, away: 0, entered: false, bounty: 0, blocks: null, outcome: null, figures: def.echoes.map((echo: MomentEcho, index: number): MomentFigure => ({ echo: index, pos: { x: echo.x, z: echo.z }, facing: 0, turned: false, monsterId: null })) };
        const entry: MomentEntry = build(moment);
        for (const placed of def.props) placeProp(entry, placed);
        dressFigures(entry, moment);
        for (const figure of entry.figures) figure.rig.setOpacity(1);
        warm.push(entry);
      }
      const bolt: Mesh<BufferGeometry, MeshBasicMaterial> = skyBolt(STRIKE_WHITE);
      const arcs: Mesh<BufferGeometry, MeshBasicMaterial> = groundArcs(STRIKE_WHITE, 4);
      scene.add(bolt, arcs);
      renderer.compile(scene, camera);
      for (const entry of warm) {
        entry.group.traverse((object: Object3D): void => {
          if (!(object instanceof Mesh)) return;
          const materials: readonly unknown[] = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) if (material instanceof MeshStandardMaterial) for (const texture of [material.map, material.normalMap, material.roughnessMap, material.emissiveMap]) if (texture !== null) renderer.initTexture(texture);
        });
        entry.group.visible = false;
      }
      bolt.visible = false;
      arcs.visible = false;
      for (const entry of kept) dispose(entry);
      for (const old of keptStrike) old.removeFromParent();
      kept = warm;
      keptStrike = [bolt, arcs];
    },
    showWarm(x: number, z: number): () => void {
      const shown: Object3D[] = [...kept.map((entry: MomentEntry): Object3D => entry.group), ...keptStrike];
      const before: { readonly object: Object3D; readonly x: number; readonly z: number }[] = shown.map((object: Object3D): { readonly object: Object3D; readonly x: number; readonly z: number } => ({ object, x: object.position.x, z: object.position.z }));
      for (const object of shown) {
        object.position.x = x;
        object.position.z = z;
        object.visible = true;
      }
      return (): void => {
        for (const entry of before) {
          entry.object.position.x = entry.x;
          entry.object.position.z = entry.z;
          entry.object.visible = false;
        }
      };
    },
    clear,
  };
  return view;
}

import type { AnimationAction, AnimationClip, BufferGeometry, Camera, IUniform, Material, MeshBasicMaterial, Object3D, Scene, WebGLRenderer } from 'three';
import { AdditiveBlending, CircleGeometry, Color, Group, LoopRepeat, Mesh, MeshStandardMaterial, PointLight, ShaderMaterial, SphereGeometry } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MomentDef, MomentEcho, MomentProp } from '../../sim/content/moment-types.ts';
import type { Content, MonsterDef, PropDef } from '../../sim/content/types.ts';
import { wornWearables, hiddenBodyParts } from '../../sim/wear.ts';
import type { MomentFigure, MomentState, World, WorldEvent } from '../../sim/world/types.ts';
import type { QualityTier } from '../mobile/quality.ts';
import type { CharacterLibrary, Dresser, LoadedRig, RigInstance } from './character-loader.ts';
import { hasWear, instantiateRig, loadModel } from './character-loader.ts';
import { disposeObject, groundArcs, skyBolt } from './effect-shapes.ts';
import type { GhostUniforms } from './ghost-material.ts';
import { createGhostUniforms, makeGhost } from './ghost-material.ts';

export const MOMENT_VIEW = {
  domeSegments: 40,
  domeRings: 14,
  phoneDomeSegments: 20,
  phoneDomeRings: 8,
  floorSegments: 48,
  floorLift: 0.04,
  domeAlpha: 0.2,
  floorAlpha: 0.42,
  shimmerSpeed: 1.3,
  appearRate: 5.5,
  wakeRate: 3,
  turnFade: 0.35,
  echoMix: 0.82,
  echoOpacity: 0.62,
  awakeOpacity: 0.8,
  lightHeight: 3.2,
  lightReach: 1.8,
  dormantLight: 14,
  awakeLight: 30,
  warmth: 0.45,
  lightDecay: 1.4,
  desktopLights: 4,
  phoneLights: 1,
  boltTime: 0.32,
  arcTime: 0.45,
  flashPower: 0.55,
  brightFlash: 0.8,
  strikeTrauma: 0.22,
  markRings: 3,
  markAlpha: 0.5,
  markPulse: 9,
} as const;

const WARM: Color = new Color(0xffe2b8);
const STRIKE_WHITE: Color = new Color(0xe8f2ff);
const MARK: Color = new Color(0xb8d2ff);

const DOME_VERTEX: string = [
  'varying vec3 vNormalView;',
  'varying vec3 vViewDir;',
  'varying float vHeight;',
  'varying float vAround;',
  'void main() {',
  '  vec4 view = modelViewMatrix * vec4(position, 1.0);',
  '  vNormalView = normalize(normalMatrix * normal);',
  '  vViewDir = normalize(-view.xyz);',
  '  vHeight = position.y;',
  '  vAround = atan(position.z, position.x);',
  '  gl_Position = projectionMatrix * view;',
  '}',
].join('\n');

const DOME_FRAGMENT: string = [
  'uniform vec3 uTint;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'uniform float uDissolve;',
  'varying vec3 vNormalView;',
  'varying vec3 vViewDir;',
  'varying float vHeight;',
  'varying float vAround;',
  'void main() {',
  '  float facing = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir)));',
  '  float rim = pow(facing, 3.4);',
  '  float shimmer = 0.5 + 0.5 * sin(uTime * 2.1 + vAround * 5.0 + vHeight * 7.0);',
  '  float foot = smoothstep(0.0, 0.18, vHeight);',
  '  float speck = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);',
  '  if (speck < uDissolve) discard;',
  '  float alpha = (rim * (0.75 + 0.25 * shimmer) + 0.05) * foot * uStrength;',
  '  gl_FragColor = vec4(uTint * alpha, alpha);',
  '}',
].join('\n');

const FLOOR_VERTEX: string = ['varying vec2 vPlane;', 'void main() {', '  vPlane = position.xy;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

const FLOOR_FRAGMENT: string = [
  'uniform vec3 uTint;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'uniform float uDissolve;',
  'uniform float uMark;',
  'varying vec2 vPlane;',
  'void main() {',
  '  float d = length(vPlane);',
  '  float pool = smoothstep(1.0, 0.55, d);',
  '  float edge = smoothstep(0.82, 0.96, d) * smoothstep(1.0, 0.96, d);',
  '  float ripple = 0.5 + 0.5 * sin(d * 18.0 - uTime * 2.6);',
  '  float speck = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(39.3468, 11.135))) * 43758.5453);',
  '  if (speck < uDissolve) discard;',
  '  float rings = uMark * smoothstep(0.08, 0.0, abs(fract(d * 3.0 - uTime * 1.5) - 0.5)) * smoothstep(1.0, 0.85, d);',
  '  float alpha = ((pool * (0.55 + 0.15 * ripple) + edge * 0.9) * uStrength + rings) ;',
  '  gl_FragColor = vec4(uTint * alpha, alpha);',
  '}',
].join('\n');

interface SurfaceUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uTint: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
  readonly uDissolve: IUniform<number>;
  readonly uMark: IUniform<number>;
}

function surfaceUniforms(tint: Color): SurfaceUniforms {
  return { uTint: { value: tint.clone() }, uStrength: { value: 0 }, uTime: { value: 0 }, uDissolve: { value: 0 }, uMark: { value: 0 } };
}

function surfaceMaterial(vertex: string, fragment: string, uniforms: SurfaceUniforms): ShaderMaterial {
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
  readonly domeUniforms: SurfaceUniforms;
  readonly floorUniforms: SurfaceUniforms;
  readonly props: Group;
  readonly propGhost: GhostUniforms;
  readonly propMaterials: MeshStandardMaterial[];
  readonly figures: FigureView[];
  readonly tint: Color;
  light: PointLight | null;
  shown: number;
  awake: number;
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

export function createMomentView(deps: MomentViewDeps): MomentView {
  const { scene, content, library } = deps;
  const phone: boolean = deps.tier.name === 'mobile';
  const domeGeometry: SphereGeometry = new SphereGeometry(1, phone ? MOMENT_VIEW.phoneDomeSegments : MOMENT_VIEW.domeSegments, phone ? MOMENT_VIEW.phoneDomeRings : MOMENT_VIEW.domeRings, 0, Math.PI * 2, 0, Math.PI / 2);
  const floorGeometry: CircleGeometry = new CircleGeometry(1, MOMENT_VIEW.floorSegments);
  const entries: Map<number, MomentEntry> = new Map<number, MomentEntry>();
  let kept: MomentEntry[] = [];
  let warmed: WarmTarget | null = null;
  let warmedRigs: number = 0;
  let warming: boolean = false;
  const flashes: Flash[] = [];
  const models: Map<string, GLTF> = new Map<string, GLTF>();
  const lights: PointLight[] = [];
  const zeroFlash: IUniform<Color> = { value: new Color(0, 0, 0) };
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
      models.set(model, await loadModel(deps.loader, model));
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
    const ghost: GhostUniforms = createGhostUniforms(entry.tint, MOMENT_VIEW.echoMix);
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
    const domeUniforms: SurfaceUniforms = surfaceUniforms(tint);
    const floorUniforms: SurfaceUniforms = surfaceUniforms(tint);
    const dome: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(domeGeometry, surfaceMaterial(DOME_VERTEX, DOME_FRAGMENT, domeUniforms));
    const floor: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(floorGeometry, surfaceMaterial(FLOOR_VERTEX, FLOOR_FRAGMENT, floorUniforms));
    dome.renderOrder = 6;
    floor.renderOrder = 3;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = MOMENT_VIEW.floorLift;
    dome.scale.setScalar(moment.def.radius);
    floor.scale.setScalar(moment.def.radius);
    dome.frustumCulled = false;
    const group: Group = new Group();
    group.position.set(moment.pos.x, 0, moment.pos.z);
    const props: Group = new Group();
    group.add(floor, props, dome);
    const entry: MomentEntry = { group, dome, floor, domeUniforms, floorUniforms, props, propGhost: createGhostUniforms(tint, 0), propMaterials: [], figures: [], tint, light: null, shown: 0, awake: 0 };
    entry.propGhost.rim.value = 0;
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
    const strength: number = entry.shown * (1 - fade);
    entry.domeUniforms.uStrength.value = MOMENT_VIEW.domeAlpha * strength * (1 + entry.awake * 0.5);
    entry.floorUniforms.uStrength.value = MOMENT_VIEW.floorAlpha * strength * (1 + entry.awake * 0.4);
    entry.floorUniforms.uMark.value = marking ? MOMENT_VIEW.markAlpha * (0.6 + 0.4 * Math.sin(clock * MOMENT_VIEW.markPulse)) : 0;
    entry.floorUniforms.uTint.value.copy(marking ? MARK : entry.tint);
    entry.domeUniforms.uDissolve.value = fade;
    entry.floorUniforms.uDissolve.value = fade;
    entry.domeUniforms.uTime.value = clock * MOMENT_VIEW.shimmerSpeed;
    entry.floorUniforms.uTime.value = clock * MOMENT_VIEW.shimmerSpeed;
    entry.dome.scale.setScalar(moment.def.radius * (0.6 + 0.4 * entry.shown));
    entry.propGhost.dissolve.value = marking ? 1 : Math.max(1 - entry.shown, fade);
    entry.group.position.set(moment.pos.x, 0, moment.pos.z);
    if (entry.light === null && !marking) entry.light = freeLights.pop() ?? null;
    if (entry.light !== null) {
      entry.light.color.copy(entry.tint).lerp(WARM, MOMENT_VIEW.warmth);
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
      view.ghost.rim.value = 1 + entry.awake * 0.6;
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
          dressFigures(entry, moment);
        }
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
        const moment: MomentState = { id: -1, def, combat: false, level: 1, pos: { x: 0, z: 0 }, phase: 'dormant', timeLeft: 1, phaseTime: 0, armed: false, outcome: null, figures: def.echoes.map((echo: MomentEcho, index: number): MomentFigure => ({ echo: index, pos: { x: echo.x, z: echo.z }, facing: 0, turned: false, monsterId: null })) };
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
      kept = warm;
    },
    clear,
  };
  return view;
}

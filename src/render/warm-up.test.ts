import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Camera, Object3D } from 'three';
import { BufferAttribute, BufferGeometry, Color, Fog, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, ShaderMaterial, Texture, WebGLRenderTarget } from 'three';
import type { Timers } from '../backend/backend.ts';
import type { FramePacer } from './paced-work.ts';
import type { ShaderCompiler, Sortable } from './warm-up.ts';
import { drawCost, texturesOf, unsorted, uploadPaced, WARM_UP, warmUp, warmUpWithin } from './warm-up.ts';

interface Recorder extends ShaderCompiler {
  readonly seen: boolean[];
  finish(): void;
}

function recorder(standIn: Object3D): Recorder {
  const seen: boolean[] = [];
  const finishers: (() => void)[] = [];
  return {
    seen,
    finish: (): void => {
      for (const finish of finishers) finish();
    },
    compileAsync(scene: Object3D, _camera: Camera): Promise<Object3D> {
      let inScene: boolean = false;
      scene.traverse((object: Object3D): void => {
        if (object === standIn) inScene = true;
      });
      seen.push(inScene);
      return new Promise<Object3D>((resolve: (value: Object3D) => void): void => {
        finishers.push((): void => resolve(scene));
      });
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
}

interface ManualTimers {
  readonly timers: Timers;
  pending(): number;
  fire(): void;
}

function manualTimers(): ManualTimers {
  const tasks: (() => void)[] = [];
  return {
    timers: {
      after: (_ms: number, task: () => void): (() => void) => {
        tasks.push(task);
        return (): void => {
          const index: number = tasks.indexOf(task);
          if (index >= 0) tasks.splice(index, 1);
        };
      },
    },
    pending: (): number => tasks.length,
    fire: (): void => {
      for (const task of tasks.splice(0, tasks.length)) task();
    },
  };
}

const PACER: FramePacer = { now: (): number => 0, next: (): Promise<void> => Promise.resolve() };

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function tracked(promise: Promise<void>): { settled(): boolean } {
  let done: boolean = false;
  void promise.finally((): void => {
    done = true;
  });
  return { settled: (): boolean => done };
}

void test('stand-ins are compiled while loose and are loose again afterwards', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = new Mesh();
  const compiler: Recorder = recorder(standIn);
  const done: Promise<void> = warmUp(compiler, scene, new PerspectiveCamera(), [standIn], null, PACER);
  await settle();
  assert.deepEqual(compiler.seen, [true]);
  assert.equal(scene.children.length, 0);
  assert.equal(standIn.parent, null);
  compiler.finish();
  await done;
});

void test('a compiler that throws at once still ends the warm-up and leaves the scene clean', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = new Mesh();
  const throwing: ShaderCompiler = {
    compileAsync(_target: Object3D, _camera: Camera): Promise<Object3D> {
      throw new Error('no context');
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUp(throwing, scene, new PerspectiveCamera(), [standIn], null, PACER);
  assert.equal(scene.children.length, 0);
  assert.equal(standIn.parent, null);
});

void test('a warm-up that outlasts its wait holds the game only until the wait ends', async (): Promise<void> => {
  const standIn: Mesh = new Mesh();
  const compiler: Recorder = recorder(standIn);
  const clock: ManualTimers = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [standIn], clock.timers, 1, null, PACER);
  const watched: { settled(): boolean } = tracked(done);
  await settle();
  assert.equal(watched.settled(), false);
  assert.equal(clock.pending(), 1);
  clock.fire();
  await settle();
  assert.equal(watched.settled(), true);
  compiler.finish();
});

void test('a warm-up that finishes in time cancels its wait', async (): Promise<void> => {
  const standIn: Mesh = new Mesh();
  const compiler: Recorder = recorder(standIn);
  const clock: ManualTimers = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [standIn], clock.timers, 1, null, PACER);
  assert.equal(clock.pending(), 1);
  await settle();
  compiler.finish();
  await done;
  assert.equal(clock.pending(), 0);
});

void test('hidden meshes are compiled, then drawn once without culling, and are hidden and culled again afterwards', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const later: Group = new Group();
  later.visible = false;
  const piece: Mesh = new Mesh();
  piece.visible = false;
  later.add(piece);
  scene.add(later);
  const compiledShown: boolean[] = [];
  const drawnShown: boolean[] = [];
  const seenBy = (target: Object3D, into: boolean[]): void => {
    let shown: boolean = false;
    target.traverseVisible((object: Object3D): void => {
      if (object === piece && !object.frustumCulled) shown = true;
    });
    into.push(shown);
  };
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      let shown: boolean = false;
      target.traverseVisible((object: Object3D): void => {
        if (object === piece) shown = true;
      });
      compiledShown.push(shown);
      return Promise.resolve(target);
    },
    drawOnce(target: Object3D): void {
      seenBy(target, drawnShown);
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiledShown, [true]);
  assert.deepEqual(drawnShown, [true]);
  assert.equal(later.visible, false);
  assert.equal(piece.visible, false);
  assert.equal(piece.frustumCulled, true);
});

void test('each mesh is compiled alone, without the meshes it holds, in a small scene with only the lights the frame has, and the real scene is never compiled whole', async (): Promise<void> => {
  const scene: Scene = new Scene();
  scene.fog = new Fog(0x223344, 1, 50);
  scene.environment = new Texture();
  const lit: PointLight = new PointLight();
  const off: PointLight = new PointLight();
  off.visible = false;
  const hiddenGroup: Group = new Group();
  hiddenGroup.visible = false;
  const tucked: PointLight = new PointLight();
  const inside: Mesh = new Mesh();
  hiddenGroup.add(tucked, inside);
  const outside: Mesh = new Mesh();
  const held: Mesh = new Mesh();
  outside.add(held);
  scene.add(lit, off, hiddenGroup, outside);
  const compiled: Object3D[][] = [];
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      assert.ok(target instanceof Scene);
      assert.notEqual(target, scene);
      assert.equal(target.fog, scene.fog);
      assert.equal(target.environment, scene.environment);
      const reached: Object3D[] = [];
      target.traverse((object: Object3D): void => {
        if (object !== target) reached.push(object);
      });
      compiled.push(reached);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiled, [
    [lit, inside],
    [lit, outside],
    [lit, held],
  ]);
  assert.equal(hiddenGroup.visible, false);
  assert.equal(off.visible, false);
  assert.equal(held.parent, outside);
  assert.deepEqual(outside.children, [held]);
});

void test('a mesh compiled by one warm-up is not compiled by the next, and one added since is', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const first: Mesh = new Mesh();
  scene.add(first);
  const compiled: Object3D[][] = [];
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      compiled.push([...target.children]);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  const second: Mesh = new Mesh();
  scene.add(second);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, PACER);
  assert.deepEqual(compiled, [[first], [second]]);
});

void test('a warm-up that finds a mesh another warm-up is still compiling waits for that compile before it draws', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const mesh: Mesh = new Mesh();
  scene.add(mesh);
  const compiler: Recorder = recorder(mesh);
  let draws: number = 0;
  const counting: ShaderCompiler = { ...compiler, drawOnce: (): void => void (draws += 1) };
  const first: Promise<void> = warmUp(counting, scene, new PerspectiveCamera(), [], null, PACER);
  await settle();
  const second: Promise<void> = warmUp(counting, scene, new PerspectiveCamera(), [], null, PACER);
  await settle();
  assert.deepEqual([compiler.seen.length, draws], [1, 0]);
  compiler.finish();
  await Promise.all([first, second]);
  assert.equal(draws, 1);
});

interface ClockPacer extends FramePacer {
  frame(): number;
  spend(ms: number): void;
}

function clockPacer(perRead: number): ClockPacer {
  let clock: number = 0;
  let frame: number = 0;
  return {
    frame: (): number => frame,
    spend: (ms: number): void => {
      clock += ms;
    },
    now: (): number => {
      clock += perRead;
      return clock;
    },
    next: (): Promise<void> => {
      frame += 1;
      return Promise.resolve();
    },
  };
}

void test('compiles are spread over frames, each frame stopping once its time budget is spent', async (): Promise<void> => {
  const scene: Scene = new Scene();
  for (let index: number = 0; index < 6; index += 1) scene.add(new Mesh());
  const pacer: ClockPacer = clockPacer(0);
  const frames: number[] = [];
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      frames.push(pacer.frame());
      pacer.spend(4);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, pacer);
  assert.deepEqual(frames, [0, 0, 1, 1, 2, 2]);
});

void test('the survey of a large scene is spread over frames, and every mesh in it is still compiled', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const meshes: Mesh[] = [];
  for (let index: number = 0; index < 30; index += 1) meshes.push(new Mesh());
  scene.add(...meshes);
  const pacer: ClockPacer = clockPacer(1);
  const compiled: Object3D[] = [];
  let firstFrame: number = -1;
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      if (firstFrame < 0) firstFrame = pacer.frame();
      compiled.push(...target.children);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, pacer);
  assert.ok(firstFrame >= 4);
  assert.deepEqual(compiled, meshes);
});

void test('a warm-up told of things still loading warms again once they are in', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const compiled: number[] = [];
  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      compiled.push(target.children.length);
      return Promise.resolve(target);
    },
    drawOnce(): void {},
    initTexture(): void {},
  };
  const arrivals: (() => void)[] = [];
  const loading: Promise<void> = new Promise<void>((resolve: () => void): void => {
    arrivals.push(resolve);
  });
  await warmUp(compiler, scene, new PerspectiveCamera(), [], loading, PACER);
  assert.equal(compiled.length, 0);
  scene.add(new Mesh());
  for (const arrive of arrivals) arrive();
  await settle();
  assert.deepEqual(compiled, [1]);
});

void test('a stand-in that goes live while its shaders compile stays in the scene through the late draw, and the later warm-up does not compile it again', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = new Mesh();
  const compiler: Recorder = recorder(standIn);
  const arrivals: (() => void)[] = [];
  const loading: Promise<void> = new Promise<void>((resolve: () => void): void => {
    arrivals.push(resolve);
  });
  const done: Promise<void> = warmUp(compiler, scene, new PerspectiveCamera(), [standIn], loading, PACER);
  await settle();
  assert.equal(standIn.parent, null);
  scene.add(standIn);
  compiler.finish();
  await done;
  assert.equal(standIn.parent, scene);
  for (const arrive of arrivals) arrive();
  await settle();
  compiler.finish();
  await settle();
  assert.deepEqual(compiler.seen, [true]);
  assert.equal(standIn.parent, scene);
});

interface CountingPacer extends FramePacer {
  frame(): number;
}

function countingPacer(): CountingPacer {
  let frame: number = 0;
  return {
    frame: (): number => frame,
    now: (): number => 0,
    next: (): Promise<void> => {
      frame += 1;
      return Promise.resolve();
    },
  };
}

function sizedTexture(width: number, height: number): Texture {
  const texture: Texture = new Texture();
  texture.image = { width, height };
  return texture;
}

function sizedMesh(bytes: number): Mesh {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(bytes / Float32Array.BYTES_PER_ELEMENT), 3));
  return new Mesh(geometry);
}

void test('textures are uploaded over several frames, no frame past its byte budget', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const side: number = Math.floor(Math.sqrt(WARM_UP.textureBytesPerFrame / WARM_UP.bytesPerTexel / WARM_UP.mipmapShare / 2) * Math.SQRT2);
  for (let index: number = 0; index < 3; index += 1) scene.add(new Mesh(undefined, new MeshStandardMaterial({ map: sizedTexture(side, side) })));
  const pacer: CountingPacer = countingPacer();
  const uploads: number[] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(): void {},
    initTexture(): void {
      uploads.push(pacer.frame());
    },
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, pacer);
  assert.deepEqual(uploads, [0, 1, 2]);
});

function drawnIn(target: Object3D, object: Object3D): boolean {
  let found: boolean = false;
  target.traverseVisible((seen: Object3D): void => {
    if (seen === object) found = true;
  });
  return found;
}

void test('the scene is drawn in slices with the real camera, each draw holding only its slice and every light, and nothing is left hidden', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const light: PointLight = new PointLight();
  scene.add(light);
  const share: number = Math.floor((WARM_UP.drawCostPerFrame / 2 - WARM_UP.drawFixedCost) / 12) * 12;
  const meshes: Mesh[] = [sizedMesh(share), sizedMesh(share), sizedMesh(share), sizedMesh(share), sizedMesh(share)];
  scene.add(...meshes);
  const camera: PerspectiveCamera = new PerspectiveCamera();
  const slices: number[][] = [];
  const lit: boolean[] = [];
  const masks: number[] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D, viewer: Camera): void {
      slices.push(meshes.flatMap((mesh: Mesh, index: number): number[] => (drawnIn(target, mesh) ? [index] : [])));
      lit.push(drawnIn(target, light));
      masks.push(viewer.layers.mask);
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, camera, [], null, countingPacer());
  assert.deepEqual(slices, [[0, 1], [2, 3], [4]]);
  assert.deepEqual(lit, [true, true, true]);
  assert.deepEqual(masks, [1, 1, 1]);
  for (const mesh of meshes) assert.equal(mesh.visible, true);
});

void test('a slice draws its own meshes without the meshes that hold them or that they hold, and shows a hidden one only for its own draw', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const share: number = Math.floor((WARM_UP.drawCostPerFrame - WARM_UP.drawFixedCost) / 12) * 12;
  const holder: Mesh = sizedMesh(share);
  const held: Mesh = sizedMesh(share);
  holder.add(held);
  scene.add(holder);
  const hidden: Mesh = sizedMesh(12);
  hidden.visible = false;
  scene.add(hidden);
  const masks: number[] = [];
  const shown: boolean[][] = [];
  const camera: PerspectiveCamera = new PerspectiveCamera();
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D, viewer: Camera): void {
      masks.push(viewer.layers.mask);
      shown.push([drawnIn(target, holder), drawnIn(target, held), drawnIn(target, hidden)]);
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, camera, [], null, countingPacer());
  assert.deepEqual(shown, [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ]);
  assert.deepEqual(masks, [1, 1, 1]);
  assert.equal(holder.visible, true);
  assert.equal(held.visible, true);
  assert.equal(hidden.visible, false);
  assert.equal(held.parent, holder);
  assert.equal(holder.parent, scene);
});

void test('a slice is drawn in a small scene of its own that shares the real scene\'s fog, environment and background, and the real scene is not drawn whole', async (): Promise<void> => {
  const scene: Scene = new Scene();
  scene.fog = new Fog(0x223344, 1, 50);
  scene.environment = new Texture();
  scene.background = new Color(0x112233);
  const meshes: Mesh[] = threeHalfSlices(scene);
  const targets: Object3D[] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D): void {
      targets.push(target);
      assert.ok(target instanceof Scene);
      assert.notEqual(target, scene);
      assert.equal(target.fog, scene.fog);
      assert.equal(target.environment, scene.environment);
      assert.equal(target.background, scene.background);
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  assert.equal(targets.length, 2);
  for (const mesh of meshes) assert.equal(mesh.parent, scene);
  for (const target of targets) assert.equal(target.children.length, 0);
});

void test('a mesh drawn by one warm-up is not drawn again by the next, and one added since is', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const first: Mesh = sizedMesh(12);
  scene.add(first);
  const drawn: Object3D[][] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D): void {
      drawn.push([...target.children]);
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  const second: Mesh = sizedMesh(12);
  scene.add(second);
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  assert.deepEqual(drawn, [[first], [second]]);
});

void test('a texture warmed once is not uploaded again by a later warm-up', async (): Promise<void> => {
  const scene: Scene = new Scene();
  scene.add(new Mesh(undefined, new MeshStandardMaterial({ map: sizedTexture(4, 4) })));
  let uploads: number = 0;
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(): void {},
    initTexture(): void {
      uploads += 1;
    },
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  assert.equal(uploads, 1);
});

void test('a texture changed after its warm-up, such as one given sharper filtering, is uploaded again by the next warm-up instead of on a drawn frame', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const map: Texture = sizedTexture(4, 4);
  scene.add(new Mesh(undefined, new MeshStandardMaterial({ map })));
  let uploads: number = 0;
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(): void {},
    initTexture(): void {
      uploads += 1;
    },
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  map.anisotropy = 8;
  map.needsUpdate = true;
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, countingPacer());
  assert.equal(uploads, 2);
});

function pacerThatOnFrame(frame: number, act: () => void): FramePacer {
  let frames: number = 0;
  return {
    now: (): number => 0,
    next: (): Promise<void> => {
      frames += 1;
      if (frames === frame) act();
      return Promise.resolve();
    },
  };
}

function threeHalfSlices(scene: Scene): Mesh[] {
  const share: number = Math.floor((WARM_UP.drawCostPerFrame / 2 - WARM_UP.drawFixedCost) / 12) * 12;
  const meshes: Mesh[] = [sizedMesh(share), sizedMesh(share), sizedMesh(share)];
  scene.add(...meshes);
  return meshes;
}

void test('a mesh is charged only for its own geometry, since its slice draws it without the mesh that holds it', (): void => {
  const holder: Mesh = sizedMesh(1200);
  const held: Mesh = sizedMesh(120);
  holder.add(held);
  assert.equal(drawCost(held), WARM_UP.drawFixedCost + 120);
  assert.equal(drawCost(holder), WARM_UP.drawFixedCost + 1200);
});

void test('something added to the scene while the slices are paced is hidden from the later slices', async (): Promise<void> => {
  const scene: Scene = new Scene();
  threeHalfSlices(scene);
  const late: Mesh = sizedMesh(12);
  const shown: boolean[] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D): void {
      shown.push(drawnIn(target, late));
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, pacerThatOnFrame(2, (): void => {
    scene.add(late);
  }));
  assert.deepEqual(shown, [false, false]);
  assert.equal(late.visible, true);
});

void test('a slice whose meshes have all left the scene is not drawn', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const meshes: Mesh[] = threeHalfSlices(scene);
  let draws: number = 0;
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(): void {
      draws += 1;
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [], null, pacerThatOnFrame(2, (): void => {
    for (const mesh of meshes) mesh.removeFromParent();
  }));
  assert.equal(draws, 1);
});

void test('a loose stand-in is drawn in its own slice and is loose again afterwards', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = sizedMesh(12);
  const drawn: boolean[] = [];
  const compiler: ShaderCompiler = {
    compileAsync: (target: Object3D): Promise<Object3D> => Promise.resolve(target),
    drawOnce(target: Object3D): void {
      drawn.push(drawnIn(target, standIn));
    },
    initTexture(): void {},
  };
  await warmUp(compiler, scene, new PerspectiveCamera(), [standIn], null, countingPacer());
  assert.deepEqual(drawn, [true]);
  assert.equal(standIn.parent, null);
  assert.equal(scene.children.length, 0);
});

void test('the textures of a root are its materials\' maps and uniform textures that have an image, never a render target', (): void => {
  const root: Group = new Group();
  const map: Texture = sizedTexture(4, 4);
  const uniform: Texture = sizedTexture(8, 8);
  const empty: Texture = new Texture();
  const target: WebGLRenderTarget = new WebGLRenderTarget(4, 4);
  root.add(new Mesh(undefined, new MeshStandardMaterial({ map, roughnessMap: empty })));
  root.add(new Mesh(undefined, new ShaderMaterial({ uniforms: { picture: { value: uniform }, drawn: { value: target.texture } } })));
  const hidden: Mesh = new Mesh(undefined, new MeshStandardMaterial({ map: sizedTexture(2, 2) }));
  hidden.visible = false;
  root.add(hidden);
  assert.deepEqual(texturesOf(root), [map, uniform]);
});

void test('paced uploads keep each frame under the byte budget and upload a texture again only when its version changes', async (): Promise<void> => {
  const side: number = Math.floor(Math.sqrt(WARM_UP.textureBytesPerFrame / WARM_UP.bytesPerTexel / WARM_UP.mipmapShare / 2) * Math.SQRT2);
  const textures: Texture[] = [sizedTexture(side, side), sizedTexture(side, side), sizedTexture(side, side)];
  const pacer: CountingPacer = countingPacer();
  const uploads: [number, Texture][] = [];
  const uploader = { initTexture: (texture: Texture): void => void uploads.push([pacer.frame(), texture]) };
  const uploaded: WeakMap<Texture, number> = new WeakMap<Texture, number>();
  await uploadPaced(uploader, textures, uploaded, pacer);
  assert.deepEqual(uploads.map(([frame]: [number, Texture]): number => frame), [0, 1, 2]);
  await uploadPaced(uploader, textures, uploaded, pacer);
  assert.equal(uploads.length, 3);
  const changed: Texture | undefined = textures[1];
  if (changed === undefined) throw new Error('no texture');
  changed.needsUpdate = true;
  await uploadPaced(uploader, textures, uploaded, pacer);
  assert.deepEqual(uploads.slice(3).map(([, texture]: [number, Texture]): Texture => texture), [changed]);
});

void test('a warm-up draw runs with sorting off and leaves sorting as it found it, even when the draw throws', (): void => {
  const target: Sortable = { sortObjects: true };
  const seen: boolean[] = [];
  unsorted(target, (): void => void seen.push(target.sortObjects));
  assert.deepEqual(seen, [false]);
  assert.equal(target.sortObjects, true);
  assert.throws((): void =>
    unsorted(target, (): void => {
      throw new Error('lost context');
    }),
  );
  assert.equal(target.sortObjects, true);
  const off: Sortable = { sortObjects: false };
  unsorted(off, (): void => void seen.push(off.sortObjects));
  assert.equal(off.sortObjects, false);
});

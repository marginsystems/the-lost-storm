import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Material } from 'three';
import { AnimationClip, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import { HERO } from '../../sim/hero.ts';
import { stepStride } from '../../sim/world/player.ts';
import type { ActorPose, ActorView, SyncOptions } from './actor-view.ts';
import { ACTOR, createActorView, easeIn, fallAt, liftAt } from './actor-view.ts';
import type { ActionClip, CharacterLibrary, GaitClip, LoadedRig, RigClipSet } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';

const content: Content = loadContent();

const SPEEDS: readonly number[] = [0.5, 1.2, 2.2, 2.8, 3, 3.4, 4.5, 7, 9, 6, 3.4, 3, 2.8, 2.2, 1.2, 0, 2.8, 3, 0.05, 3, 9, 0.5];

const STUNNED = { dt: 1 / 60, knock: 0.6, hold: 0.85, hitLength: 1, swingLength: 1.2, impact: 0.5, windup: 0.4, recovery: 0.3 } as const;

const STUN_SYNC: SyncOptions = { rise: 1, floor: 0, turnRate: 10, seen: true };

function heroView(def: RigDef, hit: readonly AnimationClip[] = [], actions: ReadonlyMap<string, ActionClip> = new Map()): { readonly view: ActorView; readonly gaits: readonly GaitClip[]; readonly idle: AnimationClip } {
  const gaits: GaitClip[] = def.gaits.map((gait): GaitClip => ({ clip: new AnimationClip(gait.clip, 1, []), groundSpeed: gait.groundSpeed }));
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits, hit: [...hit], death: [], rise: null, actions: new Map(actions), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), HERO.size, 0);
  return { view, gaits, idle };
}

function playing(view: ActorView, clips: readonly AnimationClip[]): number {
  const weights: number[] = clips.map((clip: AnimationClip): number => {
    const action = view.rig.mixer.existingAction(clip);
    return action === null || !action.isRunning() ? 0 : action.getEffectiveWeight();
  });
  return weights.indexOf(Math.max(...weights));
}

for (const hero of content.player.heroes) {
  void test(`the ${hero.id} hero's step sounds are counted for the gait his view is playing, at every speed and through every change`, (): void => {
    const def: RigDef = must(content.rigs.get(hero.rig), hero.rig);
    const { view, gaits, idle } = heroView(def);
    const clips: readonly AnimationClip[] = [idle, ...gaits.map((gait: GaitClip): AnimationClip => gait.clip)];
    let held: number = -1;
    let stepping: number = 0;
    for (const speed of SPEEDS) {
      const counted = stepStride(def, speed, held);
      held = counted.gait;
      for (let frame: number = 0; frame < 60; frame += 1) {
        view.sync(1 / 30, { pos: { x: 0, z: 0 }, facing: 0, motion: speed > 0 ? 'stride' : 'still', gait: speed, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 }, { rise: 1, floor: 0, turnRate: 10, seen: true });
      }
      const shown: number = playing(view, clips) - 1;
      if (counted.metres === null) {
        assert.equal(shown, -1, `at ${speed} m/s the view plays a gait but no step is counted`);
        continue;
      }
      stepping += 1;
      assert.equal(shown, counted.gait, `at ${speed} m/s the view plays gait ${shown} but steps are counted for gait ${counted.gait}`);
      assert.equal(counted.metres, must(def.gaits[counted.gait], 'gait').stride);
    }
    assert.ok(stepping > SPEEDS.length / 2);
  });
}

function creatureView(lift: number, withClips: boolean): { readonly view: ActorView; readonly walk: AnimationClip; readonly hit: AnimationClip; readonly body: Mesh; readonly def: RigDef } {
  const hero: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const def: RigDef = { ...hero, id: 'creature', lift, gaits: [{ clip: 'Walk', groundSpeed: 1, stride: null }], clips: { ...hero.clips, hit: withClips ? ['Hit'] : [], death: withClips ? ['Death'] : [] } };
  const walk: AnimationClip = new AnimationClip('Walk', 1, []);
  const hit: AnimationClip = new AnimationClip('Hit', 1, []);
  const template: Group = new Group();
  template.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  const clips: RigClipSet = { idle: new AnimationClip('Idle', 1, []), run: walk, gaits: [{ clip: walk, groundSpeed: 1 }], hit: withClips ? [hit] : [], death: withClips ? [new AnimationClip('Death', 1, [])] : [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), 1, 0, ACTOR.hostileHover, (): number => 0);
  const stage: Group = new Group();
  stage.add(view.rig.root);
  let body: Mesh | undefined;
  view.rig.root.traverse((object): void => {
    if (object instanceof Mesh && body === undefined) body = object;
  });
  return { view, walk, hit, body: must(body, 'body mesh'), def };
}

function opacityOf(body: Mesh): number {
  const material: Material | Material[] = body.material;
  return Array.isArray(material) ? 1 : material.opacity;
}

const RUNNING = { pos: { x: 0, z: 0 }, facing: 0, motion: 'stride', gait: 1, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 } as const;
const OPTIONS = { rise: 1, floor: 0, turnRate: 10, seen: true } as const;

function pace(gait: number): ActorPose {
  return { ...RUNNING, gait };
}

void test('a creature with no hit clip keeps its stride when struck: the flash and the squash show the hit, not a jump to idle', (): void => {
  const { view, walk } = creatureView(0, false);
  for (let frame: number = 0; frame < 10; frame += 1) view.sync(1 / 30, RUNNING, OPTIONS);
  view.hit(new Color(0xffffff), 1, true);
  view.sync(1 / 30, RUNNING, OPTIONS);
  assert.equal(view.rig.mixer.existingAction(walk)?.isRunning(), true);
  const { view: clipped, hit } = creatureView(0, true);
  for (let frame: number = 0; frame < 10; frame += 1) clipped.sync(1 / 30, RUNNING, OPTIONS);
  clipped.hit(new Color(0xffffff), 1, true);
  assert.equal(clipped.rig.mixer.existingAction(hit)?.isRunning(), true);
});

void test('a creature with no death clip holds its last pose, then sinks and fades out, and comes back whole when pooled and revived', (): void => {
  const { view, body, def } = creatureView(0, false);
  view.sync(1 / 30, RUNNING, OPTIONS);
  view.die();
  view.sync(1 / 30, { ...RUNNING, motion: 'still', deadTime: ACTOR.fallTime / 2 }, OPTIONS);
  const halfway: number = view.rig.root.position.y;
  assert.ok(halfway < 0 && opacityOf(body) < 1 && opacityOf(body) > 0, `halfway at ${halfway} with opacity ${opacityOf(body)}`);
  view.sync(1 / 30, { ...RUNNING, motion: 'still', deadTime: ACTOR.fallTime }, OPTIONS);
  assert.ok(Math.abs(view.rig.root.position.y + ACTOR.fallDepth * def.height * def.scale) < 1e-9);
  assert.equal(opacityOf(body), 0);
  assert.equal(view.rig.root.parent?.children.find((child): boolean => child !== view.rig.root)?.visible, false);
  view.revive();
  assert.equal(opacityOf(body), 1);
});

void test('a lifted creature hovers its lift above the floor with a small bob, its shadow stays on the floor, and it drops when it dies', (): void => {
  const { view, def } = creatureView(1.5, true);
  assert.equal(view.height, def.height * def.scale + 1.5);
  for (let frame: number = 0; frame < 20; frame += 1) {
    view.sync(1 / 30, RUNNING, OPTIONS);
    assert.ok(Math.abs(view.rig.root.position.y - 1.5) <= ACTOR.bobHeight + 1e-9);
  }
  const shadow = view.rig.root.parent?.children.find((child): boolean => child !== view.rig.root);
  assert.ok(shadow !== undefined && shadow.position.y < 0.1);
  assert.equal(liftAt(1.5, 1, 0, 0), 1.5);
  assert.equal(liftAt(1.5, 1, ACTOR.dropTime, 0), 0);
  assert.equal(liftAt(0, 1, null, 3), 0);
  assert.equal(fallAt(0), 0);
  assert.equal(fallAt(ACTOR.fallTime * 2), 1);
  assert.equal(easeIn(0.5), 0.25);
});

function stunPose(motion: 'still' | 'knocked', knockTime: number, held: boolean, busy: boolean): ActorPose {
  return { pos: { x: 0, z: 0 }, facing: 0, motion, gait: 0, knockTime, busy, held, beat: null, deadTime: 0 };
}

function weightOf(view: ActorView, clip: AnimationClip): number {
  const action = view.rig.mixer.existingAction(clip);
  return action === null || !action.isRunning() ? 0 : action.getEffectiveWeight();
}

function timeOf(view: ActorView, clip: AnimationClip): number {
  return view.rig.mixer.existingAction(clip)?.time ?? 0;
}

for (const hero of content.player.heroes) {
  void test(`the ${hero.id} hero's hit reaction plays across the whole knockback instead of freezing early, then blends back to standing`, (): void => {
    const def: RigDef = must(content.rigs.get(hero.rig), hero.rig);
    const hit: AnimationClip = new AnimationClip('hit', STUNNED.hitLength, []);
    const { view, idle } = heroView(def, [hit]);
    view.sync(STUNNED.dt, stunPose('still', 0, false, false), STUN_SYNC);
    const frames: number = Math.round(STUNNED.knock / STUNNED.dt);
    const times: number[] = [];
    for (let frame: number = 0; frame < frames; frame += 1) {
      view.sync(STUNNED.dt, stunPose('knocked', STUNNED.knock - frame * STUNNED.dt, false, false), STUN_SYNC);
      times.push(timeOf(view, hit));
    }
    const lastStill: number = times.findIndex((time: number, index: number): boolean => index > 0 && time === times[index - 1]);
    assert.equal(lastStill, -1, `the hit clip stopped moving ${String(lastStill)} frames into a ${String(frames)}-frame knockback`);
    const ends: number[] = [];
    for (let frame: number = 0; frame < ACTOR.recoverFade / STUNNED.dt + 2; frame += 1) {
      view.sync(STUNNED.dt, stunPose('still', 0, false, false), STUN_SYNC);
      ends.push(weightOf(view, idle));
    }
    const jumps: number = Math.max(...ends.map((weight: number, index: number): number => weight - (ends[index - 1] ?? 0)));
    assert.ok(jumps < 0.25, `standing weight jumped by ${String(jumps)} in one frame after the knockback`);
    assert.ok((ends.at(-1) ?? 0) > 0.95, 'the hero never settled back to standing');
  });

  void test(`a held ${hero.id} hero keeps the pose the hit left for the whole hold, and a skill pressed then runs its full swing after`, (): void => {
    const def: RigDef = must(content.rigs.get(hero.rig), hero.rig);
    const hit: AnimationClip = new AnimationClip('hit', STUNNED.hitLength, []);
    const swing: AnimationClip = new AnimationClip('swing', STUNNED.swingLength, []);
    const { view } = heroView(def, [hit], new Map([['swing', { clip: swing, impactTime: STUNNED.impact }]]));
    view.sync(STUNNED.dt, stunPose('still', 0, false, false), STUN_SYNC);
    view.hit(new Color(0xffffff), 1, true);
    const frames: number = Math.round(STUNNED.hold / STUNNED.dt);
    for (let frame: number = 0; frame < frames / 2; frame += 1) view.sync(STUNNED.dt, stunPose('still', 0, true, false), STUN_SYNC);
    const struck: number = timeOf(view, hit);
    assert.ok(view.startAction('swing', STUNNED.windup, STUNNED.recovery));
    for (let frame: number = frames / 2; frame < frames; frame += 1) view.sync(STUNNED.dt, stunPose('still', 0, true, true), STUN_SYNC);
    assert.ok(struck < STUNNED.hitLength / 2, `the struck pose ran on to ${String(struck)} s of a ${String(STUNNED.hitLength)} s reaction during the hold`);
    assert.ok(timeOf(view, swing) < STUNNED.impact * 0.2, `the swing ran ahead to ${String(timeOf(view, swing))} s while the hero was held`);
    for (let frame: number = 0; frame < (STUNNED.windup + STUNNED.recovery) / STUNNED.dt; frame += 1) view.sync(STUNNED.dt, stunPose('still', 0, false, true), STUN_SYNC);
    assert.ok(timeOf(view, swing) > STUNNED.impact, `the swing reached only ${String(timeOf(view, swing))} s after the hold ended`);
  });
}

function apart(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

const TOGETHER = { dt: 1 / 60, turn: 0.14, flinch: 0.4, facing: 2, starts: [0, 1.2, -2.6], hitLength: 0.8, swingLength: 1.2, impact: 0.4, windup: 0.5, recovery: 0.4, beat: 7.37 } as const;

function standing(facing: number, busy: boolean, beat: number | null): ActorPose {
  return { pos: { x: 0, z: 0 }, facing, motion: 'still', gait: 0, knockTime: 0, busy, held: false, beat, deadTime: 0 };
}

void test('views told to glance together turn from wherever each faced to the same heading over the same span, easing in and out, and arrive on the same frame', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const views: ActorView[] = TOGETHER.starts.map((start: number): ActorView => {
    const { view } = heroView(def);
    view.face(start);
    view.sync(TOGETHER.dt, standing(start, false, null), STUN_SYNC);
    view.glance(TOGETHER.turn);
    return view;
  });
  const arrived: number[] = views.map((): number => -1);
  const steps: number[][] = views.map((): number[] => []);
  for (let frame: number = 0; frame < TOGETHER.turn / TOGETHER.dt + 3; frame += 1) {
    views.forEach((view: ActorView, index: number): void => {
      const before: number = view.rig.root.rotation.y;
      view.sync(TOGETHER.dt, standing(TOGETHER.facing, false, null), STUN_SYNC);
      must(steps[index], 'steps').push(apart(before, view.rig.root.rotation.y));
      if (arrived[index] === -1 && apart(view.rig.root.rotation.y, TOGETHER.facing) < 1e-9) arrived[index] = frame;
    });
  }
  assert.ok(arrived.every((frame: number): boolean => frame === arrived[0] && frame > 0), `the views arrived on frames ${arrived.join(', ')}`);
  for (const turned of steps) {
    const widest: number = Math.max(...turned);
    assert.ok((turned[0] ?? 0) < widest / 2 && (turned[must(arrived[0], 'arrival')] ?? 0) < widest / 2, 'a glance started or ended at full speed');
  }
});

void test('a shared flinch plays the first hit clip without a flash, holds a swing where it was, and picks the swing up from there after the flinch', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const hit: AnimationClip = new AnimationClip('hit', TOGETHER.hitLength, []);
  const other: AnimationClip = new AnimationClip('other hit', TOGETHER.hitLength, []);
  const swing: AnimationClip = new AnimationClip('swing', TOGETHER.swingLength, []);
  const { view } = heroView(def, [hit, other], new Map([['swing', { clip: swing, impactTime: TOGETHER.impact }]]));
  view.sync(TOGETHER.dt, standing(0, false, null), STUN_SYNC);
  assert.ok(view.startAction('swing', TOGETHER.windup, TOGETHER.recovery));
  for (let frame: number = 0; frame < 10; frame += 1) view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
  const reached: number = timeOf(view, swing);
  view.flinch(TOGETHER.flinch);
  assert.equal(view.rig.mixer.existingAction(other), null);
  for (let frame: number = 0; frame < Math.round(TOGETHER.flinch / TOGETHER.dt) - 1; frame += 1) view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
  assert.ok(weightOf(view, hit) > 0.95, 'the flinch was not showing');
  view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
  view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
  assert.ok(Math.abs(timeOf(view, swing) - reached) < TOGETHER.dt * 3, `the swing went on from ${String(timeOf(view, swing))} s instead of ${String(reached)} s`);
  const weights: number[] = [];
  for (let frame: number = 0; frame < ACTOR.recoverFade / TOGETHER.dt + 2; frame += 1) {
    view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
    weights.push(weightOf(view, swing));
  }
  assert.ok(Math.max(...weights.map((weight: number, index: number): number => weight - (weights[index - 1] ?? 0))) < 0.25, 'the swing snapped back in');
  assert.ok((weights.at(-1) ?? 0) > 0.95, 'the swing never came back');
  for (let frame: number = 0; frame < (TOGETHER.windup + TOGETHER.recovery) / TOGETHER.dt; frame += 1) view.sync(TOGETHER.dt, standing(0, true, null), STUN_SYNC);
  assert.ok(timeOf(view, swing) > TOGETHER.impact, 'the swing never reached its strike after the flinch');
});

void test('idle views given the same beat stand at the same point of their idle clip whenever each began, and views with no beat keep their own', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const early = heroView(def);
  const late = heroView(def);
  for (let frame: number = 0; frame < 23; frame += 1) early.view.sync(TOGETHER.dt, standing(0, false, null), STUN_SYNC);
  late.view.sync(TOGETHER.dt, standing(0, false, null), STUN_SYNC);
  assert.notEqual(timeOf(early.view, early.idle), timeOf(late.view, late.idle));
  for (let frame: number = 0; frame < 30; frame += 1) {
    const beat: number = TOGETHER.beat + frame * TOGETHER.dt;
    early.view.sync(TOGETHER.dt, standing(0, false, beat), STUN_SYNC);
    late.view.sync(TOGETHER.dt, standing(0, false, beat), STUN_SYNC);
    assert.ok(Math.abs(timeOf(early.view, early.idle) - timeOf(late.view, late.idle)) < 1e-9, `the idles parted at frame ${String(frame)}`);
    assert.ok(Math.abs(timeOf(early.view, early.idle) - (beat % early.idle.duration)) < 1e-9);
  }
});

function tilt(angle: number): number[] {
  return new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle).toArray();
}

void test('a frame that moves no time, as in a hit-stop, keeps the head and chest where the clip left them instead of dropping them to the rest pose', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const head: string = must(def.bodyParts['head']?.[0], 'head bone');
  const chestName: string = must(def.bodyParts['torso']?.at(-3), 'chest bone');
  const template: Group = new Group();
  const chest: Object3D = new Object3D();
  chest.name = chestName;
  const skull: Object3D = new Object3D();
  skull.name = head;
  chest.add(skull);
  template.add(chest);
  const idle: AnimationClip = new AnimationClip('idle', 1, [new QuaternionKeyframeTrack(`${head}.quaternion`, [0, 1], [...tilt(0.6), ...tilt(0.9)])]);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits: [], hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def: { ...def, gaits: [] }, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), 1, 0);
  for (let frame: number = 0; frame < 5; frame += 1) view.sync(1 / 30, standing(0, false, null), STUN_SYNC);
  const bone: Object3D = must(view.rig.root.getObjectByName(head), 'head in the view');
  const posed: Quaternion = bone.quaternion.clone();
  assert.ok(posed.angleTo(new Quaternion()) > 0.5, 'the clip never posed the head');
  view.sync(0, standing(0, false, null), STUN_SYNC);
  assert.ok(bone.quaternion.angleTo(posed) < 1e-6, `the head moved ${String(bone.quaternion.angleTo(posed))} rad in a frame that moved no time`);
});

void test('a fresh body has its death and hit clips bound before its first death, and binding them plays nothing', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'player rig');
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const death: AnimationClip = new AnimationClip('death', 1, []);
  const hit: AnimationClip = new AnimationClip('hit', 1, []);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits: [], hit: [hit], death: [death], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), 1, 0, ACTOR.hostileHover, (): number => 0);
  assert.equal(view.rig.mixer.existingAction(death), null);
  view.prime();
  const dying = must(view.rig.mixer.existingAction(death), 'death action');
  const struck = must(view.rig.mixer.existingAction(hit), 'hit action');
  view.sync(1 / 60, { pos: { x: 0, z: 0 }, facing: 0, motion: 'still', gait: 0, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 }, STUN_SYNC);
  assert.equal(dying.isRunning(), false);
  assert.equal(struck.isRunning(), false);
  assert.equal(must(view.rig.mixer.existingAction(idle), 'idle action').getEffectiveWeight(), 1);
  view.die();
  assert.equal(view.rig.mixer.existingAction(death), dying);
  assert.equal(dying.isRunning(), true);
});

function walkingRig(): { readonly view: ActorView; readonly bone: Object3D; readonly steps: { count: number } } {
  const def: RigDef = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  const head: string = must(def.bodyParts['head']?.[0], 'head bone');
  const template: Group = new Group();
  const skull: Object3D = new Object3D();
  skull.name = head;
  template.add(skull);
  const walk: AnimationClip = new AnimationClip('Walk', 1, [new QuaternionKeyframeTrack(`${head}.quaternion`, [0, 0.5, 1], [...tilt(0), ...tilt(1.2), ...tilt(0)])]);
  const clips: RigClipSet = { idle: walk, run: walk, gaits: [{ clip: walk, groundSpeed: 1 }], hit: [], death: [], rise: null, actions: new Map(), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def: { ...def, gaits: [{ clip: 'Walk', groundSpeed: 1, stride: null }] }, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), 1, 0, ACTOR.hostileHover, (): number => 0);
  const steps: { count: number } = { count: 0 };
  const update = view.rig.mixer.update.bind(view.rig.mixer);
  view.rig.mixer.update = (delta: number): typeof view.rig.mixer => {
    steps.count += 1;
    return update(delta);
  };
  return { view, bone: must(view.rig.root.getObjectByName(head), 'head in the view'), steps };
}

void test('a rig walking out of view runs no mixer step at all while its clip and speed stay the same, and lands on the pose of a rig that was always seen', (): void => {
  const always = walkingRig();
  const unseen = walkingRig();
  for (let frame: number = 0; frame < 10; frame += 1) {
    always.view.sync(1 / 60, RUNNING, OPTIONS);
    unseen.view.sync(1 / 60, RUNNING, OPTIONS);
  }
  const before: number = unseen.steps.count;
  for (let frame: number = 0; frame < 40; frame += 1) {
    const jitter: ActorPose = { ...RUNNING, gait: RUNNING.gait * (1 + (frame % 3) * 1e-9) };
    always.view.sync(1 / 60, jitter, OPTIONS);
    unseen.view.sync(1 / 60, jitter, { ...OPTIONS, seen: false });
  }
  assert.equal(unseen.steps.count, before, 'the unseen rig still stepped its mixer');
  always.view.sync(1 / 60, RUNNING, OPTIONS);
  unseen.view.sync(1 / 60, RUNNING, OPTIONS);
  assert.ok(unseen.bone.quaternion.angleTo(always.bone.quaternion) < 1e-5, `the rig came into view ${String(unseen.bone.quaternion.angleTo(always.bone.quaternion))} rad off`);
});

void test('an unseen rig that changes pace by more than a twentieth pays its banked time at the old pace first', (): void => {
  const always = walkingRig();
  const unseen = walkingRig();
  for (let frame: number = 0; frame < 10; frame += 1) {
    always.view.sync(1 / 60, pace(1), OPTIONS);
    unseen.view.sync(1 / 60, pace(1), OPTIONS);
  }
  for (let frame: number = 0; frame < 40; frame += 1) {
    const gait: number = frame < 20 ? 1 : 1.5;
    always.view.sync(1 / 60, pace(gait), OPTIONS);
    unseen.view.sync(1 / 60, pace(gait), { ...OPTIONS, seen: false });
  }
  always.view.sync(1 / 60, pace(1.5), OPTIONS);
  unseen.view.sync(1 / 60, pace(1.5), OPTIONS);
  assert.ok(unseen.bone.quaternion.angleTo(always.bone.quaternion) < 1e-5, `the rig came into view ${String(unseen.bone.quaternion.angleTo(always.bone.quaternion))} rad off`);
});

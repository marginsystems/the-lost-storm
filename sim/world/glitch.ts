import type { GlitchDef, GlitchEdit, GlitchKind, GlitchProgress, GlitchStage, TriggerMoment } from '../content/glitches.ts';
import { distance, facingOf } from '../math.ts';
import type { Rng } from '../rng.ts';
import { createRng, pickWeighted } from '../rng.ts';
import { allHold } from './conditions.ts';
import { applyEdit, turnHero } from './glitch-edits.ts';
import type { ActiveGlitch, GlitchRequest, GlitchSave, GlitchSource, GlitchState, PathEntry, Silhouette } from './glitch-types.ts';
import type { Command, MomentState, MonsterState, World, WorldEvent } from './types.ts';

export const GLITCH = {
  secondsPerMinute: 60,
  freshSilhouetteSeconds: 20,
} as const;

export const CALM = {
  fightQuiet: 8,
  arrival: 60,
  mistGap: 150,
  mistCap: 1.6,
  overlayQuiet: 4,
} as const;

export type GlitchBlock = 'off' | 'dead' | 'active' | 'cooldown' | 'low_life' | 'telegraph' | 'busy' | 'fight' | 'overlay' | 'arrival' | 'spacing';

export function createGlitchState(def: GlitchDef, seed: number, save: GlitchSave | null): GlitchState {
  return {
    def,
    rng: createRng((seed ^ def.seed) >>> 0),
    enabled: true,
    progress: save?.progress ?? 0,
    fired: save === null ? [] : [...save.fired],
    active: null,
    holdUntil: 0,
    readyAt: 0,
    combatTime: 0,
    lastFight: -Infinity,
    lastMist: -Infinity,
    zoneSince: 0,
    overlay: false,
    overlayShut: -Infinity,
    requests: [],
    wrongWord: null,
  };
}

export function glitchToSave(state: GlitchState): GlitchSave {
  return { progress: state.progress, fired: [...state.fired] };
}

export function stageOf(def: GlitchDef, progress: number): GlitchStage {
  let found: GlitchStage | undefined = def.stages[0];
  for (const stage of def.stages) if (stage.from <= progress) found = stage;
  if (found === undefined) throw new Error('glitch data has no stages');
  return found;
}

export function storyProgress(world: World): number {
  return world.glitch.def.progress.reduce((best: number, entry: GlitchProgress): number => (entry.value > best && allHold(world, entry.when) ? entry.value : best), world.glitch.progress);
}

const MIST: Readonly<Record<GlitchKind, boolean>> = { hard_cut: true, quiet_pass: true, stutter: false, wrong_word: false };

export function isMist(kind: GlitchKind): boolean {
  return MIST[kind];
}

export function inMist(world: World): boolean {
  const active: ActiveGlitch | null = world.glitch.active;
  return active !== null && isMist(active.kind);
}

function lethalTelegraph(world: World): boolean {
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.action?.phase === 'windup' && (monster.def.boss !== null || monster.damageMax >= world.player.life));
}

export function glitchBlock(world: World, request: GlitchRequest): GlitchBlock | null {
  const state: GlitchState = world.glitch;
  const player = world.player;
  if (!state.enabled && request.source !== 'debug') return 'off';
  if (!player.alive || world.death !== null) return 'dead';
  if (state.active !== null) return 'active';
  if (request.source !== 'debug' && world.time < state.readyAt) return 'cooldown';
  if (lethalTelegraph(world)) return 'telegraph';
  if (player.life < player.maxLife * state.def.rules.minLifeFraction) return 'low_life';
  if (isMist(request.kind) && (world.dialogue !== null || world.service !== null)) return 'busy';
  return isMist(request.kind) ? calmBlock(world, request) : null;
}

function momentFight(world: World, moment: MomentState): boolean {
  return moment.phase === 'awake' && moment.figures.some((figure): boolean => figure.turned && world.monsters.some((monster: MonsterState): boolean => monster.id === figure.monsterId && monster.alive));
}

export function fighting(world: World): boolean {
  return inCombat(world) || world.time - world.glitch.lastFight < CALM.fightQuiet || world.moments.some((moment: MomentState): boolean => momentFight(world, moment));
}

function calmBlock(world: World, request: GlitchRequest): GlitchBlock | null {
  const state: GlitchState = world.glitch;
  if (fighting(world)) return 'fight';
  if (state.overlay || world.time - state.overlayShut < CALM.overlayQuiet) return 'overlay';
  if (request.source === 'debug' || (request.source === 'zone' && request.kind === 'quiet_pass')) return null;
  if (world.time - state.zoneSince < CALM.arrival) return 'arrival';
  if (world.time - state.lastMist < CALM.mistGap) return 'spacing';
  return null;
}

function noteFights(world: World): void {
  const state: GlitchState = world.glitch;
  const hero: number = world.player.id;
  if (world.events.some((event: WorldEvent): boolean => event.type === 'damage' && (event.targetTeam === 'player' || event.sourceId === hero))) state.lastFight = world.time;
  if (world.events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) state.zoneSince = world.time;
}

export function requestGlitch(world: World, kind: GlitchKind, source: GlitchSource): void {
  world.glitch.requests.push({ kind, source, trigger: null });
}

export function setOverlay(world: World, open: boolean): void {
  const state: GlitchState = world.glitch;
  if (state.overlay && !open) state.overlayShut = world.time;
  state.overlay = open;
  const active: ActiveGlitch | null = state.active;
  if (open && active !== null && isMist(active.kind)) finish(world, active);
}

export function setGlitchesEnabled(world: World, enabled: boolean): void {
  world.glitch.enabled = enabled;
  if (!enabled) {
    world.glitch.requests = world.glitch.requests.filter((request: GlitchRequest): boolean => request.source === 'debug');
    world.glitch.wrongWord = null;
  }
}

const WORLDLY: Readonly<Record<Command['type'], boolean>> = {
  read: true,
  hero: false,
  glitch: false,
  glitch_setting: false,
  overlay: false,
  strike: false,
  move: true,
  walk: true,
  skill: true,
  hold: false,
  slot: false,
  steer: true,
  pickup: true,
  travel: true,
  talk: true,
  use: true,
  flask: true,
  teleport: true,
  trade: true,
  stop: false,
  equip: false,
  unequip: false,
  drop: false,
  allocate: false,
  refund: false,
  respec: false,
  advance: false,
  respawn: false,
};

function worldly(command: Command): boolean {
  return WORLDLY[command.type];
}

export function heldCommands(world: World, commands: readonly Command[]): readonly Command[] {
  if (!inMist(world)) return commands;
  return commands.filter((command: Command): boolean => !worldly(command));
}

function pickSilhouettes(world: World, count: number): Silhouette[] {
  if (count <= 0) return [];
  const { near, far } = world.glitch.def.silhouettes;
  const old: readonly PathEntry[] = world.path.entries.filter((entry: PathEntry): boolean => entry.t < world.path.clock - GLITCH.freshSilhouetteSeconds);
  if (old.length === 0) return [];
  const hero = world.player.pos;
  const inRange = (entry: PathEntry): boolean => entry.zone === world.zone.id && distance(entry, hero) >= near && distance(entry, hero) <= far;
  const standing: PathEntry[] = old.filter(inRange);
  if (standing.length > 0) {
    const shownHere: number = Math.min(count, standing.length);
    return Array.from({ length: shownHere }, (_: unknown, index: number): Silhouette => {
      const at: number = Math.floor(((index + 0.5) * standing.length) / shownHere);
      const entry: PathEntry = standing[at] ?? standing[0] ?? { t: 0, zone: '', x: hero.x, z: hero.z, act: 'step' };
      const next: PathEntry | undefined = old[old.indexOf(entry) + 1];
      const facing: number = next === undefined || next.zone !== entry.zone ? 0 : facingOf({ x: next.x - entry.x, z: next.z - entry.z });
      return { x: entry.x, z: entry.z, facing };
    });
  }
  const shown: number = Math.min(count, old.length);
  return Array.from({ length: shown }, (_: unknown, index: number): Silhouette => {
    const at: number = Math.floor(((index + 0.5) * old.length) / shown);
    const entry: PathEntry = old[at] ?? old[0] ?? { t: 0, zone: '', x: 0, z: 0, act: 'step' };
    const next: PathEntry | undefined = old[at + 1];
    const angle: number = Math.atan2(entry.z - hero.z, entry.x - hero.x) + index;
    const span: number = far - near;
    const reach: number = near + (distance(entry, hero) % span);
    const facing: number = next === undefined ? angle : facingOf({ x: next.x - entry.x, z: next.z - entry.z });
    return { x: hero.x + Math.cos(angle) * reach, z: hero.z + Math.sin(angle) * reach, facing };
  });
}

function chooseEdit(world: World, stage: GlitchStage, rng: Rng): { readonly edit: string | null; readonly turn: boolean } {
  const options: GlitchEdit[] = stage.edits.map((id: string): GlitchEdit | undefined => world.glitch.def.edits.get(id)).filter((edit: GlitchEdit | undefined): edit is GlitchEdit => edit !== undefined);
  while (options.length > 0) {
    const edit: GlitchEdit | null = pickWeighted(rng, options);
    if (edit === null) break;
    options.splice(options.indexOf(edit), 1);
    if (applyEdit(world, edit, rng)) return { edit: edit.id, turn: edit.type === 'hero_turn' };
  }
  const fallback: GlitchEdit | undefined = [...world.glitch.def.edits.values()].find((entry: GlitchEdit): boolean => entry.type === 'hero_turn');
  return { edit: fallback?.id ?? null, turn: true };
}

function interruptMonsters(world: World): void {
  for (const monster of world.monsters) {
    if (!monster.alive || monster.action === null || monster.action.phase !== 'windup') continue;
    monster.action = null;
    world.events.push({ type: 'skill_interrupt', actorId: monster.id });
  }
}

function still(world: World): void {
  const player = world.player;
  player.intent = { type: 'idle' };
  player.path = [];
  player.queued = null;
}

function begin(world: World, request: GlitchRequest): void {
  const state: GlitchState = world.glitch;
  const stage: GlitchStage = stageOf(state.def, state.progress);
  if (request.trigger !== null && !state.fired.includes(request.trigger)) state.fired.push(request.trigger);
  state.readyAt = world.time + state.def.rules.cooldown;
  if (request.kind === 'wrong_word') {
    state.wrongWord = world.time + state.def.wrongWord.window;
    world.events.push({ type: 'glitch_start', kind: request.kind, duration: 0, edit: null, silhouettes: [] });
    return;
  }
  const duration: number = request.kind === 'hard_cut' ? Math.min(CALM.mistCap, state.rng.range(stage.mist.min, stage.mist.max)) : request.kind === 'stutter' ? state.def.stutter : state.def.quietPass;
  const silhouettes: Silhouette[] = request.kind === 'quiet_pass' ? pickSilhouettes(world, stage.silhouettes) : [];
  const chosen = request.kind === 'hard_cut' ? chooseEdit(world, stage, state.rng) : { edit: null, turn: false };
  state.active = { kind: request.kind, source: request.source, duration, edit: chosen.edit, turn: chosen.turn, elapsed: 0 };
  const held: number = duration + state.def.rules.grace;
  state.holdUntil = world.time + held;
  interruptMonsters(world);
  if (isMist(request.kind)) {
    state.lastMist = world.time;
    still(world);
    world.events.push({ type: 'silence', duration });
  }
  world.events.push({ type: 'glitch_start', kind: request.kind, duration, edit: chosen.edit, silhouettes });
}

function finish(world: World, active: ActiveGlitch): void {
  world.glitch.active = null;
  if (active.turn) turnHero(world);
  world.events.push({ type: 'glitch_end', kind: active.kind });
}

function inCombat(world: World): boolean {
  const radius: number = world.glitch.def.rules.combatRadius;
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.aggro && distance(monster.pos, world.player.pos) <= radius);
}

function queued(state: GlitchState, trigger: string): boolean {
  return state.requests.some((request: GlitchRequest): boolean => request.trigger === trigger);
}

function rollCombat(world: World, stage: GlitchStage, dt: number): void {
  const state: GlitchState = world.glitch;
  if (!inCombat(world)) {
    state.combatTime = 0;
    return;
  }
  state.combatTime += dt;
  const tick: number = state.def.rules.combatTick;
  while (state.combatTime >= tick) {
    state.combatTime -= tick;
    if (state.active !== null || state.requests.length > 0 || world.time < state.readyAt) continue;
    const kinds: GlitchKind[] = stage.kinds.filter((kind: GlitchKind): boolean => !isMist(kind));
    if (!state.rng.chance((stage.combatChancePerMinute * tick) / GLITCH.secondsPerMinute)) continue;
    const kind: GlitchKind | undefined = kinds[Math.min(kinds.length - 1, Math.floor(state.rng.next() * kinds.length))];
    if (kind !== undefined) state.requests.push({ kind, source: 'combat', trigger: null });
  }
}

function rollZone(world: World, stage: GlitchStage): void {
  if (!world.events.some((event): boolean => event.type === 'zone_changed')) return;
  const state: GlitchState = world.glitch;
  if (stage.quietPass) state.requests.push({ kind: 'quiet_pass', source: 'zone', trigger: null });
  else if (stage.kinds.includes('hard_cut') && state.rng.chance(stage.zoneChance)) state.requests.push({ kind: 'hard_cut', source: 'zone', trigger: null });
}

function momentHolds(world: World, moment: TriggerMoment): boolean {
  const engaged: boolean = inCombat(world);
  const holds: Readonly<Record<TriggerMoment, boolean>> = { combat: engaged, calm: !engaged, any: true };
  return holds[moment];
}

function watchStory(world: World): void {
  const state: GlitchState = world.glitch;
  for (const trigger of state.def.triggers) {
    if (state.fired.includes(trigger.id) || queued(state, trigger.id) || !momentHolds(world, trigger.during) || !allHold(world, trigger.when)) continue;
    state.requests.push({ kind: trigger.kind, source: 'story', trigger: trigger.id });
  }
}

const LASTING: Readonly<Record<GlitchSource, boolean>> = { story: true, debug: true, combat: false, zone: false };

function lasting(source: GlitchSource): boolean {
  return LASTING[source];
}

function serve(world: World): void {
  const state: GlitchState = world.glitch;
  const waiting: GlitchRequest[] = [];
  let started: boolean = false;
  for (const request of state.requests) {
    if (started) {
      if (lasting(request.source)) waiting.push(request);
      continue;
    }
    const block: GlitchBlock | null = glitchBlock(world, request);
    if (block === null) {
      begin(world, request);
      started = true;
    } else if (lasting(request.source) && block !== 'off') waiting.push(request);
  }
  state.requests = waiting;
}

export function stepGlitch(world: World, dt: number): void {
  const state: GlitchState = world.glitch;
  const active: ActiveGlitch | null = state.active;
  if (active !== null) {
    active.elapsed += dt;
    if (active.elapsed >= active.duration) finish(world, active);
  }
  noteFights(world);
  state.progress = storyProgress(world);
  const stage: GlitchStage = stageOf(state.def, state.progress);
  if (state.enabled) {
    rollZone(world, stage);
    watchStory(world);
    rollCombat(world, stage, dt);
  }
  serve(world);
}

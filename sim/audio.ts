import type { PortalStage } from './world/portal-types.ts';
import type { AudioDef, CueDef, CueTable, LifeSoundEvent, PitchRange, UiAction, WeaponCue, WorldSoundEvent } from './content/audio.ts';
import { FALLBACK_KEY, GOLD_KEY, PLAYER_KEY } from './content/audio.ts';
import type { AreaDelivery } from './content/shape-types.ts';
import type { ItemBaseDef, SkillDef, WeaponKind } from './content/types.ts';
import { baseOf } from './items.ts';
import { surfaceAt } from './world/ground-surface.ts';
import type { Vec2 } from './math.ts';
import { findHero } from './world/heroes.ts';
import type { AreaStage, AreaState, Command, GroundItem, ItemInstance, MonsterState, PlayerState, WakeBeat, World, WorldEvent } from './world/types.ts';

export interface SoundCue extends CueDef {
  readonly position: Vec2 | null;
}

const NONE: readonly SoundCue[] = [];

type CueTableName = Exclude<keyof AudioDef, 'defaults' | 'ambience' | 'lobby' | 'silent'>;

const NO_KEYS: readonly string[] = [];

const WARM_TABLES: readonly CueTableName[] = ['world', 'encounterNearing', 'encounterShown', 'life', 'skillStart', 'hit', 'critHit', 'guarded', 'skillHit', 'areaStart', 'areaPulse', 'areaStrike', 'areaEnd', 'brand', 'skillImpact', 'projectileSpawn', 'projectileExpire', 'death', 'aggro', 'pickup', 'drop', 'notice', 'ui', 'steps', 'tailwindKill', 'tailwindRise'];

function heldBy(entry: WeaponCue, weapon: WeaponKind | null): boolean {
  return entry.weapons.length === 0 || (weapon !== null && entry.weapons.includes(weapon));
}

function brightened(range: PitchRange | null, lift: number): PitchRange | null {
  if (lift === 0) return range;
  const base: PitchRange = range ?? { min: 1, max: 1 };
  return { min: base.min * (1 + lift), max: base.max * (1 + lift) };
}

function cues(table: CueTable, key: string, position: Vec2 | null, weapon: WeaponKind | null = null, heat: number = 0): readonly SoundCue[] {
  const list: readonly WeaponCue[] | undefined = table.get(key);
  if (list === undefined) return NONE;
  const heard: readonly WeaponCue[] = list.filter((entry: WeaponCue): boolean => heldBy(entry, weapon));
  if (heard.length === 0) return NONE;
  return heard.map((entry: WeaponCue): SoundCue => ({ sound: entry.sound, volume: entry.volume * (1 - entry.swell * (1 - heat)), maxVoices: entry.maxVoices, cooldown: entry.cooldown, reach: entry.reach, holdForVoice: entry.holdForVoice, pitch: brightened(entry.pitch, entry.brighten * heat), volumeJitter: entry.volumeJitter, position }));
}

function bySkill(table: CueTable, skill: SkillDef, position: Vec2 | null, weapon: WeaponKind | null = null, heat: number = 0): readonly SoundCue[] {
  return table.has(skill.form) ? cues(table, skill.form, position, weapon, heat) : cues(table, skill.id, position, weapon, heat);
}

function tierId(world: World, tier: number): string {
  return world.content.tailwind.tiers[tier - 1]?.id ?? '';
}

function firstOf(table: CueTable, keys: readonly string[], position: Vec2 | null, weapon: WeaponKind | null): readonly SoundCue[] {
  for (const key of keys) {
    const found: readonly SoundCue[] = cues(table, key, position, weapon);
    if (found.length > 0) return found;
  }
  return NONE;
}

function weaponOf(world: World, actorId: number): WeaponKind | null {
  const hero: PlayerState | null = findHero(world, actorId);
  if (hero === null) return null;
  const held: ItemInstance | null = hero.equipped.weapon;
  if (held === null) return null;
  const base: ItemBaseDef | null = baseOf(world.content, held);
  return base === null ? null : base.weaponKind;
}

function monsterOf(world: World, id: number): MonsterState | undefined {
  return world.monsters.find((monster: MonsterState): boolean => monster.id === id);
}

function positionOf(world: World, actorId: number): Vec2 | null {
  const actor: { readonly pos: Vec2 } | undefined = findHero(world, actorId) ?? monsterOf(world, actorId) ?? world.npcs.find((npc): boolean => npc.id === actorId);
  return actor === undefined ? null : { x: actor.pos.x, z: actor.pos.z };
}

function targetKeys(world: World, team: 'player' | 'monster', id: number): readonly string[] {
  if (team === 'player') return [PLAYER_KEY];
  const monster: MonsterState | undefined = monsterOf(world, id);
  return monster === undefined ? NO_KEYS : [monster.def.id, monster.def.bodyMaterial, FALLBACK_KEY];
}

function groundKey(ground: GroundItem): string {
  return ground.content.kind === 'gold' ? GOLD_KEY : ground.content.item.rarity;
}

const WAKE_SOUNDS: Readonly<Record<WakeBeat, WorldSoundEvent>> = { stir: 'wake_stir', front: 'wake_front', standing: 'wake_standing' };

function worldCues(audio: AudioDef, event: WorldSoundEvent, position: Vec2 | null): readonly SoundCue[] {
  return cues(audio.world, event, position);
}

function stepCues(audio: AudioDef, world: World, position: Vec2): readonly SoundCue[] {
  const surface: string | null = surfaceAt(world.zone, position.x, position.z);
  const own: readonly SoundCue[] = surface === null ? NONE : cues(audio.steps, surface, position);
  return own.length > 0 ? own : worldCues(audio, 'hero_step', position);
}

const PORTAL_SOUNDS: Readonly<Record<PortalStage, WorldSoundEvent | null>> = { channel: null, broken: null, opened: 'portal_opened', entered: 'portal_entered', arrived: 'portal_arrived', closed: 'portal_closed' };

function portalCues(audio: AudioDef, stage: PortalStage, position: Vec2): readonly SoundCue[] {
  const sound: WorldSoundEvent | null = PORTAL_SOUNDS[stage];
  return sound === null ? NONE : worldCues(audio, sound, position);
}

function heatOf(skill: SkillDef, pulses: number): number {
  const delivery: AreaDelivery | null = skill.delivery.type === 'area' ? skill.delivery : null;
  const stoke = delivery?.stoke ?? null;
  return stoke === null ? 0 : Math.min(stoke.max, stoke.perPulse * pulses) / stoke.max;
}

function areaCues(audio: AudioDef, area: AreaState, stage: AreaStage, hits: number): readonly SoundCue[] {
  const position: Vec2 = { x: area.pos.x, z: area.pos.z };
  const skill: SkillDef = area.skill;
  const heat: number = heatOf(skill, area.pulses);
  let found: readonly SoundCue[] = NONE;
  switch (stage) {
    case 'start':
      found = bySkill(audio.areaStart, skill, position);
      break;
    case 'pulse':
      found = bySkill(audio.areaPulse, skill, position, null, heat).concat(hits > 0 ? bySkill(audio.areaStrike, skill, position, null, heat) : NONE);
      break;
    case 'end':
      found = bySkill(audio.areaEnd, skill, position);
      break;
  }
  return found;
}

export function cuesForEvent(audio: AudioDef, world: World, event: WorldEvent): readonly SoundCue[] {
  let found: readonly SoundCue[] = NONE;
  switch (event.type) {
    case 'skill_start':
      found = bySkill(audio.skillStart, event.skill, positionOf(world, event.actorId), weaponOf(world, event.actorId));
      break;
    case 'skill_impact':
      found = bySkill(audio.skillImpact, event.skill, event.origin);
      break;
    case 'projectile_spawn':
      found = bySkill(audio.projectileSpawn, event.projectile.skill, event.projectile.pos, weaponOf(world, event.projectile.ownerId), event.projectile.skill.spent);
      break;
    case 'projectile_end':
      if (!event.hit) found = cues(audio.projectileExpire, event.skill.id, event.pos);
      break;
    case 'damage': {
      if (event.burn) break;
      const weapon: WeaponKind | null = weaponOf(world, event.sourceId);
      const keys: readonly string[] = targetKeys(world, event.targetTeam, event.targetId);
      const arrival: readonly SoundCue[] = bySkill(audio.skillHit, event.skill, event.pos, weapon, event.skill.spent);
      const body: readonly SoundCue[] = firstOf(audio.hit, keys, event.pos, weapon);
      const sweetener: readonly SoundCue[] = event.crit ? firstOf(audio.critHit, keys, event.pos, weapon) : NONE;
      found = [...arrival, ...body, ...sweetener];
      break;
    }
    case 'guarded':
      found = cues(audio.guarded, event.broken ? 'broken' : 'blocked', event.pos);
      break;
    case 'death':
      found = firstOf(audio.death, targetKeys(world, event.team, event.actorId), event.pos, null);
      if (event.team === 'monster' && world.tailwind.tier > 0) found = found.concat(cues(audio.tailwindKill, tierId(world, world.tailwind.tier), event.pos));
      break;
    case 'tailwind_rise':
      found = cues(audio.tailwindRise, tierId(world, event.tier), null);
      break;
    case 'tailwind_end':
      if (event.reason === 'faded') found = worldCues(audio, 'tailwind_faded', null);
      break;
    case 'aggro': {
      const monster: MonsterState | undefined = monsterOf(world, event.monsterId);
      if (monster !== undefined) found = cues(audio.aggro, monster.def.id, { x: monster.pos.x, z: monster.pos.z });
      break;
    }
    case 'monster_spawn': {
      const monster: MonsterState | undefined = monsterOf(world, event.monsterId);
      found = worldCues(audio, 'monster_spawn', monster === undefined ? null : { x: monster.pos.x, z: monster.pos.z });
      break;
    }
    case 'drop':
      found = cues(audio.drop, groundKey(event.ground), event.ground.pos);
      break;
    case 'pickup':
      found = cues(audio.pickup, groundKey(event.ground), null);
      break;
    case 'notice':
      found = cues(audio.notice, event.reason, null);
      break;
    case 'hero_step':
      found = stepCues(audio, world, event.pos);
      break;
    case 'level_up':
      found = worldCues(audio, 'level_up', null);
      break;
    case 'surge':
      found = worldCues(audio, 'surge', null);
      break;
    case 'surge_cleared':
      found = worldCues(audio, 'surge_cleared', null);
      break;
    case 'player_respawn':
      found = worldCues(audio, 'player_respawn', null);
      break;
    case 'flask_used':
      found = worldCues(audio, 'flask_used', event.pos);
      break;
    case 'portal':
      found = portalCues(audio, event.stage, event.pos);
      break;
    case 'quest_started':
      found = worldCues(audio, 'quest_started', null);
      break;
    case 'quest_advanced':
      found = worldCues(audio, 'quest_advanced', null);
      break;
    case 'quest_completed':
      found = worldCues(audio, 'quest_completed', null);
      break;
    case 'waypoint_unlocked':
      found = worldCues(audio, 'waypoint_unlocked', null);
      break;
    case 'item_identified':
      found = worldCues(audio, 'item_identified', null);
      break;
    case 'moment_strike':
      found = worldCues(audio, event.moment.combat ? 'moment_strike' : 'moment_strike_soft', { x: event.moment.pos.x, z: event.moment.pos.z });
      break;
    case 'moment_woke':
      found = worldCues(audio, event.turned.length > 0 ? 'moment_hostile' : 'moment_calm', event.moment.pos);
      break;
    case 'wake':
      found = worldCues(audio, WAKE_SOUNDS[event.beat], positionOf(world, world.player.id));
      break;
    case 'encounter_nearing':
      found = cues(audio.encounterNearing, event.encounter, null);
      break;
    case 'encounter_shown':
      found = cues(audio.encounterShown, event.encounter, null);
      break;
    case 'burn':
      if (event.targetId === world.player.id) found = worldCues(audio, 'hero_burn', event.pos);
      break;
    case 'hazard':
      if (event.burst) found = bySkill(audio.skillImpact, event.hazard.skill, event.hazard.pos);
      break;
    case 'area':
      found = areaCues(audio, event.area, event.stage, event.hits);
      break;
    case 'brand':
      found = bySkill(audio.brand, event.skill, event.pos);
      break;
    case 'stun':
      found = worldCues(audio, 'monster_stunned', event.pos);
      break;
    case 'skill_interrupt':
    case 'channel_end':
    case 'chain':
    case 'beam':
    case 'blink':
    case 'soak':
    case 'mend':
    case 'heal':
    case 'skill_unlocked':
    case 'chart_point':
    case 'monster_remove':
    case 'xp':
    case 'glitch_start':
    case 'glitch_end':
    case 'glitch_word':
    case 'unison_look':
    case 'unison_flinch':
    case 'moment_mark':
    case 'moment_ended':
    case 'item_found':
    case 'moment_gone':
    case 'moment_chest':
    case 'chest_opened':
    case 'cache_opened':
    case 'run_set':
    case 'run_ended':
    case 'path_marked':
    case 'character_changed':
    case 'explored':
    case 'zone_changed':
    case 'checkpoint':
    case 'armed':
    case 'dialogue_line':
    case 'dialogue_closed':
    case 'act_ended':
    case 'triggered':
    case 'exit_locked':
    case 'boss_phase':
    case 'boss_defeated':
    case 'bark':
    case 'scene_lead':
    case 'scene_ward':
    case 'revive':
    case 'boss_held':
    case 'count_broken':
    case 'piece_unsealed':
    case 'flask_upgraded':
    case 'flasks_refilled':
      break;
  }
  return found;
}

export type ChannelSound = { readonly type: 'hold'; readonly actorId: number } | { readonly type: 'release'; readonly actorId: number };

export function channelSound(event: WorldEvent): ChannelSound | null {
  if (event.type === 'skill_start') return event.skill.press?.type === 'channel' ? { type: 'hold', actorId: event.actorId } : null;
  if (event.type === 'channel_end') return { type: 'release', actorId: event.actorId };
  return null;
}

export function warmSoundIds(audio: AudioDef): readonly string[] {
  const ids: Set<string> = new Set<string>();
  for (const name of WARM_TABLES) {
    for (const list of audio[name].values()) {
      for (const cue of list) ids.add(cue.sound);
    }
  }
  return [...ids];
}

export function cuesForLife(audio: AudioDef, event: LifeSoundEvent, position: Vec2): readonly SoundCue[] {
  return cues(audio.life, event, position);
}

export function cuesForUi(audio: AudioDef, action: UiAction): readonly SoundCue[] {
  return cues(audio.ui, action, null);
}

export function uiActionForCommand(command: Command): UiAction | null {
  let action: UiAction | null = null;
  switch (command.type) {
    case 'allocate':
    case 'refund':
    case 'respec':
    case 'choose_change':
      action = 'skill_point';
      break;
    case 'equip':
    case 'hero':
    case 'unequip':
    case 'arrange':
    case 'slot':
      action = 'equip';
      break;
    case 'trade':
      action = command.action.type === 'close' ? null : 'equip';
      break;
    case 'purse':
      break;
    case 'move':
    case 'walk':
    case 'skill':
    case 'pickup':
    case 'stop':
    case 'drop':
    case 'travel':
    case 'talk':
    case 'advance':
    case 'replay':
    case 'teleport':
    case 'respawn':
    case 'leave_duel':
    case 'flask':
    case 'use':
    case 'use_item':
    case 'enter_portal':
    case 'set_out':
    case 'open':
    case 'read':
    case 'glitch':
    case 'glitch_setting':
    case 'strike':
    case 'spawn':
    case 'bench':
    case 'hold':
    case 'steer':
      break;
  }
  return action;
}

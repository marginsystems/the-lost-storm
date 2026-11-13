import type { AudioDef, CueDef, CueTable, UiAction, WorldSoundEvent } from './content/audio.ts';
import { GOLD_KEY, PLAYER_KEY } from './content/audio.ts';
import type { Vec2 } from './math.ts';
import type { Command, GroundItem, MonsterState, WakeBeat, World, WorldEvent } from './world/types.ts';

export interface SoundCue extends CueDef {
  readonly position: Vec2 | null;
}

const NONE: readonly SoundCue[] = [];

type CueTableName = Exclude<keyof AudioDef, 'defaults' | 'ambience'>;

const WARM_TABLES: readonly CueTableName[] = ['world', 'skillStart', 'hit', 'critHit', 'skillHit', 'skillImpact', 'projectileSpawn', 'projectileExpire', 'death', 'aggro', 'pickup', 'drop', 'notice', 'ui'];

function cues(table: CueTable, key: string, position: Vec2 | null): readonly SoundCue[] {
  const list: readonly CueDef[] | undefined = table.get(key);
  if (list === undefined || list.length === 0) return NONE;
  return list.map((entry: CueDef): SoundCue => ({ sound: entry.sound, volume: entry.volume, maxVoices: entry.maxVoices, cooldown: entry.cooldown, reach: entry.reach, position }));
}

function monsterOf(world: World, id: number): MonsterState | undefined {
  return world.monsters.find((monster: MonsterState): boolean => monster.id === id);
}

function positionOf(world: World, actorId: number): Vec2 | null {
  const actor: { readonly pos: Vec2 } | undefined = actorId === world.player.id ? world.player : monsterOf(world, actorId);
  return actor === undefined ? null : { x: actor.pos.x, z: actor.pos.z };
}

function targetKey(world: World, team: 'player' | 'monster', id: number): string | null {
  if (team === 'player') return PLAYER_KEY;
  return monsterOf(world, id)?.def.id ?? null;
}

function groundKey(ground: GroundItem): string {
  return ground.content.kind === 'gold' ? GOLD_KEY : ground.content.item.rarity;
}

const WAKE_SOUNDS: Readonly<Record<WakeBeat, WorldSoundEvent>> = { stir: 'wake_stir', front: 'wake_front', standing: 'wake_standing' };

function worldCues(audio: AudioDef, event: WorldSoundEvent, position: Vec2 | null): readonly SoundCue[] {
  return cues(audio.world, event, position);
}

export function cuesForEvent(audio: AudioDef, world: World, event: WorldEvent): readonly SoundCue[] {
  let found: readonly SoundCue[] = NONE;
  switch (event.type) {
    case 'skill_start':
      found = cues(audio.skillStart, event.skill.id, positionOf(world, event.actorId));
      break;
    case 'skill_impact':
      found = cues(audio.skillImpact, event.skill.id, event.origin);
      break;
    case 'projectile_spawn':
      found = cues(audio.projectileSpawn, event.projectile.skill.id, event.projectile.pos);
      break;
    case 'projectile_end':
      if (!event.hit) found = cues(audio.projectileExpire, event.skill.id, event.pos);
      break;
    case 'damage': {
      const key: string | null = targetKey(world, event.targetTeam, event.targetId);
      const fromSkill: readonly SoundCue[] = cues(audio.skillHit, event.skill.id, event.pos);
      found = key === null ? fromSkill : [...fromSkill, ...cues(event.crit ? audio.critHit : audio.hit, key, event.pos)];
      break;
    }
    case 'death': {
      const key: string | null = targetKey(world, event.team, event.actorId);
      if (key !== null) found = cues(audio.death, key, event.pos);
      break;
    }
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
      found = worldCues(audio, 'hero_step', event.pos);
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
    case 'moment_strike':
      found = worldCues(audio, event.moment.combat ? 'moment_strike' : 'moment_strike_soft', { x: event.moment.pos.x, z: event.moment.pos.z });
      break;
    case 'moment_woke':
      found = worldCues(audio, event.turned.length > 0 ? 'moment_hostile' : 'moment_calm', event.moment.pos);
      break;
    case 'wake':
      found = worldCues(audio, WAKE_SOUNDS[event.beat], positionOf(world, world.player.id));
      break;
    case 'hazard':
      if (event.burst) found = cues(audio.skillImpact, event.hazard.skill.id, event.hazard.pos);
      break;
    case 'guarded':
    case 'skill_interrupt':
    case 'area':
    case 'chain':
    case 'beam':
    case 'blink':
    case 'brand':
    case 'skill_unlocked':
    case 'chart_point':
    case 'monster_remove':
    case 'xp':
    case 'glitch_start':
    case 'glitch_end':
    case 'glitch_word':
    case 'silence':
    case 'zone_edited':
    case 'moment_mark':
    case 'moment_ended':
    case 'moment_gone':
    case 'moment_chest':
    case 'chest_opened':
    case 'path_marked':
    case 'character_changed':
    case 'explored':
    case 'zone_changed':
    case 'checkpoint':
    case 'dialogue_line':
    case 'dialogue_closed':
    case 'act_ended':
    case 'triggered':
    case 'exit_locked':
    case 'boss_phase':
    case 'bark':
    case 'revive':
    case 'flasks_refilled':
      break;
  }
  return found;
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

export function cuesForUi(audio: AudioDef, action: UiAction): readonly SoundCue[] {
  return cues(audio.ui, action, null);
}

export function uiActionForCommand(command: Command): UiAction | null {
  let action: UiAction | null = null;
  switch (command.type) {
    case 'allocate':
    case 'refund':
    case 'respec':
      action = 'skill_point';
      break;
    case 'equip':
    case 'hero':
    case 'unequip':
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
    case 'teleport':
    case 'respawn':
    case 'flask':
    case 'use':
    case 'open':
    case 'read':
    case 'glitch':
    case 'glitch_setting':
    case 'overlay':
    case 'strike':
    case 'hold':
    case 'steer':
      break;
  }
  return action;
}

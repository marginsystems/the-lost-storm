import type { ZoneTerrain } from './terrain-types.ts';
import type { ZoneBarrier } from './barrier-types.ts';
import type { ZoneScatter } from './scatter-types.ts';
import type { Condition } from './condition-types.ts';
import type { ZoneAmbience } from './ambience-types.ts';
import type { ZoneVoid } from './story-types.ts';
import type { ZoneDrift, ZoneHeroLight, ZoneTrigger, ZoneWeather } from './road-types.ts';
import type { ZoneTunnel } from './tunnel-types.ts';
import type { MomentField } from './moment-types.ts';
import type { SceneDef } from './scene-types.ts';

export interface ZonePoint {
  readonly x: number;
  readonly z: number;
}

export interface ZoneProp {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotationDegrees: number;
  readonly when: readonly Condition[];
}

export interface ZoneVoice {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly lines: readonly string[];
  readonly when: readonly Condition[];
}

export interface PackMember {
  readonly monster: string;
  readonly count: number;
  readonly mods: readonly string[];
}

export interface ZonePack {
  readonly x: number;
  readonly z: number;
  readonly members: readonly PackMember[];
  readonly when: readonly Condition[];
  readonly row?: ZonePoint;
  readonly level?: number;
  readonly waits?: PackWait;
  readonly rank?: string;
}

export interface PackWait {
  readonly near: number;
}

export interface PackReturn { readonly after: number; readonly away: number }

export interface SurgeRules {
  readonly delay: number;
  readonly surgesPerExtraMonster: number;
  readonly maxExtraMonsters: number;
}

export interface ZoneEdge {
  readonly props: readonly string[];
  readonly gap: number;
  readonly exitClear: number;
}

export interface ZoneOutside {
  readonly surface: string;
  readonly reach: number;
  readonly edge: ZoneEdge | null;
  readonly barrier: ZoneBarrier | null;
}

export interface ZoneWalls {
  readonly tall: readonly string[];
  readonly low: string;
  readonly corner: string;
  readonly halfThickness: number;
}

export const ZONE_KINDS = ['town', 'wild', 'void'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export type ExitLook = 'ring' | 'mist';

export interface ZoneExit {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly to: string;
  readonly toExit: string;
  readonly arrival: ZonePoint;
  readonly requires: readonly Condition[];
  readonly lockedHint: string;
  readonly hiddenWhenLocked: boolean;
  readonly look: ExitLook;
  readonly marker: string | null;
}

export interface ZoneReturn {
  readonly zone: string;
  readonly exit: string;
}

export interface ZoneWaypoint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly marker: string | null;
}

export interface ZoneCheckpoint {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly marker: string | null;
}

export interface ZoneNpc {
  readonly npc: string;
  readonly x: number;
  readonly z: number;
  readonly facingDegrees: number;
  readonly when: readonly Condition[];
}

export interface ZoneSize {
  readonly columns: number;
  readonly rows: number;
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly kind: ZoneKind;
  readonly level: number;
  readonly levelUpTo: number;
  readonly stormTier: number;
  readonly cellSize: number;
  readonly floorHeight: number;
  readonly terrain: ZoneTerrain | null;
  readonly tiles: readonly string[];
  readonly grewFrom: ZoneSize | null;
  readonly floors: Readonly<Record<string, string>>;
  readonly outside: ZoneOutside | null;
  readonly walls: ZoneWalls | null;
  readonly props: readonly ZoneProp[];
  readonly scatter: readonly ZoneScatter[];
  readonly playerStart: ZonePoint;
  readonly packs: readonly ZonePack[];
  readonly packReturn: PackReturn | null;
  readonly ranks: boolean;
  readonly surge: SurgeRules | null;
  readonly exits: readonly ZoneExit[];
  readonly checkpoints: readonly ZoneCheckpoint[];
  readonly waypoint: ZoneWaypoint | null;
  readonly markerSurfaces: Readonly<Record<string, string>>;
  readonly portalSpot: ZonePoint | null;
  readonly deathReturn: ZoneReturn | null;
  readonly npcs: readonly ZoneNpc[];
  readonly voices: readonly ZoneVoice[];
  readonly scenes: readonly SceneDef[];
  readonly ambience: ZoneAmbience;
  readonly void: ZoneVoid | null;
  readonly drifts: readonly ZoneDrift[];
  readonly triggers: readonly ZoneTrigger[];
  readonly moments: MomentField | null;
  readonly weather: ZoneWeather;
  readonly heroLight: ZoneHeroLight;
  readonly tunnels: readonly ZoneTunnel[];
}

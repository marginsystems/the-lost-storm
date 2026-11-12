import type { FlaskDef, FlaskResource } from '../content/flasks.ts';
import type { Content } from '../content/types.ts';
import type { FlaskDose, FlaskState, NoticeReason, PlayerState, World } from './types.ts';
import { refillFlasks } from './flask-charges.ts';
import { onWaypoint } from './waypoints.ts';

const FULL_NOTICE: Readonly<Record<FlaskResource, NoticeReason>> = { life: 'life_full', mana: 'mana_full' };

export function createFlasks(content: Content, saved: Readonly<Record<string, number>> | null): FlaskState[] {
  return content.flasks.map((def: FlaskDef): FlaskState => {
    const charges: number | undefined = saved?.[def.id];
    return { def, charges: charges === undefined ? def.maxCharges : Math.max(0, Math.min(def.maxCharges, Math.floor(charges))), cooldown: 0, doses: [] };
  });
}

export function flaskCharges(flasks: readonly FlaskState[]): Record<string, number> {
  return Object.fromEntries(flasks.map((flask: FlaskState): [string, number] => [flask.def.id, flask.charges]));
}

interface Pool {
  current(player: PlayerState): number;
  maximum(player: PlayerState): number;
  restore(player: PlayerState, amount: number): void;
}

const POOLS: Readonly<Record<FlaskResource, Pool>> = {
  life: {
    current: (player: PlayerState): number => player.life,
    maximum: (player: PlayerState): number => player.maxLife,
    restore: (player: PlayerState, amount: number): void => {
      player.life = Math.min(player.maxLife, player.life + amount);
    },
  },
  mana: {
    current: (player: PlayerState): number => player.mana,
    maximum: (player: PlayerState): number => player.stats.maxMana,
    restore: (player: PlayerState, amount: number): void => {
      player.mana = Math.min(player.stats.maxMana, player.mana + amount);
    },
  },
};

export function blockedFlask(player: PlayerState, flask: FlaskState): NoticeReason | null {
  if (flask.cooldown > 0) return 'on_cooldown';
  if (flask.charges < flask.def.chargesPerUse) return 'flask_empty';
  const pool: Pool = POOLS[flask.def.resource];
  if (pool.current(player) >= pool.maximum(player)) return FULL_NOTICE[flask.def.resource];
  return null;
}

export function useFlask(world: World, slot: number): void {
  const player: PlayerState = world.player;
  const flask: FlaskState | undefined = player.flasks[slot];
  if (flask === undefined || !player.alive) return;
  const reason: NoticeReason | null = blockedFlask(player, flask);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return;
  }
  flask.charges -= flask.def.chargesPerUse;
  flask.cooldown = flask.def.cooldown;
  flask.doses.push({ rate: flask.def.amount / flask.def.duration, timeLeft: flask.def.duration });
  world.events.push({ type: 'flask_used', slot, flask: flask.def.id, resource: flask.def.resource, pos: { x: player.pos.x, z: player.pos.z } });
}

export function isRestoring(flask: FlaskState): boolean {
  return flask.doses.length > 0;
}

function stepFlask(player: PlayerState, flask: FlaskState, dt: number): void {
  flask.cooldown = Math.max(0, flask.cooldown - dt);
  if (!player.alive) {
    flask.doses = [];
    return;
  }
  for (const dose of flask.doses) {
    const spent: number = Math.min(dt, dose.timeLeft);
    POOLS[flask.def.resource].restore(player, dose.rate * spent);
    dose.timeLeft -= spent;
  }
  flask.doses = flask.doses.filter((dose: FlaskDose): boolean => dose.timeLeft > 0);
}

export function stepFlasks(world: World, dt: number): void {
  const player: PlayerState = world.player;
  for (const flask of player.flasks) stepFlask(player, flask, dt);
  if (player.alive && (world.zone.kind === 'town' || onWaypoint(world))) refillFlasks(player);
}

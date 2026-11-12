import type { PlayerState } from './types.ts';

export function refillFlasks(player: PlayerState): void {
  for (const flask of player.flasks) flask.charges = flask.def.maxCharges;
}

export function gainFlaskCharges(player: PlayerState): void {
  for (const flask of player.flasks) flask.charges = Math.min(flask.def.maxCharges, flask.charges + flask.def.chargesPerKill);
}

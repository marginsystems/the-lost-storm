import type { PlayerState } from './types.ts';

export function refillFlasks(player: PlayerState): boolean {
  let changed: boolean = false;
  for (const flask of player.flasks) {
    if (flask.charges === flask.def.maxCharges) continue;
    flask.charges = flask.def.maxCharges;
    changed = true;
  }
  return changed;
}

export function gainFlaskCharges(player: PlayerState): void {
  for (const flask of player.flasks) flask.charges = Math.min(flask.def.maxCharges, flask.charges + flask.def.chargesPerKill * (1 + player.stats.flaskCharges));
}

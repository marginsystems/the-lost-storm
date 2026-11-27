import type { SkillDef } from '../content/types.ts';
import type { ActionState } from './types.ts';

export function isDodge(skill: SkillDef): boolean {
  switch (skill.delivery.type) {
    case 'dash':
    case 'blink':
      return true;
    case 'arc':
    case 'nova':
    case 'projectile':
    case 'mark':
    case 'field':
    case 'revive':
    case 'area':
    case 'chain':
    case 'beam':
      return false;
  }
  return false;
}

export function recoveringFromDodge(action: ActionState | null): boolean {
  return action?.phase === 'recovery' && isDodge(action.skill);
}

export function dodgesAtOnce(skill: SkillDef, targeted: boolean): boolean {
  return isDodge(skill) && (skill.delivery.type === 'dash' || !targeted);
}

export function givesWayToDodge(action: ActionState, held: boolean): boolean {
  switch (action.phase) {
    case 'recovery':
    case 'channel':
      return true;
    case 'windup':
      return held && action.skill.press !== null;
  }
  return false;
}

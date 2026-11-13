import { UNREADABLE_KEY } from './backend/local.ts';
import { HINTS_KEY } from './hints-store.ts';
import { PLAYED_KEY } from './launch/played.ts';
import { HERO_KEY } from './lobby/hero-choice.ts';
import { HERO_NAME_KEY } from './lobby/hero-name.ts';

export const CHARACTER_KEYS: readonly string[] = [PLAYED_KEY, HINTS_KEY, HERO_KEY, HERO_NAME_KEY, UNREADABLE_KEY];

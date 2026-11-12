import alpha from '../../data/alpha.json' with { type: 'json' };
import links from '../../data/links.json' with { type: 'json' };
import { readAlphaRules } from './alpha.ts';
import type { AlphaRules } from './alpha.ts';
import { readLinks } from './links.ts';
import type { Links } from './links.ts';

export const ALPHA_RULES: AlphaRules = readAlphaRules(alpha);
export const LINKS: Links = readLinks(links);

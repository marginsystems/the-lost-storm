import attachments from '../../data/attachments.json' with { type: 'json' };
import books from '../../data/books.json' with { type: 'json' };
import factions from '../../data/factions.json' with { type: 'json' };
import flasks from '../../data/flasks.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsterMods from '../../data/monster-mods.json' with { type: 'json' };
import moments from '../../data/moments.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import trade from '../../data/trade.json' with { type: 'json' };
import surfaces from '../../data/surfaces.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import world from '../../data/world.json' with { type: 'json' };
import between from '../../data/zones/between.json' with { type: 'json' };
import shallows from '../../data/zones/shallows.json' with { type: 'json' };
import waystation from '../../data/zones/waystation.json' with { type: 'json' };
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

export const RAW_CONTENT: RawContent = { skills, monsters, monsterMods, factions, items, skillTree, rigs, attachments, wearables, surfaces, props, zones: [between, shallows, waystation], world, npcs, lines, quests, player, flasks, trade, books, moments };

export function loadContent(): Content {
  const content: Content = parseContent(RAW_CONTENT);
  const problems: string[] = contentProblems(content);
  if (problems.length > 0) throw new ContentError('content', problems.join('; '));
  return content;
}

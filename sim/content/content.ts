import attachments from '../../data/attachments.json' with { type: 'json' };
import books from '../../data/books.json' with { type: 'json' };
import factions from '../../data/factions.json' with { type: 'json' };
import flasks from '../../data/flasks.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsterMods from '../../data/monster-mods.json' with { type: 'json' };
import moments from '../../data/moments.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import packRanks from '../../data/pack-ranks.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import footprints from '../../data/footprints.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import chart from '../../data/chart.json' with { type: 'json' };
import trade from '../../data/trade.json' with { type: 'json' };
import surfaces from '../../data/surfaces.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import baseLayers from '../../data/base-layers.json' with { type: 'json' };
import world from '../../data/world.json' with { type: 'json' };
import between from '../../data/zones/between.json' with { type: 'json' };
import hallOfTime from '../../data/zones/hall_of_time.json' with { type: 'json' };
import hideout from '../../data/zones/hideout.json' with { type: 'json' };
import keepersGate from '../../data/zones/keepers_gate.json' with { type: 'json' };
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';
import { modelFootprints, withFootprints } from './footprints.ts';

export const RAW_CONTENT: RawContent = { skills, monsters, monsterMods, factions, items, skillTree, chart, rigs, attachments, wearables, baseLayers, surfaces, props, zones: [between, hallOfTime, hideout, keepersGate], world, npcs, lines, quests, player, flasks, trade, books, moments, packRanks };

export function loadContent(): Content {
  const parsed: Content = parseContent(RAW_CONTENT);
  const content: Content = { ...parsed, props: withFootprints(parsed.props, modelFootprints(footprints, 'footprints')) };
  const problems: string[] = contentProblems(content);
  if (problems.length > 0) throw new ContentError('content', problems.join('; '));
  return content;
}

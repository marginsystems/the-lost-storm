import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsterMods from '../../data/monster-mods.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import surfaces from '../../data/surfaces.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import world from '../../data/world.json' with { type: 'json' };
import drownedBastion from '../../data/zones/drowned_bastion.json' with { type: 'json' };
import dusksEnd from '../../data/zones/dusks_end.json' with { type: 'json' };
import duskway from '../../data/zones/duskway.json' with { type: 'json' };
import stillhold from '../../data/zones/stillhold.json' with { type: 'json' };
import theCoursework from '../../data/zones/the_coursework.json' with { type: 'json' };
import theSpill from '../../data/zones/the_spill.json' with { type: 'json' };
import theStill from '../../data/zones/the_still.json' with { type: 'json' };
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

export const RAW_CONTENT: RawContent = { skills, monsters, monsterMods, items, skillTree, rigs, attachments, wearables, surfaces, props, zones: [stillhold, duskway, dusksEnd, theSpill, theCoursework, theStill, drownedBastion], world, npcs, lines, quests, player };

export function loadContent(): Content {
  const content: Content = parseContent(RAW_CONTENT);
  const problems: string[] = contentProblems(content);
  if (problems.length > 0) throw new ContentError('content', problems.join('; '));
  return content;
}

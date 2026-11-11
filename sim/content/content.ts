import arena from '../../data/arena.json' with { type: 'json' };
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import { contentProblems, parseContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

export function loadContent(): Content {
  const content: Content = parseContent({ skills, monsters, items, skillTree, rigs, attachments, wearables, props, arena, player });
  const problems: string[] = contentProblems(content);
  if (problems.length > 0) throw new ContentError('content', problems.join('; '));
  return content;
}

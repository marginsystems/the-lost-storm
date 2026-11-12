import type { LineDef, NpcDef } from '../content/types.ts';
import type { GlitchState } from './glitch-types.ts';
import type { World } from './types.ts';

export function spokenLine(world: World, line: LineDef): LineDef {
  const state: GlitchState = world.glitch;
  const speaker: NpcDef | undefined = world.content.npcs.get(line.speaker);
  if (!state.wrongWord || speaker === undefined) return line;
  const names: readonly string[] = state.def.wrongWord.names.filter((name: string): boolean => !speaker.name.includes(name));
  const name: string | undefined = names[Math.min(names.length - 1, Math.floor(state.rng.next() * names.length))];
  if (name === undefined) return line;
  state.wrongWord = false;
  world.events.push({ type: 'glitch_word', npc: speaker.id, name });
  return { ...line, text: state.def.wrongWord.template.replace('{name}', name).replace('{line}', line.text) };
}

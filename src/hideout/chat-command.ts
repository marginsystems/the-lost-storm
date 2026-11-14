export const CHAT_COMMAND = {
  prefix: '/',
  quote: '"',
  nameWords: 3,
  nameChars: 16,
  general: ['g', 'general'],
  whisper: ['dm', 'w', 'whisper'],
  reply: ['r', 'reply'],
  help: ['help', '?'],
} as const;

export type ChatCommand =
  | { readonly kind: 'empty' }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'general'; readonly text: string | null }
  | { readonly kind: 'whisper'; readonly name: string; readonly text: string | null }
  | { readonly kind: 'reply'; readonly text: string | null }
  | { readonly kind: 'help' }
  | { readonly kind: 'no_name'; readonly command: string }
  | { readonly kind: 'unknown'; readonly command: string };

interface Named {
  readonly name: string;
  readonly rest: string;
}

const SPACES: RegExp = /\s+/g;

function tidy(text: string): string {
  return text.trim().replaceAll(SPACES, ' ');
}

export function nameKey(name: string): string {
  return name.toLowerCase().replaceAll(SPACES, '');
}

function textOf(rest: string): string | null {
  const text: string = rest.trim();
  return text === '' ? null : text;
}

function quoted(rest: string): Named | null {
  if (!rest.startsWith(CHAT_COMMAND.quote)) return null;
  const end: number = rest.indexOf(CHAT_COMMAND.quote, CHAT_COMMAND.quote.length);
  if (end < 0) return { name: tidy(rest.slice(CHAT_COMMAND.quote.length)), rest: '' };
  return { name: tidy(rest.slice(CHAT_COMMAND.quote.length, end)), rest: rest.slice(end + CHAT_COMMAND.quote.length) };
}

function known(rest: string, names: readonly string[]): Named | null {
  const words: readonly string[] = rest.split(' ').filter((word: string): boolean => word !== '');
  const byKey: ReadonlyMap<string, string> = new Map(names.map((name: string): [string, string] => [nameKey(name), name]));
  for (let count: number = Math.min(CHAT_COMMAND.nameWords, words.length); count > 1; count -= 1) {
    const candidate: string = words.slice(0, count).join(' ');
    if (candidate.length > CHAT_COMMAND.nameChars) continue;
    const found: string | undefined = byKey.get(nameKey(candidate));
    if (found !== undefined) return { name: found, rest: words.slice(count).join(' ') };
  }
  const first: string | undefined = words[0];
  if (first === undefined) return null;
  return { name: byKey.get(nameKey(first)) ?? first, rest: words.slice(1).join(' ') };
}

function named(rest: string, names: readonly string[]): Named | null {
  const found: Named | null = quoted(rest) ?? known(tidy(rest), names);
  return found === null || found.name === '' ? null : found;
}

function among(word: string, list: readonly string[]): boolean {
  return list.includes(word);
}

export function parseChat(raw: string, names: readonly string[]): ChatCommand {
  const line: string = raw.trim();
  if (line === '') return { kind: 'empty' };
  if (!line.startsWith(CHAT_COMMAND.prefix)) return { kind: 'say', text: line };
  const body: string = line.slice(CHAT_COMMAND.prefix.length);
  const space: number = body.search(/\s/);
  const word: string = (space < 0 ? body : body.slice(0, space)).toLowerCase();
  const rest: string = space < 0 ? '' : body.slice(space + 1).trim();
  if (among(word, CHAT_COMMAND.general)) return { kind: 'general', text: textOf(rest) };
  if (among(word, CHAT_COMMAND.reply)) return { kind: 'reply', text: textOf(rest) };
  if (among(word, CHAT_COMMAND.help)) return { kind: 'help' };
  if (among(word, CHAT_COMMAND.whisper)) {
    const target: Named | null = named(rest, names);
    return target === null ? { kind: 'no_name', command: `${CHAT_COMMAND.prefix}${word}` } : { kind: 'whisper', name: target.name, text: textOf(target.rest) };
  }
  return { kind: 'unknown', command: `${CHAT_COMMAND.prefix}${word}` };
}

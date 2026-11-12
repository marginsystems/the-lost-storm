export function repeatedSteps(texts: readonly string[]): readonly boolean[] {
  const seen: Set<string> = new Set<string>();
  return texts.map((text: string): boolean => {
    if (text === '') return false;
    if (seen.has(text)) return true;
    seen.add(text);
    return false;
  });
}

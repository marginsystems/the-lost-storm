export function unsafeGlsl(source: string): string[] {
  const problems: string[] = [];
  for (const match of source.matchAll(/pow\(\s*([A-Za-z_]\w*)\s*,/g)) {
    const name: string = match[1] ?? '';
    if (!new RegExp(`float ${name} = (clamp|max)\\(`).test(source)) problems.push(`pow of ${name}, which is not clamped`);
  }
  for (const match of source.matchAll(/pow\(\s*[^A-Za-z_\s]/g)) problems.push(`pow of an expression: ${match[0]}`);
  for (const match of source.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
    if (Number(match[1]) >= Number(match[2])) problems.push(`smoothstep with edges out of order: ${match[0]}`);
  }
  return problems;
}

export const BROWSER_NOTICES = {
  webgl: 'This browser cannot draw the game: it needs WebGL 2. Try an up-to-date Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.',
  old: 'This browser is too old to run the game. Update it, or try an up-to-date Chrome, Edge, Firefox or Safari.',
} as const;

export interface BrowserProbe {
  readonly webgl2: boolean;
  readonly modernArrays: boolean;
}

export class UnsupportedBrowser extends Error {}

export function unsupportedReason(probe: BrowserProbe): string | null {
  if (!probe.modernArrays) return BROWSER_NOTICES.old;
  if (!probe.webgl2) return BROWSER_NOTICES.webgl;
  return null;
}

export function probeBrowser(scope: object, arrays: object): BrowserProbe {
  return { webgl2: 'WebGL2RenderingContext' in scope, modernArrays: ['toSorted', 'toReversed', 'findLast', 'at'].every((name: string): boolean => name in arrays) };
}

export function failureText(error: unknown): string {
  if (error instanceof UnsupportedBrowser) return error.message;
  return error instanceof Error ? `The storm failed to gather: ${error.message}` : 'The storm failed to gather.';
}

export function createdOrUnsupported<T>(create: () => T): T {
  try {
    return create();
  } catch {
    throw new UnsupportedBrowser(BROWSER_NOTICES.webgl);
  }
}

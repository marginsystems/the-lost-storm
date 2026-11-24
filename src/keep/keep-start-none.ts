import type { startKeepPrompt as startShown } from './keep-start.ts';
import type { KeepView } from './keep-view.ts';

const NO_KEEP_VIEW: KeepView = { update: (): void => undefined, rereadLevel: (): void => undefined };

export const startKeepPrompt: typeof startShown = (): KeepView => NO_KEEP_VIEW;

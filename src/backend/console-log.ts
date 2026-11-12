import type { Logger } from './backend.ts';

const PREFIX: string = 'Cloud save:';

export function createConsoleLogger(): Logger {
  return {
    info: (message: string): void => {
      console.info(`${PREFIX} ${message}`);
    },
    warn: (message: string): void => {
      console.warn(`${PREFIX} ${message}`);
    },
  };
}

export function warnInConsole(message: string): void {
  console.warn(message);
}

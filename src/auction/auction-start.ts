import type { Content } from '../../sim/content/types.ts';
import type { Command, World } from '../../sim/world/types.ts';
import type { Backend } from '../backend/backend.ts';
import { createBrowserAuctionHouse } from '../backend/browser.ts';
import type { AuctionHouse } from '../backend/auction.ts';
import type { SaveFold } from '../backend/purse-read.ts';
import { createAuctionFlow } from './auction-flow.ts';
import type { AuctionFlow } from './auction-flow.ts';

export interface AuctionStart {
  readonly content: Content;
  readonly serverUrl: string | undefined;
  readonly backend: Backend;
  readonly world: World;
  readonly send: (command: Command) => void;
  readonly save: () => void;
}

export function foldCommand(fold: SaveFold): Command {
  return { type: 'purse', entries: fold.folded, stripped: fold.stripped, unverified: fold.unverified };
}

export function startAuction(start: AuctionStart): AuctionFlow | null {
  const { backend, send } = start;
  backend.onFold((fold: SaveFold): void => send(foldCommand(fold)));
  const house: AuctionHouse | null = createBrowserAuctionHouse(start.content, start.serverUrl);
  if (house === null) return null;
  return createAuctionFlow({
    house,
    world: (): World => start.world,
    send,
    sync: (): Promise<void> => {
      start.save();
      return backend.sync();
    },
  });
}

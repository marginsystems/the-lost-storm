import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../../sim/content/content.ts';
import type { Replay } from '../../sim/rl/replay.ts';
import type { Frame, FrameReader } from './frames.ts';
import { createReader, readFrames } from './frames.ts';
import type { Reply, Session } from './session.ts';
import { handle } from './session.ts';

const SERVE = {
  replayFlag: '--replays',
  workerFlag: '--worker',
} as const;

function flagValue(name: string): string | null {
  const at: number = process.argv.indexOf(name);
  return at < 0 ? null : (process.argv[at + 1] ?? null);
}

function replayName(worker: string, replay: Replay): string {
  const tag: string = replay.label === '' ? 'untagged' : replay.label.replace(/[^a-z0-9-]+/gi, '-');
  return `${tag}-w${worker}-seed${replay.options.seed}-${replay.outcome}-${replay.total.toFixed(1)}.json`;
}

function saveReplays(folder: string | null, worker: string, keep: readonly Replay[]): void {
  if (folder === null || keep.length === 0) return;
  try {
    mkdirSync(folder, { recursive: true });
    for (const replay of keep) writeFileSync(join(folder, replayName(worker, replay)), JSON.stringify(replay));
  }
  catch (error: unknown) {
    process.stderr.write(`worker ${worker} could not save replays to ${folder}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function send(out: Buffer): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    if (process.stdout.write(out)) resolve();
    else process.stdout.once('drain', resolve);
  });
}

interface Inbox {
  readonly pending: Frame[];
  pumping: boolean;
  ended: boolean;
}

async function deliver(frames: Iterator<Buffer>): Promise<void> {
  const next: IteratorResult<Buffer> = frames.next();
  if (next.done === true) return;
  await send(next.value);
  await deliver(frames);
}

async function pump(session: Session, inbox: Inbox, folder: string | null, worker: string): Promise<void> {
  const received: Frame | undefined = inbox.pending.shift();
  if (received === undefined) {
    inbox.pumping = false;
    if (inbox.ended) process.exit(0);
    return;
  }
  const reply: Reply = handle(session, received);
  await deliver(reply.frames[Symbol.iterator]());
  saveReplays(folder, worker, reply.keep);
  if (reply.quit) process.exit(0);
  await pump(session, inbox, folder, worker);
}

function main(): void {
  const session: Session = { content: loadContent(), pool: null };
  const reader: FrameReader = createReader();
  const folder: string | null = flagValue(SERVE.replayFlag);
  const worker: string = flagValue(SERVE.workerFlag) ?? '0';
  const inbox: Inbox = { pending: [], pumping: false, ended: false };
  const run = (): void => {
    if (inbox.pumping) return;
    inbox.pumping = true;
    pump(session, inbox, folder, worker).catch((error: unknown): void => {
      process.stderr.write(`worker ${worker} stopped: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
  };
  process.stdin.on('data', (chunk: Buffer): void => {
    inbox.pending.push(...(readFrames(reader, chunk) satisfies Frame[]));
    run();
  });
  process.stdin.on('end', (): void => {
    inbox.ended = true;
    run();
  });
}

main();

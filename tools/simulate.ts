import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Measurement } from '../sim/measure.ts';
import { readStream } from '../sim/measure.ts';
import type { Command } from './simulate-args.ts';
import { parseArgs, USAGE } from './simulate-args.ts';
import type { DoneMessage, JobMessage } from './simulate-job.ts';
import { readDoneMessage } from './simulate-job.ts';
import { POLICIES } from './simulate-policies.ts';
import { buildRows, buildTable } from './simulate-builds.ts';
import { reportText } from './simulate-report.ts';
import type { Job } from './simulate-run.ts';
import { CONTENT, scenarioName } from './simulate-run.ts';
import type { Report, RunSummary } from './simulate-summary.ts';
import { buildReport, summarize } from './simulate-summary.ts';

const OUT_DIR: string = 'simulate-out';

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function slug(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function runPool(jobs: readonly Job[], workers: number, onDone: (index: number, stream: string) => void): Promise<void> {
  return new Promise((resolve: () => void, reject: (error: Error) => void): void => {
    let next: number = 0;
    let finished: number = 0;
    const pool: Worker[] = [];
    const feed = (worker: Worker): void => {
      const job: Job | undefined = jobs[next];
      if (job === undefined) return;
      const message: JobMessage = { index: next, job };
      next += 1;
      worker.postMessage(message, []);
    };
    const size: number = Math.max(1, Math.min(workers, jobs.length));
    for (let index: number = 0; index < size; index += 1) {
      const worker: Worker = new Worker(new URL('./simulate-worker.ts', import.meta.url));
      pool.push(worker);
      worker.on('error', (error: Error): void => {
        for (const each of pool) void each.terminate();
        reject(error);
      });
      worker.on('message', (value: unknown): void => {
        const done: DoneMessage = readDoneMessage(value);
        onDone(done.index, done.stream);
        finished += 1;
        if (finished === jobs.length) {
          for (const each of pool) void each.terminate();
          resolve();
          return;
        }
        feed(worker);
      });
      feed(worker);
    }
    if (jobs.length === 0) resolve();
  });
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function finish(report: Report, runs: readonly RunSummary[], out: string | null, label: string): void {
  const path: string = out ?? join(OUT_DIR, `${slug(label)}-${stamp()}.json`);
  write(path, `${JSON.stringify({ report, runs }, null, 1)}\n`);
  process.stdout.write(reportText(report));
  process.stdout.write(`\n${buildTable(buildRows(runs, POLICIES.reference))}\n`);
  process.stdout.write(`\nJSON report: ${path}\n`);
}

async function simulate(command: Extract<Command, { readonly kind: 'simulate' }>): Promise<void> {
  const label: string = scenarioName(command.scenario);
  const streams: (readonly Measurement[])[] = [];
  const started: number = performance.now();
  process.stderr.write(`${label}: ${command.jobs.length} runs on ${Math.min(command.workers, command.jobs.length)} workers\n`);
  await runPool(command.jobs, command.workers, (index: number, stream: string): void => {
    streams[index] = readStream(stream);
    const job: Job | undefined = command.jobs[index];
    if (command.record !== null && job !== undefined) write(join(command.record, `${slug(label)}-${job.skill}-${job.build}-${job.seed}.jsonl`), `${stream}\n`);
    process.stderr.write(`  ${streams.filter((entry: readonly Measurement[] | undefined): boolean => entry !== undefined).length}/${command.jobs.length} done\r`);
  });
  process.stderr.write(`\n${((performance.now() - started) / 1000).toFixed(1)} s\n`);
  const runs: RunSummary[] = streams.map(summarize);
  finish(buildReport(CONTENT, runs, POLICIES), runs, command.out, label);
}

function replay(files: readonly string[], out: string | null): void {
  const runs: RunSummary[] = files.map((file: string): RunSummary => summarize(readStream(readFileSync(file, 'utf8'))));
  finish(buildReport(CONTENT, runs, POLICIES), runs, out, `replay-${runs[0]?.scenario ?? 'none'}`);
}

async function main(): Promise<void> {
  const command: Command = parseArgs(process.argv.slice(2), POLICIES, new Set<string>(CONTENT.moments.defs.keys()), availableParallelism());
  switch (command.kind) {
    case 'help':
      process.stdout.write(`${command.problem === null ? '' : `${command.problem}\n\n`}${USAGE}\n`);
      if (command.problem !== null) process.exitCode = 1;
      return;
    case 'replay':
      replay(command.files, command.out);
      return;
    case 'simulate':
      await simulate(command);
      return;
  }
}

await main();

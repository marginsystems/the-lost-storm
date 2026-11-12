import { parentPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { toLine } from '../sim/measure.ts';
import type { DoneMessage, JobMessage } from './simulate-job.ts';
import { readJobMessage } from './simulate-job.ts';
import { POLICIES } from './simulate-policies.ts';
import { runJob } from './simulate-run.ts';

function serve(port: MessagePort): void {
  port.on('message', (value: unknown): void => {
    const message: JobMessage = readJobMessage(value);
    const done: DoneMessage = { index: message.index, stream: runJob(message.job, POLICIES).map(toLine).join('\n') };
    port.postMessage(done);
  });
}

if (parentPort !== null) serve(parentPort);

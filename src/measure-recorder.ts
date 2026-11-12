import type { Measurement, Meter, MilestoneRule } from '../sim/measure.ts';
import { createMeter, readMeter, sessionHeader, toLine } from '../sim/measure.ts';
import type { World, WorldEvent } from '../sim/world/types.ts';
import { POLICIES } from '../tools/simulate-policies.ts';

export const RECORDER = {
  maxLines: 200_000,
  scenario: 'live',
  file: 'the-lost-storm-session.jsonl',
} as const;

export interface MeasureRecorder {
  record(events: readonly WorldEvent[]): void;
  text(): string;
  count(): number;
}

export function createRecorder(world: World, build: string, rules: readonly MilestoneRule[] = POLICIES.milestones): MeasureRecorder {
  const meter: Meter = createMeter(world, rules);
  const lines: string[] = [toLine(sessionHeader('game', RECORDER.scenario, build, null)), ...readMeter(world, meter, [], true).map(toLine)];
  const push = (measurements: readonly Measurement[]): void => {
    for (const measurement of measurements) if (lines.length < RECORDER.maxLines) lines.push(toLine(measurement));
  };
  return {
    record: (events: readonly WorldEvent[]): void => push(readMeter(world, meter, events)),
    text: (): string => `${[...lines, toLine({ kind: 'end', t: Math.round((world.time - meter.origin) * 100) / 100, reason: 'saved' })].join('\n')}\n`,
    count: (): number => lines.length,
  };
}

export function saveRecording(recorder: MeasureRecorder): void {
  const url: string = URL.createObjectURL(new Blob([recorder.text()], { type: 'application/jsonl' }));
  const link: HTMLAnchorElement = document.createElement('a');
  link.href = url;
  link.download = RECORDER.file;
  link.click();
  URL.revokeObjectURL(url);
}

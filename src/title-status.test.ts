import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Timers } from './backend/backend.ts';
import type { LineEnd, LineNode, LineRoot } from './title-status.ts';
import { createStatusLine, STATUS_LINE } from './title-status.ts';

interface FakeNode extends LineNode {
  readonly classes: Set<string>;
  readonly attributes: Map<string, string>;
  finish(animationName: string): void;
}

interface FakeRoot extends LineRoot<FakeNode> {
  readonly children: FakeNode[];
  readonly classes: Set<string>;
  textContent: string | null;
  overwrite(text: string): void;
}

function fakeNode(root: FakeRoot): FakeNode {
  const classes: Set<string> = new Set<string>();
  const attributes: Map<string, string> = new Map<string, string>();
  const ended: ((event: LineEnd) => void)[] = [];
  const node: FakeNode = {
    get isConnected(): boolean {
      return root.children.includes(node);
    },
    textContent: null,
    className: '',
    classes,
    attributes,
    classList: {
      add: (token: string): void => {
        classes.add(token);
      },
    },
    setAttribute: (name: string, value: string): void => {
      attributes.set(name, value);
    },
    addEventListener: (_type: 'animationend', listener: (event: LineEnd) => void): void => {
      ended.push(listener);
    },
    remove: (): void => {
      const index: number = root.children.indexOf(node);
      if (index >= 0) root.children.splice(index, 1);
    },
    finish: (animationName: string): void => {
      for (const listener of ended) listener({ animationName });
    },
  };
  return node;
}

function fakeRoot(text: string): FakeRoot {
  const children: FakeNode[] = [];
  const classes: Set<string> = new Set<string>();
  const root: FakeRoot = {
    children,
    classes,
    classList: {
      contains: (token: string): boolean => classes.has(token),
    },
    textContent: text,
    append: (node: FakeNode): void => {
      children.push(node);
    },
    replaceChildren: (): void => {
      children.length = 0;
      root.textContent = '';
    },
    overwrite: (written: string): void => {
      children.length = 0;
      root.textContent = written;
    },
  };
  return root;
}

function maker(root: FakeRoot): () => FakeNode {
  return (): FakeNode => fakeNode(root);
}

interface StepTimers extends Timers {
  advance(ms: number): void;
}

function fakeTimers(): StepTimers {
  let now: number = 0;
  const tasks: { readonly at: number; readonly task: () => void }[] = [];
  return {
    after: (ms: number, task: () => void): (() => void) => {
      tasks.push({ at: now + ms, task });
      return (): void => undefined;
    },
    advance: (ms: number): void => {
      const end: number = now + ms;
      for (;;) {
        const due = tasks.filter((entry): boolean => entry.at <= end).toSorted((a, b): number => a.at - b.at)[0];
        if (due === undefined) break;
        tasks.splice(tasks.indexOf(due), 1);
        now = due.at;
        due.task();
      }
      now = end;
    },
  };
}

function texts(root: FakeRoot): readonly string[] {
  return root.children.map((node: FakeNode): string => `${node.textContent ?? ''}${node.classes.has(STATUS_LINE.leavingClass) ? ' (leaving)' : ''}`);
}

void test('the text already in the element becomes the first line, so nothing changes on the first frame', (): void => {
  const root: FakeRoot = fakeRoot('Gathering the storm…');
  const line = createStatusLine(root, maker(root), fakeTimers());
  assert.deepEqual(texts(root), ['Gathering the storm…']);
  assert.equal(line.current(), 'Gathering the storm…');
  assert.equal(root.children[0]?.className, STATUS_LINE.textClass);
});

void test('a new line enters while the old one leaves, and the old one is removed when its animation ends', (): void => {
  const root: FakeRoot = fakeRoot('Reading the rules…');
  const line = createStatusLine(root, maker(root), fakeTimers());
  const first: FakeNode | undefined = root.children[0];
  assert.ok(first !== undefined);
  line.show('Waking the world…');
  assert.deepEqual(texts(root), ['Reading the rules… (leaving)', 'Waking the world…']);
  assert.equal(first.attributes.get('aria-hidden'), 'true');
  first.finish('line-in');
  assert.deepEqual(texts(root), ['Reading the rules… (leaving)', 'Waking the world…']);
  first.finish(STATUS_LINE.leaveAnimation);
  assert.deepEqual(texts(root), ['Waking the world…']);
});

void test('a leaving line is removed after the settle time even when no animation runs', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  timers.advance(STATUS_LINE.settleMs);
  assert.deepEqual(texts(root), ['Two']);
});

void test('a line stays on screen until it has finished entering; texts that arrive meanwhile collapse into the latest one', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  line.show('Three');
  line.show('Four');
  assert.deepEqual(texts(root), ['One (leaving)', 'Two']);
  assert.equal(line.current(), 'Four');
  timers.advance(STATUS_LINE.dwellMs - 1);
  assert.deepEqual(texts(root), ['One (leaving)', 'Two']);
  timers.advance(1);
  assert.deepEqual(texts(root), ['One (leaving)', 'Two (leaving)', 'Four']);
  timers.advance(STATUS_LINE.settleMs);
  assert.deepEqual(texts(root), ['Four']);
});

void test('a text that returns to the one on screen before the dwell ends leaves that line in place', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  line.show('Three');
  line.show('Two');
  timers.advance(STATUS_LINE.settleMs);
  assert.deepEqual(texts(root), ['Two']);
});

void test('showing the same text again changes nothing, and an empty text leaves no line', (): void => {
  const root: FakeRoot = fakeRoot('');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  assert.deepEqual(texts(root), []);
  line.show('Ready');
  line.show('Ready');
  assert.deepEqual(texts(root), ['Ready']);
  timers.advance(STATUS_LINE.dwellMs);
  line.show('');
  assert.deepEqual(texts(root), ['Ready (leaving)']);
  assert.equal(line.current(), '');
});

void test('a frozen line takes no more texts, and a line held for its dwell is not added after the freeze', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  line.show('Three');
  line.freeze();
  line.show('Four');
  timers.advance(STATUS_LINE.settleMs);
  assert.deepEqual(texts(root), ['Two']);
});

void test('once the page has marked the status as failed, the line adds nothing more, even a text held for its dwell', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  line.show('Three');
  root.classes.add(STATUS_LINE.failedClass);
  timers.advance(STATUS_LINE.settleMs);
  line.show('Four');
  assert.deepEqual(texts(root), ['Two']);
});

void test('a failure text written over the line stops it for good, even after the failed class is cleared before a held line is due', (): void => {
  const root: FakeRoot = fakeRoot('One');
  const timers: StepTimers = fakeTimers();
  const line = createStatusLine(root, maker(root), timers);
  line.show('Two');
  line.show('Three');
  root.overwrite('Loading failed. Reload the page.');
  root.classes.add(STATUS_LINE.failedClass);
  root.classes.delete(STATUS_LINE.failedClass);
  timers.advance(STATUS_LINE.settleMs);
  line.show('Four');
  timers.advance(STATUS_LINE.settleMs);
  assert.deepEqual(texts(root), []);
  assert.equal(root.textContent, 'Loading failed. Reload the page.');
});

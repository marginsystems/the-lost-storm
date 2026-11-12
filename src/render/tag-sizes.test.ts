import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TagMeasure, TagSize, TagSizes } from './tag-sizes.ts';
import { createTagSizes } from './tag-sizes.ts';

interface FakeTag {
  width: number;
}

interface FakeMeasure {
  readonly how: TagMeasure<FakeTag>;
  readonly reads: FakeTag[];
  readonly changes: Map<FakeTag, () => void>;
}

function fakeMeasure(): FakeMeasure {
  const reads: FakeTag[] = [];
  const changes: Map<FakeTag, () => void> = new Map<FakeTag, () => void>();
  return {
    reads,
    changes,
    how: {
      measure(tag: FakeTag): TagSize {
        reads.push(tag);
        return { width: tag.width, height: 20 };
      },
      watch(tag: FakeTag, changed: () => void): void {
        changes.set(tag, changed);
      },
    },
  };
}

void test('a tag is measured once, then served from the cache frame after frame', (): void => {
  const fake: FakeMeasure = fakeMeasure();
  const sizes: TagSizes<FakeTag> = createTagSizes(fake.how);
  const tag: FakeTag = { width: 120 };
  for (let frame: number = 0; frame < 60; frame += 1) assert.deepEqual(sizes.size(tag), { width: 120, height: 20 });
  assert.equal(fake.reads.length, 1);
  assert.equal(fake.changes.size, 1);
});

void test('a tag that changes size is measured again on the next read, and only then', (): void => {
  const fake: FakeMeasure = fakeMeasure();
  const sizes: TagSizes<FakeTag> = createTagSizes(fake.how);
  const tag: FakeTag = { width: 120 };
  sizes.size(tag);
  tag.width = 150;
  assert.equal(sizes.size(tag).width, 120);
  fake.changes.get(tag)?.();
  assert.equal(sizes.size(tag).width, 150);
  assert.equal(sizes.size(tag).width, 150);
  assert.equal(fake.reads.length, 2);
  assert.equal(fake.changes.size, 1);
});

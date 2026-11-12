import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { createWorld } from '../../sim/world/create.ts';
import { setOverlay } from '../../sim/world/glitch.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { createOverlayWatch, markOverlay, OVERLAY_MARK, overlayShown } from './overlay-mark.ts';
import type { Markable, OverlayScope } from './overlay-mark.ts';

interface FakeDom extends OverlayScope {
  readonly panel: Markable;
  readonly reader: Markable;
}

function fakeDom(): FakeDom {
  const marked: Set<string> = new Set<string>();
  const listeners: (() => void)[] = [];
  const element = (name: string): Markable => ({
    toggleAttribute(attribute: string, force: boolean): boolean {
      assert.equal(attribute, OVERLAY_MARK.attribute);
      if (force) marked.add(name);
      else marked.delete(name);
      return force;
    },
    dispatchEvent(event: Event): boolean {
      assert.equal(event.type, OVERLAY_MARK.event);
      assert.equal(event.bubbles, true);
      for (const listener of listeners) listener();
      return true;
    },
  });
  return {
    panel: element('panel'),
    reader: element('reader'),
    querySelector(selectors: string): unknown {
      assert.equal(selectors, `[${OVERLAY_MARK.attribute}]`);
      return marked.size > 0 ? {} : null;
    },
    addEventListener(type: string, listener: () => void): void {
      assert.equal(type, OVERLAY_MARK.event);
      listeners.push(listener);
    },
  };
}

function apply(world: World, sent: readonly Command[]): void {
  for (const command of sent) if (command.type === 'overlay') setOverlay(world, command.open);
}

void test('any marked overlay counts as open until every one of them closes', (): void => {
  const dom: FakeDom = fakeDom();
  assert.equal(overlayShown(dom), false);
  markOverlay(dom.panel, true);
  markOverlay(dom.reader, true);
  markOverlay(dom.panel, false);
  assert.equal(overlayShown(dom), true);
  markOverlay(dom.reader, false);
  assert.equal(overlayShown(dom), false);
});

void test('the watch tells the sim the moment a mark changes, once per change, and sends again if a command was lost', (): void => {
  const dom: FakeDom = fakeDom();
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  const sent: Command[] = [];
  const watch = createOverlayWatch(dom, (command: Command): void => {
    sent.push(command);
  });
  watch.update(world, 0.1);
  assert.deepEqual(sent, []);
  markOverlay(dom.panel, true);
  markOverlay(dom.reader, true);
  assert.deepEqual(sent, [{ type: 'overlay', open: true }]);
  watch.update(world, 0);
  watch.update(world, 0);
  assert.deepEqual(sent, [{ type: 'overlay', open: true }]);
  sent.length = 0;
  watch.update(world, 0.1);
  assert.deepEqual(sent, [{ type: 'overlay', open: true }]);
  apply(world, sent);
  sent.length = 0;
  watch.update(world, 0.1);
  assert.deepEqual(sent, []);
  markOverlay(dom.panel, false);
  assert.deepEqual(sent, []);
  markOverlay(dom.reader, false);
  assert.deepEqual(sent, [{ type: 'overlay', open: false }]);
  apply(world, sent);
  watch.update(world, 0.1);
  assert.deepEqual(sent, [{ type: 'overlay', open: false }]);
  assert.equal(world.glitch.overlay, false);
});

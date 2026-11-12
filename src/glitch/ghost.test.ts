import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { contactShadow, CONTACT_SHADOW_NAME } from '../render/contact-shadow.ts';
import { createGhost } from './ghost.ts';
import type { Ghost } from './ghost.ts';

void test('a ghost copies the figure without its contact shadow', (): void => {
  const figure: Group = new Group();
  figure.add(contactShadow());
  const ghost: Ghost = createGhost(figure, 0xffffff, 0.5);
  assert.equal(ghost.root.getObjectByName(CONTACT_SHADOW_NAME), undefined);
  assert.notEqual(figure.getObjectByName(CONTACT_SHADOW_NAME), undefined);
  ghost.dispose();
});

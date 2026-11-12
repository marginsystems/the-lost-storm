import assert from 'node:assert/strict';
import type { Mesh } from 'three';
import { test } from 'node:test';
import { contactAlpha, contactShadow } from './contact-shadow.ts';

void test('the contact shadow is darkest under the feet and gone at its rim', (): void => {
  assert.equal(contactAlpha(0), 1);
  assert.equal(contactAlpha(1), 0);
  assert.ok(contactAlpha(0.3) > contactAlpha(0.7));
});

void test('every contact shadow shares one geometry and one material', (): void => {
  const a: Mesh = contactShadow();
  const b: Mesh = contactShadow();
  assert.notEqual(a, b);
  assert.equal(a.geometry, b.geometry);
  assert.equal(a.material, b.material);
  assert.equal(a.castShadow, false);
});

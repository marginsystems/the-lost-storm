import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group, Mesh, ShaderMaterial } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import { must } from '../../test/support.ts';
import type { Telegraphs } from './telegraphs.ts';
import { createTelegraphs } from './telegraphs.ts';

void test('Open Seam outlines the simulated pull radius around its ground target', (): void => {
  const skill: SkillDef = must(loadContent().skills.get('loom_seam'), 'Open Seam');
  assert.ok(skill.delivery.type === 'area');
  const parent: Group = new Group();
  const tells: Telegraphs = createTelegraphs(parent);
  const target = { x: 21, z: 18 };
  tells.start(1, 'actor', target, { x: 0, z: 1 }, skill, skill.windup, new Color(0xcc5450), 0);
  const shape = must(parent.children[0], 'windup');
  assert.equal(shape.position.x, target.x);
  assert.equal(shape.position.z, target.z);
  const bands = shape.children.filter((child): boolean => child instanceof Mesh && child.material instanceof ShaderMaterial && child.material.uniforms['uBand']?.value > 0);
  assert.equal(bands.length, 1);
  const edge = must(bands[0], 'thread edge');
  assert.ok(edge instanceof Mesh && edge.material instanceof ShaderMaterial);
  assert.equal(edge.material.uniforms['uRadius']?.value, skill.delivery.radius);
  assert.equal(edge.material.uniforms['uFill']?.value, 0);
  tells.clear();
  assert.equal(parent.children.length, 0);
});

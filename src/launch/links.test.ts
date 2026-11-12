import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLinks, outboundLinks, readLinks } from './links.ts';
import type { Links } from './links.ts';

const BASE: Readonly<Record<string, unknown>> = { site: 'https://theloststorm.com', play: 'https://theloststorm.com/play/', github: 'https://github.com/marginsystems/the-lost-storm', discord: '', x: '' };

void test('empty optional links read as absent, and every link must be https', (): void => {
  const links: Links = readLinks(BASE);
  assert.equal(links.discord, null);
  assert.equal(links.x, null);
  assert.equal(readLinks({ ...BASE, discord: 'https://discord.gg/abc' }).discord, 'https://discord.gg/abc');
  assert.throws((): Links => readLinks({ ...BASE, discord: 'http://discord.gg/abc' }));
  assert.throws((): Links => readLinks({ ...BASE, x: 'javascript:alert(1)' }));
  assert.throws((): Links => readLinks({ ...BASE, github: '' }));
  assert.throws((): Links => readLinks([]));
});

void test('outbound links list only what is set, Discord first', (): void => {
  assert.deepEqual(outboundLinks(readLinks(BASE)).map((link) => link.id), ['github']);
  assert.deepEqual(outboundLinks(readLinks({ ...BASE, discord: 'https://discord.gg/abc', x: 'https://x.com/theloststorm' })).map((link) => link.label), ['Discord', 'GitHub', 'X']);
});

void test('a page loses every element of an empty link and the rest open in a new tab', (): void => {
  const html: string = '<p><a class="play quiet" data-link="discord">Join the Discord</a><a data-link="github">GitHub</a></p><button data-copy="%LINK_SITE%">Copy</button>';
  assert.equal(applyLinks(html, readLinks(BASE)), '<p><a href="https://github.com/marginsystems/the-lost-storm" target="_blank" rel="noopener">GitHub</a></p><button data-copy="https://theloststorm.com">Copy</button>');
  const filled: string = applyLinks(html, readLinks({ ...BASE, discord: 'https://discord.gg/a"b' }));
  assert.match(filled, /<a class="play quiet" href="https:\/\/discord.gg\/a&quot;b" target="_blank" rel="noopener">Join the Discord<\/a>/);
  assert.throws((): string => applyLinks('<a data-link="myspace">M</a>', readLinks(BASE)));
});

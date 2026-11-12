import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLinks } from './links.ts';
import { applyServer, buildPage } from './page-html.ts';

const HTML: string = '<p class="title-legal"><a href="/terms.html">Terms</a><span aria-hidden="true" data-server>·</span><button id="title-feedback" type="button" data-server>Feedback</button></p>';

void test('server-only controls are dropped without a server and kept, unmarked, with one', (): void => {
  assert.equal(applyServer(HTML, false), '<p class="title-legal"><a href="/terms.html">Terms</a></p>');
  assert.equal(applyServer(HTML, true), '<p class="title-legal"><a href="/terms.html">Terms</a><span aria-hidden="true">·</span><button id="title-feedback" type="button">Feedback</button></p>');
});

void test('a page gets both passes', (): void => {
  const links = readLinks({ site: 'https://theloststorm.com', play: 'https://theloststorm.com/play/', github: 'https://github.com/marginsystems/the-lost-storm', discord: '', x: '' });
  const page: string = buildPage(`${HTML}<a data-link="discord">Discord</a>`, links, false);
  assert.equal(page, '<p class="title-legal"><a href="/terms.html">Terms</a></p>');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLinks } from './links.ts';
import { applyKeys, applyServer, buildPage } from './page-html.ts';

const HTML: string = '<p class="title-legal"><a href="/terms.html">Terms</a><span aria-hidden="true" data-server>·</span><button id="title-feedback" type="button" data-server>Feedback</button></p>';

void test('server-only controls are dropped without a server and kept, unmarked, with one', (): void => {
  assert.equal(applyServer(HTML, false), '<p class="title-legal"><a href="/terms.html">Terms</a></p>');
  assert.equal(applyServer(HTML, true), '<p class="title-legal"><a href="/terms.html">Terms</a><span aria-hidden="true">·</span><button id="title-feedback" type="button">Feedback</button></p>');
});

void test('a page gets both passes', (): void => {
  const links = readLinks({ site: 'https://theloststorm.com', play: 'https://theloststorm.com/play/', github: 'https://github.com/marginsystems/the-lost-storm', discord: '', x: '' });
  const page: string = buildPage(`${HTML}<a data-link="discord">Discord</a>`, links, false, '');
  assert.equal(page, '<p class="title-legal"><a href="/terms.html">Terms</a></p>');
});

void test('the desktop key list is filled from the generated rows and the touch list is left alone', (): void => {
  const html: string = '<dl class="title-keys title-keys-desk">\n  <div><dt>Old</dt><dd>Row</dd></div>\n</dl><dl class="title-keys title-keys-touch"><div><dt>Tap</dt><dd>Attack</dd></div></dl>';
  assert.equal(applyKeys(html, '<div><dt>Q</dt><dd>Thunderclap</dd></div>'), '<dl class="title-keys title-keys-desk"><div><dt>Q</dt><dd>Thunderclap</dd></div></dl><dl class="title-keys title-keys-touch"><div><dt>Tap</dt><dd>Attack</dd></div></dl>');
});

void test('icon links keep their drawing, and an icon button that needs a server goes without one', (): void => {
  const links = readLinks({ site: 'https://theloststorm.com', play: 'https://theloststorm.com/play/', github: 'https://github.com/marginsystems/the-lost-storm', discord: 'https://discord.gg/abc', x: '' });
  const icon: string = '<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>';
  const html: string = `<p><button id="title-feedback" type="button" data-server>${icon}</button><a class="i" data-link="discord" aria-label="Discord">${icon}</a><a class="i" data-link="x" aria-label="X">${icon}</a></p>`;
  assert.equal(buildPage(html, links, false, ''), `<p><a class="i" href="https://discord.gg/abc" target="_blank" rel="noopener" aria-label="Discord">${icon}</a></p>`);
});

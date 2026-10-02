import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const BASE = new URL('../vendor/seal-scroller/', import.meta.url);
const read = (name) => readFileSync(new URL(name, BASE), 'utf8');

/** Boot the real page + real modules in jsdom, with fetch served from disk. */
async function boot() {
  const html = read('index.html').replace('<script type="module" src="./sealfeed.js"></script>', '');
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/vendor/seal-scroller/index.html',
    runScripts: 'outside-only',
  });
  const { window } = dom;

  window.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => JSON.parse(read(String(url).replace('./', ''))),
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return 800; },
  });

  window.eval(read('scroll.js').replace(/export /g, ''));
  window.eval(read('sealfeed.js').replace(/^import .*$/gm, '').replace(/export /g, ''));
  await new Promise((resolve) => setTimeout(resolve, 300));
  return dom;
}

test('the sources panel starts collapsed behind the Info button', async () => {
  const { window } = await boot();
  const d = window.document;
  assert.equal(d.getElementById('sources').classList.contains('is-open'), false);
  assert.equal(d.getElementById('sources-toggle').getAttribute('aria-expanded'), 'false');
  assert.match(d.getElementById('sources-toggle').textContent, /Info/);
});

test('the Info button opens and closes the panel', async () => {
  const { window } = await boot();
  const d = window.document;
  const toggle = d.getElementById('sources-toggle');
  const panel = d.getElementById('sources');

  toggle.dispatchEvent(new window.Event('click'));
  assert.equal(panel.classList.contains('is-open'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  toggle.dispatchEvent(new window.Event('click'));
  assert.equal(panel.classList.contains('is-open'), false);
});

test('the close button closes the panel and survives rendering', async () => {
  const { window } = await boot();
  const d = window.document;
  const toggle = d.getElementById('sources-toggle');

  toggle.dispatchEvent(new window.Event('click'));
  // The close button lives outside the rendered body, so it must still exist.
  const close = d.getElementById('sources-close');
  assert.ok(close, 'close button must not be destroyed by rendering sources');
  close.dispatchEvent(new window.Event('click'));
  assert.equal(d.getElementById('sources').classList.contains('is-open'), false);
});

test('Escape closes the panel', async () => {
  const { window } = await boot();
  const d = window.document;
  d.getElementById('sources-toggle').dispatchEvent(new window.Event('click'));
  d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(d.getElementById('sources').classList.contains('is-open'), false);
});

test('the three named animals render with working links', async () => {
  const { window } = await boot();
  const links = [...window.document.querySelectorAll('.sources__name')];
  assert.equal(links.length, 3);
  assert.deepEqual(links.map((l) => l.textContent.trim()), ['Niko', 'Yuki', 'Yo-chan']);
  for (const link of links) {
    assert.match(link.getAttribute('href'), /^https:\/\//);
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(link.getAttribute('target'), '_blank');
  }
});

test('the feed still renders alongside the panel', async () => {
  const { window } = await boot();
  const d = window.document;
  assert.equal(d.querySelectorAll('.slide').length, 20);
  assert.ok([...d.querySelectorAll('.slide')].every((s) => !!s.querySelector('.slide__credit')));
});

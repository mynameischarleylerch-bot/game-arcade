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
  window.eval(read('likes.js').replace(/export /g, ''));
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

test('the feed renders every slide with a credit and a like button', async () => {
  const { window } = await boot();
  const d = window.document;
  const slides = [...d.querySelectorAll('.slide')];
  assert.equal(slides.length, 20);
  assert.ok(slides.every((s) => !!s.querySelector('.slide__credit')));
  assert.ok(slides.every((s) => !!s.querySelector('img.slide__img')));
  assert.equal(d.querySelectorAll('.like').length, 20);
});

test('the feed never reveals how many seals there are', async () => {
  const { window } = await boot();
  const d = window.document;
  const html = d.getElementById('feed').innerHTML;
  // No "1 / 20"-style counter, no one-dot-per-seal, and no total in the HUD.
  assert.ok(!/\d+\s*\/\s*\d+/.test(html), 'no n/total counter in the markup');
  assert.equal(d.querySelectorAll('.slide__badge').length, 0);
  assert.equal(d.querySelectorAll('.dot').length, 1, 'a single progress dot, not one per seal');
  assert.doesNotMatch(d.getElementById('hud').textContent, /\d/);
});

test('the like button toggles and records the state', async () => {
  const { window } = await boot();
  const d = window.document;
  const button = d.querySelector('.like[data-like="0"]');

  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.querySelector('.like__count').textContent, '0');

  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.ok(button.classList.contains('is-liked'));
  assert.equal(button.querySelector('.like__count').textContent, '1');

  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.querySelector('.like__count').textContent, '0');
});

test('each slide can be liked independently', async () => {
  const { window } = await boot();
  const d = window.document;
  const first = d.querySelector('.like[data-like="0"]');
  const third = d.querySelector('.like[data-like="2"]');
  first.dispatchEvent(new window.Event('click', { bubbles: true }));
  third.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  assert.equal(third.getAttribute('aria-pressed'), 'true');
  assert.equal(d.querySelector('.like[data-like="1"]').getAttribute('aria-pressed'), 'false');
});

test('every slide credits "The creator" and never names a person', async () => {
  const { window } = await boot();
  const d = window.document;
  const credits = [...d.querySelectorAll('.slide__credit')];
  assert.ok(credits.length > 0);
  for (const credit of credits) {
    const text = credit.textContent;
    assert.match(text, /The creator/);
    assert.doesNotMatch(text, /karin/i);
  }
});

test('no slide title or credit reveals the total number of seals', async () => {
  const { window } = await boot();
  const d = window.document;
  const text = d.getElementById('feed').textContent;
  // "Seal 11 of 20" used to sit in every credit and gave the whole game away.
  assert.doesNotMatch(text, /\bof\s+\d+\b/i);
  assert.doesNotMatch(text, /\b\d+\s*\/\s*\d+\b/);
});

test('a photo with no source renders plain text, not a dangling link', async () => {
  const { window } = await boot();
  const d = window.document;
  const credit = d.querySelector('.slide__credit');
  // The supplied photos have no source URL, so there must be no empty <a>.
  assert.equal(credit.querySelectorAll('a').length, 0);
  assert.ok(credit.querySelector('.slide__by'));
  assert.match(credit.textContent, /The creator/);
});

test('the feed fetches its JSON with a cache-busting query', async () => {
  // Pages serves with `Cache-Control: max-age=600`; a plain './gifs.json' can come
  // back stale for ten minutes. Capture what the module actually requests.
  const source = read('sealfeed.js');
  assert.match(source, /const BUILD_ID = ['"][^'"]+['"]/);
  assert.match(source, /MANIFEST_URL = `\.\/gifs\.json\?v=\$\{BUILD_ID\}`/);
  assert.match(source, /SOURCES_URL = `\.\/sources\.json\?v=\$\{BUILD_ID\}`/);
});

test('the photo sits in a smaller frame rather than filling the slide', async () => {
  const { window } = await boot();
  const d = window.document;
  const frame = d.querySelector('.slide__frame');
  assert.ok(frame, 'slide__frame wrapper exists');
  // The image is a child of the frame, so the frame can constrain its size.
  assert.ok(frame.querySelector('img.slide__img'));
});

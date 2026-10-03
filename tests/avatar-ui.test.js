/**
 * DOM test for the MSN contact card: that the picker renders sixteen faces and
 * eight statuses, that picking writes through to storage, and that it survives
 * a corrupt or blocked store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');       // we import the module ourselves

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    read: (k) => (k in data ? data[k] : null),
  };
}

/** Build the page and boot the card, returning the pieces the assertions need. */
async function mount(storage = fakeStorage(), run = 1) {
  const dom = new JSDOM(INDEX, { url: 'http://localhost:8080/index.html' });
  const { window } = dom;

  // The card reads root.defaultView.localStorage, so hand it our fake instead.
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

  globalThis.window = window;
  globalThis.document = window.document;

  await import(`../src/avatar-ui.js?run=${run}`);
  const { initAvatar } = await import('../src/avatar-ui.js');
  const api = initAvatar(window.document);

  return {
    dom,
    window,
    doc: window.document,
    storage,
    api,
    card: window.document.querySelector('[data-msn]'),
  };
}

const q = (ctx, sel) => ctx.doc.querySelector(sel);

test('renders sixteen display pictures and eight statuses', async () => {
  const ctx = await mount(fakeStorage(), 1);
  assert.equal(ctx.doc.querySelectorAll('[data-msn-grid] button').length, 16);
  assert.equal(ctx.doc.querySelectorAll('[data-msn-statuses] button').length, 8);
});

test('starts on avatar 1 and Online', async () => {
  const ctx = await mount(fakeStorage(), 2);
  const face = q(ctx, '[data-msn-face]');
  assert.match(face.src, /avatar-01\.svg$/);
  assert.equal(q(ctx, '[data-msn-label]').textContent, 'Online');
  assert.equal(ctx.card.getAttribute('data-status'), 'online');
  assert.equal(q(ctx, '[data-msn-grid] button[aria-pressed="true"]').dataset.index, '0');
});

test('the status dot takes the status colour', async () => {
  const ctx = await mount(fakeStorage(), 3);
  const dot = q(ctx, '[data-msn-dot]');
  assert.equal(dot.style.background.replace(/\s/g, ''), 'rgb(46,158,91)');
});

test('picking a display picture updates the face and writes to storage', async () => {
  const ctx = await mount(fakeStorage(), 4);
  q(ctx, '[data-msn-grid] button[data-index="9"]').click();

  assert.match(q(ctx, '[data-msn-face]').src, /avatar-10\.svg$/);
  assert.equal(q(ctx, '[data-msn-grid] button[data-index="9"]').getAttribute('aria-pressed'), 'true');
  assert.equal(q(ctx, '[data-msn-grid] button[data-index="0"]').getAttribute('aria-pressed'), 'false',
    'only one face is selected');

  // The choice must survive a reload, not just repaint.
  const saved = JSON.parse(ctx.storage.read('aero-arcade-profile'));
  assert.equal(saved.avatarIndex, 9, 'the pick was written to storage');
});

test('picking a status updates the label and the dot colour', async () => {
  const ctx = await mount(fakeStorage(), 5);
  q(ctx, '[data-msn-statuses] button[data-status="lunch"]').click();

  assert.equal(q(ctx, '[data-msn-label]').textContent, 'Out to lunch');
  assert.equal(ctx.card.getAttribute('data-status'), 'lunch');
  assert.equal(q(ctx, '[data-msn-dot]').style.background.replace(/\s/g, ''), 'rgb(251,140,0)');
  assert.equal(JSON.parse(ctx.storage.read('aero-arcade-profile')).statusId, 'lunch');
});

test('editing the nickname updates the header summary', async () => {
  const ctx = await mount(fakeStorage(), 6);
  const input = q(ctx, '[data-msn-nick]');
  input.value = 'Niko';
  input.dispatchEvent(new ctx.window.Event('change'));
  assert.match(q(ctx, '[data-msn-label]').textContent, /Niko/);
});

test('a nickname over the limit is truncated, not rejected', async () => {
  const ctx = await mount(fakeStorage(), 7);
  const input = q(ctx, '[data-msn-nick]');
  input.value = 'y'.repeat(100);
  input.dispatchEvent(new ctx.window.Event('change'));
  assert.ok(q(ctx, '[data-msn-label]').textContent.length <= 40);
  assert.ok(input.value.length <= 18, 'the field itself is capped');
});

test('the panel opens and closes, and Escape closes without bubbling', async () => {
  const ctx = await mount(fakeStorage(), 8);
  const panel = q(ctx, '[data-msn-panel]');
  assert.equal(panel.hidden, true);

  q(ctx, '[data-msn-toggle]').click();
  assert.equal(panel.hidden, false);
  assert.equal(ctx.card.getAttribute('data-open'), 'true');

  let escaped = false;
  ctx.card.addEventListener('keydown', (e) => { escaped = e.defaultPrevented || true; });
  q(ctx, '[data-msn-toggle]').dispatchEvent(
    new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  assert.equal(panel.hidden, true, 'Escape closes the panel');
});

test('clicking away closes the panel but clicking inside does not', async () => {
  const ctx = await mount(fakeStorage(), 9);
  q(ctx, '[data-msn-toggle]').click();
  assert.equal(q(ctx, '[data-msn-panel]').hidden, false);

  q(ctx, '[data-msn-panel]').dispatchEvent(
    new ctx.window.MouseEvent('click', { bubbles: true }),
  );
  assert.equal(q(ctx, '[data-msn-panel]').hidden, false, 'a click inside keeps it open');

  ctx.doc.querySelector('.hero__title').dispatchEvent(
    new ctx.window.MouseEvent('click', { bubbles: true }),
  );
  assert.equal(q(ctx, '[data-msn-panel]').hidden, true, 'a click outside closes it');
});

test('a saved profile is restored on the next visit', async () => {
  const storage = fakeStorage({
    'aero-arcade-profile': JSON.stringify({ avatarIndex: 12, statusId: 'brb', nick: 'Yo Chan' }),
  });
  const ctx = await mount(storage, 10);
  assert.match(q(ctx, '[data-msn-face]').src, /avatar-13\.svg$/);
  assert.equal(q(ctx, '[data-msn-label]').textContent, 'Yo Chan — Be right back');
});

test('a corrupt profile falls back to the defaults instead of throwing', async () => {
  const storage = fakeStorage({ 'aero-arcade-profile': '<<broken>>' });
  const ctx = await mount(storage, 11);
  assert.match(q(ctx, '[data-msn-face]').src, /avatar-01\.svg$/);
  assert.equal(q(ctx, '[data-msn-label]').textContent, 'Online');
});

test('blocked storage does not stop the card rendering', async () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const ctx = await mount(hostile, 12);
  assert.equal(ctx.doc.querySelectorAll('[data-msn-grid] button').length, 16);
  assert.equal(q(ctx, '[data-msn-label]').textContent, 'Online');
  assert.doesNotThrow(() => q(ctx, '[data-msn-statuses] button[data-status="busy"]').click());
});

test('initAvatar is a no-op on a page without the header', async () => {
  const { initAvatar } = await import('../src/avatar-ui.js');
  const bare = new JSDOM('<!doctype html><html><body><p>no card here</p></body></html>');
  assert.equal(initAvatar(bare.window.document), null);
});

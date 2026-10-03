/**
 * Frutiger Angler was restyled to flat pixel art from a reference drawing: three
 * flat colours, hard edges, no gradients and no glass.
 *
 * A restyle like that decays quietly — someone adds a box-shadow "just to lift it"
 * and the whole look goes. These tests pin the palette and forbid the Aero effects
 * from creeping back in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const GAME = new URL('../vendor/fru-angler/', import.meta.url);
const PAGE = readFileSync(new URL('index.html', GAME), 'utf8');

/** The three colours from the reference image, plus ink and two support tints. */
const PALETTE = {
  sky: '#00a2e8',
  indigo: '#3f48cc',
  wood: '#b97a57',
  ink: '#ffffff',
  glint: '#5a63d8',   // flat water highlights
  dim: '#b8bdf0',     // secondary text on indigo
};

const hexes = () => [...new Set(PAGE.match(/#[0-9a-fA-F]{6}/g))];

test('the game uses exactly the flat pixel palette', () => {
  const extra = hexes().filter((c) => !Object.values(PALETTE).includes(c));
  assert.deepEqual(extra, [], `colours outside the palette: ${extra.join(', ')}`);
});

test('the three reference colours are all present', () => {
  for (const name of ['sky', 'indigo', 'wood']) {
    assert.ok(hexes().includes(PALETTE[name]), `${name} (${PALETTE[name]}) is missing`);
  }
});

test('no gradients, glass or shadows anywhere in the game view', () => {
  for (const banned of [
    'linear-gradient', 'radial-gradient', 'conic-gradient',
    'backdrop-filter', '-webkit-backdrop-filter',
    'box-shadow', 'text-shadow', 'blur(',
  ]) {
    assert.equal(PAGE.includes(banned), false, `found "${banned}" in the pixel view`);
  }
});

test('the scene is crisp-edged so it stays pixel art when scaled', () => {
  assert.match(PAGE, /shape-rendering:\s*crispEdges/);
});

test('the scene keeps the reference composition', () => {
  // Pier on the left, horizon climbing to the right, angler with the rod.
  assert.match(PAGE, /class="scene"/);
  assert.match(PAGE, /class="scene__wood"/);          // pier + rod
  assert.match(PAGE, /class="scene__angler"/);       // the figure
  assert.match(PAGE, /viewBox="0 0 100 100"/);
  assert.match(PAGE, /preserveAspectRatio="none"/);
  assert.match(PAGE, /id="line"/);                   // the fishing line
});

test('the fishing line starts at the rod tip', () => {
  const d = PAGE.match(/id="line" d="([^"]+)"/);
  assert.ok(d, 'the line path must ship with an initial d');
  assert.match(d[1], /^M56 32/, 'the line should start at the rod tip in scene coords');
});

test('the cast band is wood, keeping the perfect zone inside the palette', () => {
  assert.match(PAGE, /\.cast__band\s*\{[^}]*background:\s*var\(--wood\)/);
});

test('rarity is shown as blocks, not as a fifth colour', () => {
  assert.match(PAGE, /id="catch-rarity"/);
  assert.match(PAGE, /\.catch__pip\.is-on\s*\{[^}]*background:\s*var\(--wood\)/);
  // Five tiers of one colour beats five hues the palette cannot hold.
  const pips = (PAGE.match(/catch__pip/g) || []).length;
  assert.ok(pips >= 2, 'the pip styles are missing');
});

test('the game view keeps every element id angler.js and the tests rely on', () => {
  for (const id of [
    'coins', 'rod', 'rod-stats', 'bestiary', 'message',
    'lake', 'bobber', 'splash', 'cast', 'cast-fill',
    'reel', 'reel-track', 'reel-player', 'reel-fish', 'reel-fill',
    'catch', 'catch-name', 'catch-meta', 'catch-value', 'catch-again',
    'shop-panel', 'shop-list', 'shop-coins', 'shop-open', 'shop-close',
    'line', 'catch-rarity',
  ]) {
    assert.match(PAGE, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('every script the game loads is cache-versioned', () => {
  const scripts = [...PAGE.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, 'no script found');
  for (const src of scripts) {
    assert.match(src, /\?v=/, `${src} has no cache-busting query`);
  }
  for (const m of PAGE.matchAll(/from '(\.\/[^']+)'/g)) {
    assert.match(m[1], /\?v=/, `${m[1]} import has no cache-busting query`);
  }
});

test('the cover art uses the same flat palette', () => {
  const cover = readFileSync(new URL('../../assets/covers/fru-angler.svg', GAME), 'utf8');
  const extra = [...new Set(cover.match(/#[0-9a-fA-F]{6}/g))]
    .filter((c) => !Object.values(PALETTE).includes(c));
  assert.deepEqual(extra, [], `cover colours outside the palette: ${extra.join(', ')}`);
  assert.equal(cover.includes('gradient'), false, 'the cover must stay flat');
  assert.match(cover, /aria-label="Frutiger Angler"/);
});

test('the game folder holds only the files it needs', () => {
  const files = readdirSync(GAME).filter((f) => !f.startsWith('.')).sort();
  assert.deepEqual(files, ['angler.js', 'fishing.js', 'index.html', 'reel.js'],
    `unexpected files: ${files.join(', ')}`);
});

/**
 * Frutiger Angler is a glossy Frutiger Aero game: aqua gradients, translucent
 * glass, bloom and shine.
 *
 * It was briefly restyled as flat pixel art from a sketch. That sketch is the
 * scene composition (shore rising right, pier on the left, angler and rod) and
 * that part stayed; the flat three-colour treatment did not. These tests pin the
 * Aero treatment so the pixel look cannot creep back in, and pin the composition
 * so a restyle cannot drop the scene the sketch was for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const GAME = new URL('../vendor/fru-angler/', import.meta.url);
const PAGE = readFileSync(new URL('index.html', GAME), 'utf8');

test('the game view is Aero: gradients, glass and shine are all present', () => {
  assert.match(PAGE, /linear-gradient/, 'Aero needs gradients');
  assert.match(PAGE, /backdrop-filter:\s*blur/, 'Aero panels are translucent glass');
  assert.match(PAGE, /box-shadow/, 'Aero panels lift off the page');
  assert.match(PAGE, /inset 0 1px 0 #fff/, 'the Aero gloss highlight');
  assert.match(PAGE, /#fff9c4/, 'the Aero sun bloom');
});

test('the flat pixel treatment did not creep back in', () => {
  // The pixel palette was sky/indigo/wood at exactly these values.
  for (const banned of ['#00a2e8', '#3f48cc', '#b97a57']) {
    assert.equal(PAGE.includes(banned), false,
      `${banned} is a pixel-palette colour and must not return`);
  }
  assert.equal(PAGE.includes('shape-rendering: crispEdges'), false,
    'crispEdges was the pixel rendering');
  // The pier is wood in both versions, so a --wood token is fine; what matters is
  // it is no longer the flat pixel brown. Assert the Aero sky tokens are present.
  assert.match(PAGE, /--sky-top:/, 'the Aero sky tokens should be back');
});

test('the scene keeps the composition from the sketch', () => {
  // Shore climbing to the right, lake, pier deck and two legs on the left, the
  // angler, the rod angled up-right, and the line from the rod tip.
  assert.match(PAGE, /class="scene"/);
  assert.match(PAGE, /class="scene__shore"/);
  assert.match(PAGE, /class="scene__water"/);
  assert.match(PAGE, /class="scene__wood"/);
  assert.match(PAGE, /class="scene__figure"/);
  assert.match(PAGE, /class="scene__rod"/);
  assert.match(PAGE, /id="line"/);
  assert.match(PAGE, /viewBox="0 0 100 100"/);
  assert.match(PAGE, /preserveAspectRatio="none"/);
});

test('the pier has a deck and two legs, as sketched', () => {
  const legs = (PAGE.match(/class="scene__wood--edge"/g) || []).length;
  assert.equal(legs, 2, 'the sketch has two pier legs');
  assert.match(PAGE, /<rect class="scene__wood" x="0" y="58" width="42"/,
    'the deck runs in from the left edge');
});

test('the angler has a body, a head and a hat', () => {
  assert.match(PAGE, /class="scene__figure" cx="33\.2" cy="43" r="2\.6"/, 'the head');
  assert.match(PAGE, /class="scene__figure" x="31\.6" y="50"/, 'the body');
  assert.match(PAGE, /class="scene__hat"/, 'the hat');
});

test('the fishing line starts at the rod tip', () => {
  const d = PAGE.match(/id="line" d="([^"]+)"/);
  assert.ok(d, 'the line path must ship with an initial d');
  assert.match(d[1], /^M56 32/, 'the line should start at the rod tip in scene coords');
});

test('the perfect band is lime, the Aero "go" colour', () => {
  assert.match(PAGE, /\.cast__band\s*\{[^}]*background:[^;]*163,\s*230,\s*53/);
});

test('rarity is shown as blocks under the name', () => {
  assert.match(PAGE, /id="catch-rarity"/);
  assert.match(PAGE, /\.catch__pip\.is-on\s*\{[^}]*background:\s*var\(--deep\)/);
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

test('the copy is sentence case, not the pixel-era caps', () => {
  assert.match(PAGE, /Cast again<\/button>/);
  assert.match(PAGE, /Rods &amp; shop/);
  assert.equal(/CAST AGAIN|BUTTON>Rods:/.test(PAGE), false, 'caps crept back in');
});

test('every script the game loads is cache-versioned', () => {
  const scripts = [...PAGE.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, 'no script found');
  for (const src of scripts) {
    assert.match(src, /\?v=/, `${src} has no cache-busting query`);
  }
});

test('the cover art is Aero too', () => {
  const cover = readFileSync(new URL('../../assets/covers/fru-angler.svg', GAME), 'utf8');
  assert.equal(cover.includes('#00a2e8'), false, 'cover must not use the pixel sky');
  assert.match(cover, /radial-gradient|<circle/, 'the cover needs the bobber and sun bloom');
  assert.match(cover, /aria-label="Frutiger Angler"/);
});

test('the game folder holds only the files it needs', () => {
  const files = readdirSync(GAME).filter((f) => !f.startsWith('.')).sort();
  assert.deepEqual(files, ['angler.js', 'fishing.js', 'index.html', 'reel.js'],
    `unexpected files: ${files.join(', ')}`);
});

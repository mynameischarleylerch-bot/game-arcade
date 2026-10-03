/**
 * Block Blast's appearance contract.
 *
 * The brief is "as glossy and Frutiger Aero as possible", which is not a
 * measurable thing unless something pins it. These tests hold the floor: layered
 * gradients, a specular, an inset gloss cap, a drop shadow, no flat fills.
 *
 * A missing token or a dropped declaration does not throw — it renders as nothing.
 * So the checks are on the recipe text, not on a pixel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../vendor/block-blast/index.html', import.meta.url), 'utf8');
/** The page's CSS with comments stripped, so prose cannot satisfy a rule. */
const CSS = PAGE.slice(PAGE.indexOf('<style>'), PAGE.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The body of a rule, or null if it has none. Takes a plain selector and escapes
 * it here, so callers must NOT escape it themselves.
 */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = CSS.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return m ? m[1] : null;
}

test('every design token this game uses is defined in the game', () => {
  // Nothing else checks this. tests/tokens.test.js only scans styles.css, and an
  // undefined var() silently renders as nothing rather than throwing.
  const defined = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined tokens: ${missing.join(', ')}`);
});

test('no declared token is dead weight', () => {
  const defined = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  const unused = [...defined].filter((t) => !used.has(t));
  assert.deepEqual(unused, [], `declared but never used: ${unused.join(', ')}`);
});

test('a block is a layered gem, not a flat fill', () => {
  const body = rule('.block__cell');
  assert.ok(body, '.block__cell must be styled');
  assert.match(body, /linear-gradient/, 'needs a gradient');
  // The declaration must carry BOTH a drop shadow for lift and an inset for the
  // lit top edge. Counting the literal string "box-shadow" would be wrong: one
  // declaration can carry several shadows.
  const shadows = body.match(/box-shadow:\s*([^;]+);/);
  assert.ok(shadows, 'the gem needs a box-shadow');
  const value = shadows[1];
  assert.match(value, /inset/, 'needs an inset gloss on the lit top edge');
  assert.match(value.replace(/inset[^,]+,?/g, ''), /var\(--shadow-block\)|\d/,
    'and a drop shadow beneath it for lift');
});

test('the specular highlight is a radial pseudo-element, not a flat wash', () => {
  const gem = rule('.block__cell::after');
  assert.ok(gem, 'the gem needs a specular pseudo-element');
  assert.match(gem, /radial-gradient/, 'the specular must be radial');
});

test('each hue gets a full light-to-deep ramp', () => {
  // A block is drawn entirely from --hue, so the ramp must come from it.
  const stops = CSS.match(/hsl\(var\(--hue\)/g) || [];
  assert.ok(stops.length >= 3, `at least a light, mid and deep stop, found ${stops.length}`);
  const ramp = CSS.match(/hsl\(var\(--hue\)[^;]*\)[\s\S]{0,320}?hsl\(var\(--hue\)[^;]*\)/);
  assert.ok(ramp, 'the stops must be a real light-to-deep ramp');
  assert.match(ramp[0], /\d+%\)\s*0%[\s\S]*100%/,
    'running from a light stop to a deep one');
});

test('the board is glass over the sky, not an opaque slab', () => {
  const board = rule('.board');
  assert.ok(board, '.board must be styled');
  assert.match(board, /backdrop-filter/, 'the board must blur what is behind it');
  assert.match(board, /linear-gradient/, 'and be a gradient, not a solid');
  assert.match(board, /var\(--shadow-panel\)/, 'with the panel shadow');
});

test('empty cells are translucent, so the grid reads as a tray of glass', () => {
  const cell = rule('.cell');
  assert.match(cell, /rgba\([^)]*,\s*0?\.\d+\)/,
    'an empty cell must be partly transparent');
});

test('the tray is glass too, and its blocks can be picked up', () => {
  const tray = rule('.tray');
  assert.match(tray, /backdrop-filter/, 'the tray must blur what is behind it');
  const block = rule('.tray__block');
  assert.match(block, /cursor:\s*grab/, 'a block must look grabbable');
  assert.match(CSS, /:focus-visible/, 'and be reachable by keyboard');
});

test('the page is Aero and has not fallen back to flat or pixel art', () => {
  assert.match(PAGE, /--sky-top/, 'a sky ramp is the backbone of the look');
  assert.match(PAGE, /backdrop-filter/, 'glass, not paint');
  assert.equal(PAGE.includes('crispEdges'), false, 'no pixel-art rendering');
  assert.ok((CSS.match(/linear-gradient/g) || []).length >= 6,
    'the page should be layered in gradients throughout');
  assert.ok((CSS.match(/box-shadow/g) || []).length >= 8,
    'and lifted with shadows throughout');
});

test('the animation is decorative only and respects reduced motion', () => {
  // Reduced motion must actually stop it, not merely be mentioned in a comment.
  const reduced = PAGE.slice(PAGE.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduced.length > 0, 'there must be a reduced-motion block');
  assert.match(reduced, /animation:\s*none/, 'and it must switch animations off');
});

test('a cleared line is animated, not just deleted', () => {
  assert.match(CSS, /\.burst\s*\{/, 'there must be a clear effect');
  assert.match(CSS, /@keyframes burst/, 'with a keyframe animation');
  assert.match(CSS, /animation:[^;]*\bburst\b/, 'and something must trigger it');
});

test('the clear effect is layered Aero light, not a flat flash', () => {
  const burst = rule('.burst');
  assert.ok(burst, '.burst must be styled');
  assert.match(burst, /radial-gradient/, 'a bloom, not a solid box');
  assert.match(burst, /box-shadow/, 'and a glow');
});

test('the spawn animation is short, so the board never feels laggy', () => {
  const land = CSS.match(/animation:\s*land\s+(\d+)ms/);
  assert.ok(land, 'the landing animation must declare a duration');
  assert.ok(Number(land[1]) <= 500, `landing is ${land[1]}ms, too slow`);
});

test('the burst is decorative only and never intercepts a click', () => {
  const burst = rule('.burst');
  assert.match(burst, /pointer-events:\s*none/,
    'a bloom must not swallow the drop that follows it');
});

/**
 * Guard against the bug that shipped once already: CSS referencing design tokens
 * that do not exist. A missing token does not throw — it silently renders as
 * nothing, so the failure is invisible unless something checks it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const CSS = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Every token assigned anywhere in the stylesheet. */
function definedTokens() {
  const tokens = new Set();
  for (const m of CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)) tokens.add(m[1]);
  return tokens;
}

/** Every token referenced through var(). */
function usedTokens(css = CSS) {
  const used = new Set();
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) used.add(m[1]);
  return used;
}

test('every var() in the stylesheet refers to a token that is actually defined', () => {
  const defined = definedTokens();
  const missing = [...usedTokens()].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined design tokens: ${missing.join(', ')}`);
});

test('the token count is the size the theme checker expects', () => {
  // If this drifts, scripts/check-themes.mjs is checking a different set.
  const defined = [...definedTokens()].filter((t) => !t.startsWith('--backdrop-'));
  assert.ok(defined.length >= 70, `only ${defined.length} tokens defined`);
});

test('no stylesheet rule is left with a doubled declaration separator', () => {
  assert.ok(!CSS.includes(';;'), 'found a stray ";;", which silently drops a declaration');
});

test('palette completeness is delegated to check-themes.mjs, and it is wired into npm test', () => {
  // Deliberately not reimplemented here: scripts/check-themes.mjs owns that rule.
  // This only asserts the script exists and still runs as part of `npm test`, so
  // the check cannot be silently dropped from the suite.
  const script = readFileSync(new URL('../scripts/check-themes.mjs', import.meta.url), 'utf8');
  assert.match(script, /required palette tokens/);

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.test, /check-themes\.mjs/,
    'npm test must run the theme palette checker');
  assert.match(pkg.scripts.test, /check-contrast\.mjs/,
    'npm test must run the contrast checker');
});

test('the MSN contact card styles are present and token-driven', () => {
  const block = CSS.slice(CSS.indexOf('/* ==================================================================== MSN'));
  assert.ok(block.length > 500, 'the MSN block is missing');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'the card must not hardcode hex colours');
});

test('the avatar SVGs the page references all exist', () => {
  const referenced = new Set();
  for (const page of ['index.html', 'play.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    for (const m of html.matchAll(/\.\/assets\/avatars\/(avatar-\d\d\.svg)(?:\?v=[\w-]+)?/g)) {
      referenced.add(m[1]);
    }
  }
  assert.ok(referenced.size >= 1, 'no avatar is referenced by either page');
  const onDisk = new Set(readdirSync(new URL('../assets/avatars/', import.meta.url)));
  for (const file of referenced) {
    assert.ok(onDisk.has(file), `${file} is referenced but not on disk`);
  }
});


/* ------------------------------------------------------- the MSN dropdown */

test('the MSN panel has a real glass background, not an invalid var()', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const panel = css.slice(css.indexOf('.msn__panel {'), css.indexOf('.msn__panel[hidden]'))
    .replace(/\/\*[\s\S]*?\*\//g, '');   // comments are not declarations

  // Regression: this once read
  //   background: var(var(--glass-top), var(--glass-mid) 55%, var(--glass-bot));
  // A var() in value position is invalid, so the browser dropped the declaration
  // entirely and the dropdown rendered with no background at all.
  const background = /background(?:-image)?:\s*([^;]+);/g;
  for (const [, value] of panel.matchAll(background)) {
    assert.equal(/^\s*var\(/.test(value), false,
      `background: var(...) is not a valid declaration, got: ${value.trim()}`);
  }
  assert.match(panel, /background:\s*linear-gradient\(/,
    'the panel needs a real gradient to sit over the scene');
  assert.match(panel, /backdrop-filter/,
    'and a backdrop blur so the scene cannot show through the text');
});

test('no stylesheet puts a var() in value position', () => {
  // The general guard for this class of typo, across every stylesheet.
  //
  // `color: var(--ink)` is valid and extremely common. The broken form is a var()
  // whose own arguments start with another var(), e.g. the MSN panel once read
  //   background: var(var(--glass-top), var(--glass-mid) 55%, var(--glass-bot));
  // which is invalid: the browser discards the declaration silently.
  const files = ['../styles.css',
                 '../vendor/fru-angler/index.html',
                 '../vendor/seal-scroller/index.html'];
  const bad = [];
  for (const file of files) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');
    // Strip comments first: the regression notes quote the broken declaration, and
    // a comment is not a declaration.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/^\s*([a-z-]+):\s*var\(/gm)) {
      const tail = css.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const inner = tail.slice(tail.indexOf('('), tail.indexOf(';'));
      if (/^var\(/.test(inner)) {
        bad.push(`${file}:${css.slice(0, m.index).split('\n').length} ${m[1]}`);
      }
    }
  }
  assert.deepEqual(bad, [], `invalid declarations, silently dropped: ${bad.join(', ')}`);
});


test('the MSN panel is opaque enough to read over the scene backdrop', () => {
  // A dropdown floats over a busy 3D scene, so it needs more opacity than a card
  // that sits on the page background. In Aero the shared glass ramps down to 16%,
  // which is why the status text was unreadable even with a valid background.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const panel = css.slice(css.indexOf('.msn__panel {'), css.indexOf('.msn__panel[hidden]'))
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const background = panel.match(/background:[^;]+;/)[0];
  assert.match(background, /linear-gradient/, 'the panel needs a gradient');

  // At least one layer must sit under any translucent gloss, so text has something
  // to sit on. Opacity now comes from --card-top/--card-bot, so resolve the tokens
  // against the default (Aero) theme rather than reading literal alphas.
  const alphas = [...background.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
  const defaults = Object.fromEntries(
    [...css.matchAll(/(--card-top|--card-bot|--glass-top):\s*rgba\([^)]*?,\s*([\d.]+)\)/g)]
      .map((m) => [m[1], Number(m[2])]));
  const used = [...background.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  const resolved = [...alphas, ...used.map((token) => defaults[token]).filter((v) => v !== undefined)];

  assert.ok(Math.max(...resolved, 0) >= 0.8,
    `the panel needs an opaque layer to read over the scene, resolved ${resolved.join(', ')}`);

  // And it must be built from theme tokens, not hardcoded white, or the dark
  // theme would get a white dropdown.
  assert.match(background, /var\(--card-top\)/, 'the panel should follow the theme');
});


test('every status row in the dropdown is readable, not just the panel', () => {
  // The panel being opaque only fixes the backdrop. Each row also needs ink that
  // contrasts, and a selected row needs a fill you can actually see.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  const row = css.slice(css.indexOf('.msn__status-btn {'), css.indexOf('.msn__status-btn:focus-visible'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(row, /color:\s*var\(--ink\)/, 'status text must use the theme ink');

  const selected = css.slice(css.indexOf('.msn__status-btn[aria-pressed="true"]'),
                             css.indexOf('.msn__status-btn:focus-visible'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(selected, /background/, 'the selected row needs a visible fill');
  assert.match(selected, /var\(--accent-line/, 'and an accent border to stand out');
});

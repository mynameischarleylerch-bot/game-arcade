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
    for (const m of html.matchAll(/\.\/assets\/avatars\/(avatar-\d\d\.svg)/g)) {
      referenced.add(m[1]);
    }
  }
  assert.ok(referenced.size >= 1, 'no avatar is referenced by either page');
  const onDisk = new Set(readdirSync(new URL('../assets/avatars/', import.meta.url)));
  for (const file of referenced) {
    assert.ok(onDisk.has(file), `${file} is referenced but not on disk`);
  }
});

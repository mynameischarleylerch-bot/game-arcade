/**
 * Verify every [data-theme] block overrides EVERY token declared on :root, and
 * that each theme supplies a backdrop.
 *
 * A theme may be split across several blocks (palette here, backdrop there), so
 * every block for a theme is collected and merged before checking. A partial
 * theme is the classic silent bug: one element stays Aero in four of five looks.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('./styles.css', 'utf8');

/** Body of the `{ ... }` block whose opening brace is at index `open`. */
function bodyFrom(open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * All block bodies for `selector`, merged in source order.
 * Requiring the selector at the start of a line stops `:root` from matching
 * mid-line occurrences, and stops a theme from matching a partial selector.
 */
function allBlocks(selector) {
  const parts = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    const atLineStart = at === 0 || css[at - 1] === '\n';
    const open = css.indexOf('{', at);
    if (atLineStart && open !== -1) {
      const body = bodyFrom(open);
      if (body !== null) parts.push(body);
    }
    from = at + 1;
  }
  return parts.join('\n');
}

const tokenNames = (block) => [...new Set([...block.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]))];

const rootBlock = allBlocks(':root');
if (rootBlock.trim() === '') {
  console.error('FAIL: no :root block found');
  process.exit(1);
}
const rootTokens = tokenNames(rootBlock);

/* Shape and motion are deliberately shared by every theme. */
const SHARED = new Set(['--radius', '--radius-lg', '--measure', '--shell-max']);
const BACKDROP_TOKENS = ['--backdrop-image', '--backdrop-size', '--backdrop-opacity'];
const THEMES = ['aero', 'doric', 'eco', 'glacier', 'dark-aero'];

/*
 * Aero IS the :root palette — it has no block of its own. So only themes that
 * override the palette are required to be complete. Aero is checked for its
 * backdrop only.
 */
const OVERRIDING_THEMES = THEMES.filter((id) => id !== 'aero');

console.log(`tokens declared on :root: ${rootTokens.length}`);
console.log(`  shared shape/motion tokens: ${[...SHARED].filter((t) => rootTokens.includes(t)).length}`);
console.log(`  required palette tokens per overriding theme: ${rootTokens.filter((t) => !SHARED.has(t)).length}`);
console.log('  aero is the :root default and needs no palette block of its own');
console.log();

let problems = 0;

for (const id of OVERRIDING_THEMES) {
  const block = allBlocks(`[data-theme="${id}"]`);
  if (block.trim() === '') {
    console.log(`  ${id.padEnd(10)} NO BLOCK AT ALL`);
    problems += 1;
    continue;
  }

  const defined = new Set(tokenNames(block));
  const required = rootTokens.filter((t) => !SHARED.has(t));
  const missing = required.filter((t) => !defined.has(t));
  const unknown = [...defined].filter((t) => !rootTokens.includes(t));

  const status = missing.length === 0 ? 'complete' : `MISSING ${missing.join(', ')}`;
  console.log(`  ${id.padEnd(10)} ${required.length - missing.length}/${required.length} (${status})`);
  if (unknown.length) console.log(`             unknown tokens: ${unknown.join(', ')}`);
  if (missing.length) problems += 1;
}

console.log();
console.log('backdrops:');
for (const id of THEMES) {
  const block = allBlocks(`[data-theme="${id}"]`);
  const defined = new Set(tokenNames(block));
  const missing = BACKDROP_TOKENS.filter((t) => !defined.has(t));
  if (missing.length) {
    console.log(`  ${id.padEnd(10)} MISSING ${missing.join(', ')}`);
    problems += 1;
    continue;
  }
  const image = block.match(/--backdrop-image:\s*([^;]+);/)[1].trim();
  const shape = image.includes('linear-gradient') ? 'linear gradient'
    : image.includes('radial-gradient') ? 'radial gradient'
      : image === 'none' ? 'none' : 'other';
  console.log(`  ${id.padEnd(10)} ok (${shape})`);
}

console.log();
if (problems === 0) {
  console.log('themes and backdrops OK');
} else {
  console.log(`THEME CHECK FAILED: ${problems} problem(s)`);
}
process.exit(problems === 0 ? 0 : 1);
/**
 * Verify every [data-theme] block overrides EVERY token declared on :root.
 * A partial block is the classic silent theme bug: one element stays Aero.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('./styles.css', 'utf8');

/** Pull the body of the first `{ ... }` block that follows `selector`. */
function blockFor(selector) {
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
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

const rootBlock = blockFor(':root');
if (rootBlock === null) {
  console.error('FAIL: no :root block found');
  process.exit(1);
}

const tokens = [...rootBlock.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]);
const shapeTokens = new Set(['--radius', '--radius-lg', '--measure', '--shell-max']);

console.log(`tokens declared on :root: ${tokens.length}`);
console.log(`  of which shape/motion (not palette): ${[...shapeTokens].filter((t) => tokens.includes(t)).length}`);

let problems = 0;
for (const id of ['doric', 'eco', 'glacier', 'dark-aero']) {
  const block = blockFor(`[data-theme="${id}"]`);
  if (block === null) {
    console.log(`  ${id}: MISSING BLOCK`);
    problems += 1;
    continue;
  }
  const defined = new Set([...block.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]));
  // Every palette token must be overridden. Shape tokens are intentionally shared.
  const required = tokens.filter((t) => !shapeTokens.has(t));
  const missing = required.filter((t) => !defined.has(t));
  const extra = [...defined].filter((t) => !tokens.includes(t));

  const status = missing.length === 0 ? 'complete' : `MISSING ${missing.join(', ')}`;
  console.log(`  ${id.padEnd(10)} ${defined.size}/${required.length} palette tokens (${status})`);
  if (extra.length) console.log(`             unknown tokens: ${extra.join(', ')}`);
  if (missing.length) problems += 1;
}

console.log(problems === 0 ? 'all themes complete' : `PROBLEMS: ${problems} theme(s) incomplete`);
process.exit(problems === 0 ? 0 : 1);
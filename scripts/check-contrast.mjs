/**
 * WCAG contrast check per theme. Reads the real token values out of styles.css,
 * so it measures what the browser will actually paint.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('./styles.css', 'utf8');

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

const tokensOf = (block) => {
  const out = {};
  for (const m of block.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

const root = tokensOf(blockFor(':root'));
const themes = { aero: root };
for (const id of ['doric', 'eco', 'glacier', 'dark-aero']) {
  themes[id] = { ...root, ...tokensOf(blockFor(`[data-theme="${id}"]`)) };
}

/** Flatten an rgba() over a solid backdrop to get its composited colour. */
function composite(value, backdrop) {
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b, a = '1'] = rgb[1].split(',').map((s) => parseFloat(s));
    const alpha = parseFloat(a);
    return [
      r * alpha + backdrop[0] * (1 - alpha),
      g * alpha + backdrop[1] * (1 - alpha),
      b * alpha + backdrop[2] * (1 - alpha),
    ];
  }
  const hex = value.replace('#', '');
  if (hex.length === 3) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16));
  }
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const luminance = ([r, g, b]) => {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

let failures = 0;
console.log('theme       ink on background        accent-deep on card   verdict');
console.log('-'.repeat(76));

for (const [name, tokens] of Object.entries(themes)) {
  // The body background behind glass panels is the page background at the
  // bottom of the gradient, and panels sit on top of it.
  const backdrop = composite(tokens['--bg-base'], [255, 255, 255]);
  const cardBackdrop = composite(tokens['--card-bot'], backdrop);

  const inkRatio = contrast(composite(tokens['--ink'], backdrop), backdrop);
  const deepRatio = contrast(
    composite(tokens['--accent-deep'], cardBackdrop),
    cardBackdrop,
  );

  const worst = Math.min(inkRatio, deepRatio);
  const verdict = worst >= 4.5 ? 'PASS AA' : worst >= 3 ? 'large-text only' : 'FAIL';
  if (worst < 4.5) failures += 1;

  console.log(
    `${name.padEnd(11)} ${inkRatio.toFixed(2).padStart(5)}                  ` +
      `${deepRatio.toFixed(2).padStart(5)}                ${verdict}`,
  );
}

console.log('-'.repeat(76));
console.log(failures === 0 ? 'all themes PASS AA (>= 4.5)' : `${failures} theme(s) below AA`);
process.exit(failures === 0 ? 0 : 1);
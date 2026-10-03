/**
 * Generates the sixteen Aero avatar SVGs into assets/avatars/.
 *
 *   node scripts/gen-avatars.mjs
 *
 * The output is committed, so the site has no build step — this script exists
 * so the sixteen files are defined once, here, instead of sixteen times on
 * disk. Re-run it after editing SPECS; it is idempotent.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'avatars');

/**
 * Sixteen Frutiger-Aero emblems: a glossy glass sphere over an Aero sky, with a
 * simple symbol inside. Hue and symbol vary so each is recognisable at 32px in
 * the picker grid.
 */
const SPECS = [
  { hue: 195, glyph: 'bubble', label: 'Bubble' },
  { hue: 210, glyph: 'wave', label: 'Wave' },
  { hue: 168, glyph: 'leaf', label: 'Leaf' },
  { hue: 96, hue2: 140, glyph: 'leaf', label: 'Sprout' },
  { hue: 45, glyph: 'sun', label: 'Sun' },
  { hue: 28, glyph: 'droplet', label: 'Droplet' },
  { hue: 340, glyph: 'bubble', label: 'Blossom' },
  { hue: 275, glyph: 'star', label: 'Star' },
  { hue: 230, glyph: 'crystal', label: 'Crystal' },
  { hue: 200, glyph: 'fish', label: 'Fish' },
  { hue: 180, glyph: 'wave', label: 'Tide' },
  { hue: 130, glyph: 'leaf', label: 'Moss' },
  { hue: 60, glyph: 'sun', label: 'Sunbeam' },
  { hue: 15, glyph: 'droplet', label: 'Ember' },
  { hue: 255, glyph: 'crystal', label: 'Glacier' },
  { hue: 190, glyph: 'fish', label: 'Glidefin' },
];

const SIZE = 96;

/* --------------------------------------------------------------- glyphs */

function glyph(kind, ink) {
  const s = (body) => `<g fill="none" stroke="${ink}" stroke-width="3.2"
    stroke-linecap="round" stroke-linejoin="round" opacity=".92">${body}</g>`;

  switch (kind) {
    case 'bubble':
      return `${s(`<circle cx="34" cy="40" r="11"/><circle cx="54" cy="52" r="7"/><circle cx="44" cy="58" r="4.5"/>`)}`;
    case 'wave':
      return `${s(`<path d="M26 46 q8 -9 16 0 t16 0"/>
                   <path d="M26 58 q8 -9 16 0 t16 0"/>`)}`;
    case 'leaf':
      return `${s(`<path d="M48 66 C30 62 26 44 30 30 C46 30 60 42 58 56"/>
                   <path d="M48 66 L40 42"/>`)}`;
    case 'sun':
      return `${s(`<circle cx="44" cy="48" r="10"/>
                   <path d="M44 28 v-7 M44 75 v-7 M24 48 h-7 M71 48 h-7
                            M30 34 l-5 -5 M63 67 l-5 -5 M58 34 l5 -5 M25 67 l5 -5"/>`)}`;
    case 'droplet':
      return `${s(`<path d="M44 28 C56 44 60 50 60 56 a16 16 0 0 1 -32 0 C28 50 32 44 44 28 Z"/>`)}`;
    case 'star':
      return `${s(`<path d="M44 28 l5 12 13 1 -10 9 3 13 -11 -7 -11 7 3 -13 -10 -9 13 -1 Z"/>`)}`;
    case 'crystal':
      return `${s(`<path d="M44 26 L62 44 L52 70 L36 70 L26 44 Z"/>
                   <path d="M26 44 h36 M44 26 L36 70"/>`)}`;
    case 'fish':
      return `${s(`<path d="M28 48 q14 -12 30 0 q-16 12 -30 0 Z"/>
                   <path d="M28 48 l-9 -8 v16 Z"/><circle cx="50" cy="45" r="1.6" fill="${ink}"/>`)}`;
    default:
      return '';
  }
}

/* ---------------------------------------------------------------- render */

function render({ hue, hue2 = hue, glyph: kind }) {
  const top = `hsl(${hue} 88% 78%)`;
  const mid = `hsl(${hue} 74% 58%)`;
  const bottom = `hsl(${hue2} 68% 38%)`;
  const ink = 'hsl(210 60% 16%)';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 96 96" role="img" aria-label="Aero avatar">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
    <radialGradient id="orb" cx="0.34" cy="0.28" r="0.82">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#0b3a5b" stop-opacity=".16"/>
    </radialGradient>
    <clipPath id="round"><circle cx="48" cy="48" r="48"/></clipPath>
  </defs>

  <g clip-path="url(#round)">
    <rect width="96" height="96" fill="url(#sky)"/>
    <!-- Aero sun bloom -->
    <circle cx="76" cy="18" r="26" fill="#fff9c4" opacity=".38"/>
    <!-- glossy sphere -->
    <circle cx="48" cy="48" r="40" fill="url(#orb)"/>
    ${glyph(kind, ink)}
    <!-- specular highlight, the Aero signature -->
    <ellipse cx="34" cy="26" rx="15" ry="9" fill="#ffffff" opacity=".55" transform="rotate(-28 34 26)"/>
  </g>
  <circle cx="48" cy="48" r="47" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="2"/>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
SPECS.forEach((spec, i) => {
  const file = join(OUT, `avatar-${String(i + 1).padStart(2, '0')}.svg`);
  writeFileSync(file, render(spec), 'utf8');
});

console.log(`wrote ${SPECS.length} avatars to assets/avatars/`);
SPECS.forEach((spec, i) => {
  console.log(`  avatar-${String(i + 1).padStart(2, '0')}.svg  ${spec.label}`);
});

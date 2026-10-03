/**
 * Generates the sixteen Aero avatars into assets/avatars/.
 *
 *   node scripts/gen-avatars.mjs
 *
 * The output is committed, so the site has no build step — this script exists so
 * the sixteen files are defined once, here, instead of sixteen times on disk.
 * Re-run it after editing SPECS; it is idempotent.
 *
 * Each avatar is the same simple figure — a floating body, a head above it and a
 * ball at each hand — over a glossy Aero orb. Only the colours change, which is
 * how the Messenger default display pictures worked: one pose, many colours.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'avatars');

/**
 * hue: the orb's Aero gradient. skin: the figure's body and head colour.
 * The palest two get white ball hands so they read as gloves.
 */
const SPECS = [
  { hue: 195, skin: '#f6c9a4', label: 'Aero' },
  { hue: 210, skin: '#e8b184', label: 'Sky' },
  { hue: 168, skin: '#fbd9b4', label: 'Lagoon' },
  { hue: 96, skin: '#e5a97e', label: 'Sprout' },
  { hue: 45, skin: '#ffd9a8', label: 'Sun' },
  { hue: 28, skin: '#e0a074', label: 'Amber' },
  { hue: 340, skin: '#f7c3ae', label: 'Blossom' },
  { hue: 275, skin: '#f2c6b0', label: 'Iris' },
  { hue: 230, skin: '#d79a6f', label: 'Cobalt' },
  { hue: 200, skin: '#f8d3ae', label: 'Glacier' },
  { hue: 180, skin: '#efbb90', label: 'Tide' },
  { hue: 130, skin: '#eab184', label: 'Moss' },
  { hue: 60, skin: '#ffe0b5', label: 'Sunbeam' },
  { hue: 15, skin: '#dfa07c', label: 'Ember' },
  { hue: 255, skin: '#f5cbb4', label: 'Lilac' },
  { hue: 190, skin: '#c98f63', label: 'Bronze' },
];

const SIZE = 96;

/* ---------------------------------------------------------------- figure */

/**
 * The floating figure: a rounded body, a head floating above it, and a ball at
 * each hand. Kept chunky so it still reads at 32px in the picker grid.
 */
function figure(skin, hands) {
  return `
    <circle cx="48" cy="30" r="13" fill="${skin}"/>
    <path d="M48 45 c-13 0 -20 9 -20 20 c0 9 9 14 20 14 s20 -5 20 -14 c0 -11 -7 -20 -20 -20 Z" fill="${skin}"/>
    <circle cx="21" cy="66" r="8" fill="${hands}"/>
    <circle cx="75" cy="66" r="8" fill="${hands}"/>
    <ellipse cx="48" cy="76" rx="13" ry="4" fill="#000000" opacity=".10"/>`;
}

/* ---------------------------------------------------------------- render */

function render({ hue, skin }) {
  const pale = skin === '#f6c9a4' || skin === '#fbd9b4';
  const hands = pale ? '#ffffff' : skin;
  const top = `hsl(${hue} 88% 80%)`;
  const mid = `hsl(${hue} 74% 60%)`;
  const bottom = `hsl(${hue} 62% 38%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 96 96" role="img" aria-label="Frutiger Aero avatar">
  <defs>
    <linearGradient id="orb" x1="0.2" y1="0" x2="0.55" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.32" cy="0.22" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".92"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity=".16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="round"><circle cx="48" cy="48" r="48"/></clipPath>
  </defs>

  <g clip-path="url(#round)">
    <rect width="96" height="96" fill="url(#orb)"/>
    <circle cx="80" cy="14" r="24" fill="#fff9c4" opacity=".45"/>
    ${figure(skin, hands)}
    <rect width="96" height="96" fill="url(#gloss)"/>
  </g>
  <circle cx="48" cy="48" r="47" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="2"/>
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

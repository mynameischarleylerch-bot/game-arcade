/**
 * Generates the sixteen avatars into assets/avatars/.
 *
 *   node scripts/gen-avatars.mjs
 *
 * The output is committed, so the site has no build step — this script exists so
 * the sixteen files are defined once, here, instead of sixteen times on disk.
 * Re-run it after editing SPECS; it is idempotent.
 *
 * The figure is a single continuous blob in the style of the old MSN Messenger
 * butterfly: one big spherical head merged into a wide body that flares out at
 * the bottom, with soft shoulder lobes. There are deliberately NO legs, NO arms,
 * NO hands and NO separate parts — it is one closed silhouette, and it is not
 * stretched: the proportions are a touch taller than wide inside a square box.
 *
 * Only the colour changes between the sixteen.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'avatars');

/** hue drives the whole three-stop gloss ramp; the first entry is MSN green. */
const SPECS = [
  { hue: 138, sat: 62, label: 'Messenger' },
  { hue: 96, sat: 58, label: 'Lime' },
  { hue: 168, sat: 58, label: 'Lagoon' },
  { hue: 195, sat: 62, label: 'Aero' },
  { hue: 210, sat: 60, label: 'Sky' },
  { hue: 230, sat: 55, label: 'Cobalt' },
  { hue: 255, sat: 52, label: 'Iris' },
  { hue: 275, sat: 48, label: 'Lilac' },
  { hue: 300, sat: 50, label: 'Orchid' },
  { hue: 330, sat: 55, label: 'Blossom' },
  { hue: 350, sat: 58, label: 'Coral' },
  { hue: 15, sat: 60, label: 'Ember' },
  { hue: 32, sat: 62, label: 'Amber' },
  { hue: 48, sat: 64, label: 'Sun' },
  { hue: 175, sat: 55, label: 'Teal' },
  { hue: 120, sat: 45, label: 'Moss' },
];

const SIZE = 96;

/* ------------------------------------------------------------------ shape */

/**
 * One closed path: head, shoulders, flared body, rounded base. Drawn in a 96x96
 * box, occupying roughly x 18..78 and y 10..88, so it reads as a slightly tall
 * rounded figure rather than an oval squashed into a circle.
 */
const FIGURE = 'M48 11'
  + ' C58.5 11 67 19.5 67 30'
  + ' C67 36 64.5 41.5 60 45'
  + ' C64.5 45.6 68.5 47.2 72 50.2'
  + ' C77.5 54.8 82 60 82 66'
  + ' C82 70 80.5 72.6 78 74.6'
  + ' C80.2 76.6 81.2 79 81.2 81.6'
  + ' C81.2 86.6 68 89.6 48 89.6'
  + ' C28 89.6 14.8 86.6 14.8 81.6'
  + ' C14.8 79 15.8 76.6 18 74.6'
  + ' C15.5 72.6 14 70 14 66'
  + ' C14 60 18.5 54.8 24 50.2'
  + ' C27.5 47.2 31.5 45.6 36 45'
  + ' C31.5 41.5 29 36 29 30'
  + ' C29 19.5 37.5 11 48 11'
  + ' Z';

/* ----------------------------------------------------------------- render */

function render({ hue, sat }) {
  // A three-stop ramp: lit top-left, saturated mid, deep bottom-right. This is
  // what makes it read as a solid glossy object rather than flat vector art.
  const light = `hsl(${hue} ${sat}% 74%)`;
  const mid = `hsl(${hue} ${sat}% 54%)`;
  const deep = `hsl(${hue} ${Math.max(28, sat - 18)}% 26%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 96 96" role="img" aria-label="${'Aero avatar'}">
  <defs>
    <linearGradient id="body" x1="0.22" y1="0.05" x2="0.85" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.42" stop-color="${mid}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.36" cy="0.24" r="0.52">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".92"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity=".28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shoulder" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="figure">
      <path d="${FIGURE}"/>
    </clipPath>
  </defs>

  <!-- transparent background, so the orb behind shows through -->
  <g clip-path="url(#figure)">
    <rect width="96" height="96" fill="url(#body)"/>
    <!-- the big specular highlight, up and to the left over the head -->
    <ellipse cx="37" cy="26" rx="15" ry="11" fill="url(#sheen)" transform="rotate(-24 37 26)"/>
    <!-- softer light on the far shoulder -->
    <ellipse cx="63" cy="52" rx="12" ry="9" fill="url(#shoulder)" transform="rotate(20 63 52)"/>
    <!-- ambient darkening along the lower right, to seat the form -->
    <ellipse cx="70" cy="84" rx="26" ry="16" fill="${deep}" opacity=".35"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
SPECS.forEach((spec, i) => {
  const file = join(OUT, `avatar-${String(i + 1).padStart(2, '0')}.svg`);
  writeFileSync(file, render(spec), 'utf8');
});

console.log(`wrote ${SPECS.length} avatars to assets/avatars/`);
console.log('one closed silhouette, no limbs, sixteen colours, avatar-01 is MSN green');

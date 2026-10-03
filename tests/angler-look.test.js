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

test('the angler is the Messenger blob, with no limbs', () => {
  const d = PAGE.match(/<path class="scene__figure" d="([^"]+)"/)[1];
  assert.ok(d.startsWith('M33.2'), 'the figure should be the blob path');
  assert.ok(d.trim().endsWith('Z'), 'one closed silhouette');
  // No legs, arms or hands. Check the figure's own markup and count shapes
  // rather than searching words: the pier legitimately has legs, in a comment.
  // The figure alone: from its path up to the first gloss ellipse.
  const figure = PAGE.slice(
    PAGE.indexOf('<path class="scene__figure"'),
    PAGE.indexOf('<ellipse class="scene__shine"'),
  );
  assert.equal((figure.match(/<path\b/g) || []).length, 1,
    'the figure must be one path, not several parts');
  assert.equal(/<(rect|circle|polygon|ellipse)\b/.test(figure), false,
    'the figure is a bare silhouette: no head circle, limbs or shapes of its own');

  // The gloss sits over it: exactly two highlights, nothing else.
  const gloss = PAGE.slice(
    PAGE.indexOf('<ellipse class="scene__shine"'),
    PAGE.lastIndexOf('<path', PAGE.indexOf('class="scene__rod"')),
  );
  assert.equal((gloss.match(/<ellipse\b/g) || []).length, 2,
    'exactly two gloss highlights');
  assert.equal(/<(rect|circle|path|polygon)\b/.test(gloss), false,
    'nothing but the two ellipses may sit over the figure');
});

test('the blob stands on the pier deck, not floating above it', () => {
  const d = PAGE.match(/<path class="scene__figure" d="([^"]+)"/)[1];
  const nums = [...d.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
  const ys = nums.filter((_, i) => i % 2 === 1);
  const deck = Number(PAGE.match(/<rect class="scene__wood" x="0" y="(\d+)"/)[1]);
  // It stands ON the deck: the blob's base meets the deck's top edge.
  assert.ok(Math.abs(Math.max(...ys) - deck) < 0.6,
    `blob base ${Math.max(...ys)} should meet the deck at ${deck}`);
});

test('the fishing line starts at the rod tip the lure marks', () => {
  const start = PAGE.match(/id="line" d="M([\d.]+) ([\d.]+)/);
  const lure = PAGE.match(/id="rod-tip" cx="([\d.]+)" cy="([\d.]+)"/);
  assert.ok(start && lure, 'the line and the lure must both be in the scene');

  // angler.js measures the lure at runtime, so the shipped path only has to agree
  // with it. These are the carbon rod's numbers, which is what the page ships.
  assert.ok(Math.abs(Number(start[1]) - Number(lure[1])) <= 2,
    `line starts at x=${start[1]}, lure at ${lure[1]}`);
  assert.ok(Math.abs(Number(start[2]) - Number(lure[2])) <= 3,
    `line starts at y=${start[2]}, lure at ${lure[2]}`);
});

test('the rod and lure are addressable so equipping can repaint them', () => {
  assert.match(PAGE, /id="rod-shaft"/, 'the rod needs an id angler.js can rewrite');
  assert.match(PAGE, /id="rod-tip"/, 'the lure needs an id too');
  // They ship as inline attributes so the rod is visible before any script runs.
  assert.match(PAGE, /id="rod-shaft"[^>]*\bd="/, 'the rod must ship with a path');
  assert.match(PAGE, /id="rod-shaft"[^>]*stroke="#[0-9a-f]{6}"/i, 'and a colour');
  assert.match(PAGE, /id="rod-shaft"[^>]*stroke-width="[\d.]+"/, 'and a thickness');
});

test('angler.js measures the rod tip instead of reading cx/cy', () => {
  const src = readFileSync(new URL('../vendor/fru-angler/angler.js', import.meta.url), 'utf8');
  assert.match(src, /function rodTip\(/, 'rodTip() must exist');
  assert.match(src, /getBoundingClientRect/, 'rodTip() must measure the rendered lure');
  assert.equal(/const cx = parseFloat\(lure\?\.getAttribute\('cx'\)/.test(src), false,
    'cx/cy are pre-transform viewBox units, not where the lure actually renders');
});

test('the scene is not stretched: the angler keeps its proportions', () => {
  // The lake is a wide box; a square viewBox with preserveAspectRatio="none"
  // scales x and y independently, which is what turned the blob into an oval.
  const stretchFix = readFileSync(
    new URL('../vendor/fru-angler/angler.js', import.meta.url), 'utf8');
  assert.match(stretchFix, /fitFigure|scale\(/,
    'angler.js must counter-scale the figure to the lake aspect');
  assert.match(stretchFix, /ResizeObserver|resize/,
    'it must re-fit when the lake resizes');
});

test('the figure group is wrapped so it can be counter-scaled', () => {
  // One group holding the blob, its gloss, the rod and the lure, so a single
  // transform can keep them proportioned without touching the scenery.
  assert.match(PAGE, /<g id="angler-fit">/, 'the figure group must exist');
  const open = PAGE.indexOf('<g id="angler-fit">');
  const close = PAGE.indexOf('</g>', open);
  const inside = PAGE.slice(open, close);
  assert.equal((inside.match(/<path\b/g) || []).length, 2,
    'the figure and the rod, and nothing else');
  assert.equal((inside.match(/<circle\b/g) || []).length, 1, 'just the lure');
  assert.equal((inside.match(/<ellipse\b/g) || []).length, 2, 'the two gloss highlights');
});

test('the fishing line sits outside the counter-scaled group', () => {
  const close = PAGE.indexOf('</g>', PAGE.indexOf('<g id="angler-fit">'));
  const line = PAGE.indexOf('id="line"');
  assert.ok(line > close,
    'the line must not be counter-warped, or the curve distorts with the figure');
});

test("the shipped line path agrees with where angler.js puts the tip", () => {
  // A mismatch here shows as the line jumping on the first cast.
  const start = PAGE.match(/id="line" d="M([\d.]+) ([\d.]+)/);
  const lure = PAGE.match(/id="rod-tip" cx="([\d.]+)" cy="([\d.]+)"/);
  assert.ok(start && lure, 'line and lure must both exist');
  assert.ok(Math.abs(Number(start[1]) - Number(lure[1])) <= 2,
    `the initial line start x=${start[1]} should be the lure at x=${lure[1]}`);
  assert.ok(Math.abs(Number(start[2]) - Number(lure[2])) <= 3,
    `the initial line start y=${start[2]} should be the lure at y=${lure[2]}`);
});

test('the inventory button and panel are in the markup', () => {
  // The whole point of the change: there must be a discoverable Inventory button,
  // not just a shop panel that happens to list what you own.
  assert.match(PAGE, /id="inventory-open"/, 'the inventory button must exist');
  assert.match(PAGE, /id="inventory-count"/, 'and show how many rods you carry');
  assert.match(PAGE, /id="inventory-panel"/, 'the panel must exist');
  assert.match(PAGE, /id="inventory-rods"/, 'with a place for your rods');
  assert.match(PAGE, /id="inventory-fish"/, 'and a place for your fish');
  assert.match(PAGE, /id="inventory-close"/, 'and a way to close it');
  // The button must be labelled, or it is not discoverable.
  assert.match(PAGE, /id="inventory-open"[^>]*>\s*Inventory/, 'it must say Inventory');
  // Both panels must start closed.
  assert.match(PAGE, /id="inventory-panel"[^>]*\bhidden\b/);
  assert.match(PAGE, /id="shop-panel"[^>]*\bhidden\b/);
});

test('the inventory has styling for its rows and badge', () => {
  assert.match(PAGE, /\.hud__badge/, 'the count badge needs styling');
  assert.match(PAGE, /\.catch\b/, 'the fish rows need styling');
  assert.match(PAGE, /\.species__weight/, 'and their weights');
  assert.match(PAGE, /\.species\[data-caught="false"\]/, 'and a muted uncaught state');
});

test('the shop styles the inventory sections', () => {
  assert.match(PAGE, /\.shop__section/, 'inventory/for-sale headings need styling');
  assert.match(PAGE, /\.rod__swatch/, 'the rod colour chip needs styling');
});

test('the perfect band is lime, the Aero "go" colour', () => {
  // Now a gradient built from the --lime token rather than a literal.
  assert.match(PAGE, /\.cast__band\s*\{[^}]*background:[^;]*var\(--lime\)/);
  assert.match(PAGE, /--lime:\s*#a3e635/, '--lime must stay the Aero lime');
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


/* ------------------------------------------------- CSS class collisions */

test('the inventory fish rows do not reuse the catch-overlay class', () => {
  // ".catch" is the full-screen catch overlay: position absolute, inset 0, z 9.
  // Reusing it for a row inside the inventory made every fish row a full-screen
  // overlay stacked over the panel, hiding the rods and the close button.
  assert.equal(/\.catch\s*\{/m.test(PAGE), false,
    'the bare .catch selector must only be used by the overlay');

  // The rows are built in JS, so check the script that creates them.
  const script = readFileSync(new URL('../vendor/fru-angler/angler.js', import.meta.url), 'utf8');
  assert.match(script, /row\.className = 'species'/,
    'inventory fish rows must use their own .species class');
  assert.equal(/row\.className = 'catch'/.test(script), false,
    "the row must not reuse the catch overlay's class");
  assert.match(PAGE, /\.species\s*\{/, '.species must be styled');
  // A row is inline content: it must not be an overlay.
  const rule = PAGE.match(/\.species\s*\{([^}]*)\}/)[1];
  assert.equal(/position:\s*absolute/.test(rule), false,
    'a fish row must not be absolutely positioned');
});

/**
 * A class must not be declared twice as a plain selector: two plain rules silently
 * merge and the loser is whichever the author forgot about. A pseudo-class or
 * pseudo-element (`.rod:disabled`, `.lake::before`) is a different selector and
 * legitimately separate, so those are excluded.
 */
/*
 * Rules outside any @media block. A rule inside one — a prefers-reduced-motion
 * override, say — is the same class deliberately restated, so counting it as a
 * duplicate declaration is a false positive.
 */
const CSS_RULES = [...PAGE
  .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/g, '')   // drop @media blocks
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)];

test('no class is declared twice as a plain selector', () => {
  const counts = new Map();

  for (const [, selector] of CSS_RULES) {
    // Only single-class selectors count. `.a` declares a class; `.a .b` and
    // `.a:hover` are different, more specific selectors and are legitimate.
    const trimmed = selector.trim();
    if (/\s/.test(trimmed)) continue;                     // descendant or compound
    const only = trimmed.match(/^\.([a-z][\w-]*)$/);
    if (!only) continue;
    counts.set(only[1], (counts.get(only[1]) ?? 0) + 1);
  }

  const dupes = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([name, n]) => `${name} x${n}`);
  assert.deepEqual(dupes, [],
    `classes declared as a plain selector more than once: ${dupes.join(', ')}`);
});

test('no element inside the inventory panel uses an overlay class', () => {
  const panels = [...PAGE.matchAll(/id="(shop-panel|inventory-panel)"[\s\S]*?<\/div>\s*<\/div>/g)];
  assert.ok(panels.length >= 2, 'both panels should be in the markup');
  for (const [, id] of panels) {
    assert.equal(new RegExp(`id="${id}"[\\s\\S]*?class="catch"`).test(PAGE), false,
      `${id} must not contain an element with the catch-overlay class`);
  }
});


test('the scene has no orphaned text or unclosed fragments', () => {
  // A bare path string with no opening tag renders nothing, so it can survive
  // unnoticed. It is invalid markup and must not come back.
  const scene = PAGE.slice(PAGE.indexOf('<svg class="scene"'), PAGE.indexOf('</svg>'));
  assert.equal(/^\s*M[\d.]/m.test(scene), false,
    'found a bare path fragment with no opening tag');

  // Strip comments, then every d= must belong to a real tag.
  const stripped = scene.replace(/<!--[\s\S]*?-->/g, '');
  const openTags = (stripped.match(/<path\b[^>]*>/g) || []).length;
  assert.ok(openTags >= 3, `expected several paths, found ${openTags}`);

  // The angler comment appears once, in the group that actually contains it.
  const mentions = (scene.match(/shoulder lobes, no limbs/g) || []).length;
  assert.equal(mentions, 1, `the angler comment appears ${mentions} times`);
});

test('the closing group and the line comment are indented with their block', () => {
  // Both sat at 16 spaces where the surrounding block uses 8.
  const scene = PAGE.slice(PAGE.indexOf('<svg class="scene"'), PAGE.indexOf('</svg>'));
  for (const marker of ['</g>', '<!-- The fishing line runs']) {
    const line = scene.split('\n').find((l) => l.trim().startsWith(marker));
    assert.ok(line, `${marker} not found`);
    assert.equal(line.length - line.trimStart().length, 8,
      `${marker} is indented ${line.length - line.trimStart().length}, expected 8`);
  }
});


test('the game has the full set of Aero tokens', () => {
  const start = PAGE.indexOf(':root {');
  const root = PAGE.slice(start, PAGE.indexOf('}', start));
  for (const token of [
    '--glass-top', '--glass-mid', '--glass-bot',
    '--sheen', '--hairline', '--radius', '--radius-lg',
    '--shadow-card', '--shadow-panel', '--shadow-edge', '--gloss-strength',
  ]) {
    assert.match(root, new RegExp(`${token}\\s*:`), `missing token ${token}`);
  }
});

test('the new tokens are all used, not just declared', () => {
  // --sheen, --radius and --gloss-strength are consumed by Tasks 4-8; assert the
  // whole set is eventually used, and the glass/hairline pair now.
  for (const token of ['--glass-top', '--hairline']) {
    assert.ok(PAGE.split(token).length > 2, `${token} is declared but never used`);
  }
});


test('panels use the shared glass and shadow tokens', () => {
  for (const sel of ['.hud', '.reel', '.catch__card', '.shop__panel']) {
    const rule = PAGE.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `${sel} must have a rule`);
    assert.match(rule[1], /var\(--glass/, `${sel} should use --glass`);
    assert.match(rule[1], /var\(--shadow-/, `${sel} should use a --shadow-* token`);
    assert.match(rule[1], /var\(--hairline/, `${sel} should use a --hairline token`);
  }
});


test('the flat UI pieces have all gained gradients and gloss', () => {
  const need = {
    '.cast__band':    [/box-shadow/],
    '.reel__progress':[/gradient/, /box-shadow/],
    '.rod':           [/gradient|var\(--shine/, /box-shadow/],
    '.message':       [/gradient/, /box-shadow/],
  };
  for (const [sel, patterns] of Object.entries(need)) {
    const rule = PAGE.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n  \\}`));
    assert.ok(rule, `${sel} must have a rule`);
    for (const p of patterns) assert.match(rule[1], p, `${sel} is missing ${p}`);
  }

  // The hover lift is a sibling rule, which is where a :hover belongs.
  assert.match(PAGE, /\.rod:not\(:disabled\):hover[^}]*translateY/,
    'rod rows must lift on hover');
  assert.match(PAGE, /\.rod:not\(:disabled\):hover[^}]*var\(--shadow-lift\)/,
    'and deepen their shadow while lifted');
});

test('the hint bar fades in from transparent rather than boxing the lake', () => {
  // .message covers the whole lake, so a solid background would draw a visible
  // frame around the entire play area.
  const rule = PAGE.match(/\.message\s*\{([^}]*)\}/)[1];
  assert.match(rule, /rgba\([^)]*,\s*0\)/, 'the hint must start fully transparent');
  assert.equal(/border:/.test(rule), false, 'a border would outline the whole lake');
});


test('the lake is layered glass, not a single gradient', () => {
  const rule = PAGE.match(/\.lake\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(rule, /var\(--shadow-panel\)/, 'the lake should use the panel shadow');
  assert.match(rule, /var\(--hairline/, 'and a hairline edge');

  // Two stacked layers: the specular sweep over the sky-to-lake gradient.
  const gradients = (rule.match(/gradient/g) || []).length;
  assert.ok(gradients >= 2, `expected 2+ gradient layers, found ${gradients}`);
  assert.match(PAGE, /\.lake::after[\s\S]*?radial-gradient/,
    'a specular sweep belongs in ::after');
});

test('the sheen drift respects reduced motion', () => {
  const reduced = PAGE.slice(PAGE.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.lake::after\s*\{[^}]*animation:\s*none/,
    'the drift must stop for users who ask for reduced motion');
});


test('the scene paints with gradients and speculars, not flat fills', () => {
  const scene = PAGE.slice(PAGE.indexOf('<svg class="scene"'), PAGE.indexOf('</svg>'));
  const linear = (scene.match(/<linearGradient/g) || []).length;
  const radial = (scene.match(/<radialGradient/g) || []).length;
  assert.ok(linear >= 4, `expected 4+ linear gradients, found ${linear}`);
  assert.ok(radial >= 2, `expected 2+ radial speculars, found ${radial}`);

  // The flat fills must be gone: shore, wood and figure are gradient-filled now.
  assert.equal(/\.scene__shore\s*\{[^}]*fill:\s*#5aa6cf/.test(PAGE), false,
    'the shore must not be a flat hex fill');
  assert.equal(/\.scene__figure\s*\{[^}]*fill:\s*var\(--deepest\)/.test(PAGE), false,
    'the angler must not be a flat fill');
  assert.equal(/\.scene__wood\s*\{[^}]*fill:\s*var\(--wood\)\s*;?\s*\}/.test(PAGE), false,
    'the pier must not be a flat fill');
});

test('every gradient the scene references is defined in its own defs', () => {
  const scene = PAGE.slice(PAGE.indexOf('<svg class="scene"'), PAGE.indexOf('</svg>'));
  const ids = new Set([...scene.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const ref of scene.matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(ids.has(ref[1]), `dangling scene gradient #${ref[1]}`);
  }
});

test('the rod keeps its inline colour so equipping still repaints it', () => {
  // paintRod() writes stroke/fill on these elements. A stylesheet rule would be
  // overridden by the inline attribute, which is correct, but it means the rod
  // must not be moved into CSS.
  const scene = PAGE.slice(PAGE.indexOf('<svg class="scene"'), PAGE.indexOf('</svg>'));
  assert.match(scene, /id="rod-shaft"[^>]*stroke="#[0-9a-f]{6}"/i);
  assert.match(scene, /id="rod-tip"[^>]*cx="/);
  assert.match(scene, /id="rod-tip"[^>]*cy="/);
});


test('the reel bars read as glass, not plastic', () => {
  const player = PAGE.match(/\.reel__player\s*\{([^}]*)\}/)[1];
  assert.match(player, /gradient/, 'the player bar needs a gradient');
  assert.match(player, /inset 0 1px 0/, 'and the Aero top gloss');
  const fish = PAGE.match(/\.reel__fish\s*\{([^}]*)\}/)[1];
  assert.match(fish, /gradient/, 'the fish line needs a gradient');
  // Two shadows: a tight glow and a wider bloom.
  assert.ok((fish.match(/0 0 /g) || []).length >= 2, 'the fish line should glow and bloom');
});

test('the catch card and its art tile are glass', () => {
  const card = PAGE.match(/\.catch__card\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(card, /gradient/, 'the card needs glass');
  assert.match(card, /var\(--shadow-/, 'and it should lift');
  const art = PAGE.match(/\.catch__art\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(art, /var\(--hairline/, 'the tile edge should be a hairline');
  assert.match(art, /var\(--shadow-/, 'the tile should lift off the card');
});

test('the fish drawing itself keeps its gloss layers', () => {
  const src = readFileSync(new URL('../vendor/fru-angler/fishing.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export function fishSvg'));
  assert.match(block, /<linearGradient/, 'the body needs a gradient');
  assert.match(block, /<radialGradient/, 'and a specular');
  assert.match(block, /class="belly"/, 'and a belly highlight');
  assert.match(block, /class="specular"/, 'and a gloss overlay');
  // The gloss layers sit on top of the fish, so it must not read as flat.
  assert.match(block, /class="scales"/, 'and scale sheen arcs along the flank');
});


test('the water carries Aero bubbles above the lake', () => {
  assert.match(PAGE, /\.lake__bubble\s*\{/, 'decorative bubbles must be styled');
  assert.match(PAGE, /class="lake__bubble lake__bubble--1"/, 'and present in the markup');
  const bubble = PAGE.match(/\.lake__bubble\s*\{([\s\S]*?)\n  \}/)[1];
  assert.match(bubble, /gradient/, 'bubbles need a gradient to read as glass');
  assert.match(bubble, /box-shadow/, 'and a rim to catch the light');
});

test('the bubbles are decorative only', () => {
  // Count across the whole document: the bubbles sit inside the lake, after the
  // scene SVG, and must not reach assistive tech.
  const bubbles = [...PAGE.matchAll(/<div class="lake__bubble[^"]*"([^>]*)>/g)];
  assert.equal(bubbles.length, 5, `expected 5 bubbles, found ${bubbles.length}`);
  for (const [, attrs] of bubbles) {
    assert.match(attrs, /aria-hidden="true"/, 'a bubble must not reach the screen reader');
  }
  // They must live inside the lake, not after it.
  // The bubbles sit after the scene SVG and before the cast meter, all inside the
  // lake. Use the cast meter's opening tag as the far boundary.
  const lakeStart = PAGE.indexOf('<div class="lake" id="lake"');
  const lakeEnd = PAGE.indexOf('<div class="cast"');
  for (const m of bubbles) {
    assert.ok(m.index > lakeStart && m.index < lakeEnd,
      'the bubbles must be children of the lake');
  }
});

test('the bubbles respect reduced motion', () => {
  const reduced = PAGE.slice(PAGE.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.lake__bubble\s*\{[^}]*animation:\s*none/);
});

/**
 * Integration test for Frutiger Angler: drives the real DOM through a full
 * cast -> bite -> reel -> land cycle with a virtual clock, using the same
 * keyboard events a player generates.
 *
 * The pure rules are covered by angler-fishing.test.js and angler-reel.test.js.
 * This file exists to prove the wiring: that the HUD, the bite timer, the reel
 * UI, the catch card, the shop and localStorage all actually connect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const PAGE = readFileSync(
  new URL('../vendor/fru-angler/index.html', import.meta.url),
  'utf8',
).replace(/<script[\s\S]*?<\/script>/g, '');   // we import the module ourselves

/**
 * Boot a fresh instance. Each call gets its own JSDOM, virtual clock and module
 * instance (the ?run= query defeats Node's ES module cache).
 */
async function boot(run = 1, randomValue = 0.1) {
  const dom = new JSDOM(PAGE, { url: 'http://localhost:8080/vendor/fru-angler/index.html' });
  const win = dom.window;

  // Pin the randomness. The game uses Math.random() for the fish roll, the bite
  // jitter, the reel wander and the shake placement, so one constant makes a run
  // reproducible. 0.1 lands on a Glidefin — difficulty itself is covered by
  // angler-reel.test.js, so these tests only need a known fish to exercise wiring.
  globalThis.Math.random = () => randomValue;

  let now = 1000;
  let queue = [];
  const intervals = new Set();

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.performance = { now: () => now };
  const ctx = {
    win,
    doc: win.document,
    dom,
    now,
    queue,
    intervals,
  };

  globalThis.requestAnimationFrame = (cb) => ctx.queue.push(cb);
  globalThis.setInterval = (fn) => { ctx.intervals.add(fn); return ctx.intervals.size; };
  globalThis.clearInterval = () => ctx.intervals.clear();

  await import(`../vendor/fru-angler/angler.js?run=${run}`);
  return ctx;
}

/** Advance one animation frame. */
function step(ctx) {
  const cbs = ctx.queue;
  ctx.queue = [];
  for (const cb of cbs) cb(ctx.now);
  ctx.now += 1000 / 60;
}

/** Advance `frames` frames. */
function run(ctx, frames) {
  for (let i = 0; i < frames; i += 1) step(ctx);
}

/** Advance frames until `predicate` holds, and report whether it ever did. */
function runUntil(ctx, predicate, frames) {
  for (let i = 0; i < frames; i += 1) {
    if (predicate()) return true;
    step(ctx);
  }
  return predicate();
}

/** Cast, then wait out the bite. Returns true once the minigame is open. */
function castAndWaitForBite(ctx) {
  key(ctx, 'keydown');
  run(ctx, 20);
  key(ctx, 'keyup');
  return runUntil(ctx, () => !ctx.doc.getElementById('reel').hidden, 60 * 8);
}

const key = (ctx, type) => ctx.win.dispatchEvent(
  new ctx.win.KeyboardEvent(type, { code: 'Space', bubbles: true, cancelable: true }),
);

/** Read the reel UI back out of the DOM as numbers. */
function reelUi(ctx) {
  const pct = (el, prop) => parseFloat(ctx.doc.getElementById(el).style[prop]);
  return {
    fish: pct('reel-fish', 'left'),
    playerLeft: pct('reel-player', 'left'),
    playerWidth: pct('reel-player', 'width'),
    progress: pct('reel-fill', 'width'),
  };
}

const text = (ctx, id) => ctx.doc.getElementById(id).textContent;

test('the game boots with a rod, a wallet and the idle hint', async () => {
  const ctx = await boot(1);
  assert.equal(text(ctx, 'rod'), 'Bamboo Pole');
  assert.ok(Number(text(ctx, 'coins')) > 0, 'starts with coins');
  assert.equal(text(ctx, 'message').length > 0, true, 'tells the player what to do');
  assert.equal(text(ctx, 'bestiary'), '0/6 species landed');
});

test('holding space raises the cast meter and releasing starts the wait', async () => {
  const ctx = await boot(2);
  key(ctx, 'keydown');
  run(ctx, 3);

  assert.equal(ctx.doc.getElementById('cast').hidden, false, 'the cast bar appears');
  const width = parseFloat(ctx.doc.getElementById('cast-fill').style.width);
  assert.ok(width > 0, `meter should have grown, got ${width}%`);

  key(ctx, 'keyup');
  assert.equal(ctx.doc.getElementById('cast').hidden, true, 'the cast bar retracts');
  assert.equal(ctx.doc.getElementById('reel').hidden, true, 'no minigame until the bite');
});

test('the bobber travels and a bite eventually opens the minigame', async () => {
  const ctx = await boot(3);
  const startLeft = ctx.doc.getElementById('bobber').style.left;

  key(ctx, 'keydown');
  run(ctx, 40);      // charge the meter well past the green band
  key(ctx, 'keyup');

  assert.notEqual(ctx.doc.getElementById('bobber').style.left, startLeft, 'the bobber moved');

  // The bite is due within ~4.4s on the starting rod; 8s of frames covers it.
  const opened = runUntil(ctx, () => !ctx.doc.getElementById('reel').hidden, 60 * 8);
  assert.equal(opened, true, 'the reeling minigame opened');
  assert.match(text(ctx, 'rod-stats'), /control .*resilience .*luck .*kg/);
});

test('a tracking player lands the fish, is paid, and the bestiary updates', async () => {
  const ctx = await boot(4, 0.1);   // pinned to a Glidefin: fight 0.35, easy to hold
  const before = Number(text(ctx, 'coins'));

  assert.equal(castAndWaitForBite(ctx), true, 'hooked');

  // Play it properly: hold when the player is left of the fish, release when right.
  // This is the same input path a person uses, so it exercises the real rules.
  for (let i = 0; i < 60 * 60; i += 1) {
    const ui = reelUi(ctx);
    const centre = ui.playerLeft + ui.playerWidth / 2;
    // Aim where the fish is going, not where it is: chasing the current position
    // lags by a frame and loses containment on the twitchy fish.
    const lead = ui.fish - centre;
    if (lead > -0.5) key(ctx, 'keydown');
    else key(ctx, 'keyup');
    step(ctx);
    if (!ctx.doc.getElementById('catch').hidden) break;
  }

  assert.equal(ctx.doc.getElementById('catch').hidden, false,
    'a tracking player should land the fish within 60s');

  const name = text(ctx, 'catch-name');
  const meta = text(ctx, 'catch-meta');
  assert.ok(name.length > 0, 'the catch card names the fish');
  assert.doesNotMatch(name, /Line snapped/, 'a tracked fish is not snapped: ' + name);
  assert.match(meta, /(Common|Uncommon|Rare|Legendary|Mythical) · [0-9.]+ kg/,
    'the card states rarity and weight: ' + meta);
  assert.match(text(ctx, 'catch-value'), /^¤ \d+$/);
  assert.ok(Number(text(ctx, 'coins')) > before, 'landing a fish pays out');
  assert.equal(text(ctx, 'bestiary'), '1/6 species landed');
});

test('ignoring the fish drains the bar and snaps the line', async () => {
  const ctx = await boot(5);
  assert.equal(castAndWaitForBite(ctx), true);
  // It starts part-full rather than at zero, so one early mistake is recoverable.
  const opening = parseFloat(ctx.doc.getElementById('reel-fill').style.width);
  assert.ok(opening > 25 && opening < 50, `bar should open part-full, got ${opening}%`);

  // Never touch the control, so the bar drifts left and the fish escapes.
  run(ctx, 60 * 60);

  assert.equal(ctx.doc.getElementById('catch').hidden, false, 'the attempt resolved');
  assert.equal(text(ctx, 'catch-name'), 'Line snapped');
  assert.match(text(ctx, 'catch-meta'), /got away|Line snapped/);
  assert.equal(text(ctx, 'catch-value'), '¤ 0');
});

test('casting again returns to the idle prompt', async () => {
  const ctx = await boot(6);
  assert.equal(castAndWaitForBite(ctx), true);
  run(ctx, 60 * 60);   // let it resolve one way or the other

  ctx.doc.getElementById('catch-again').click();
  assert.equal(ctx.doc.getElementById('catch').hidden, true);
  assert.equal(ctx.doc.getElementById('reel').hidden, true);
  assert.match(text(ctx, 'message'), /Hold Space/);
});

test('the shop lists every rod and a purchase upgrades the equipped one', async () => {
  const ctx = await boot(7);
  ctx.doc.getElementById('shop-open').click();
  assert.equal(ctx.doc.getElementById('shop-panel').hidden, false);

  const buttons = [...ctx.doc.querySelectorAll('#shop-list .rod')];
  assert.equal(buttons.length, 4, 'the shop offers the four rods you do not own');

  // The shop no longer lists the equipped rod, so nothing here says "equipped".
  assert.equal(buttons.some((b) => b.textContent.includes('equipped')), false,
    'the shop is for buying only');

  // Cheapest first: the willow is affordable on the starting wallet, the titan is not.
  assert.equal(buttons[0].dataset.rod, 'willow');
  assert.equal(buttons[0].disabled, false, 'the willow is affordable to start with');
  assert.equal(buttons[buttons.length - 1].dataset.rod, 'titan');
  assert.equal(buttons[buttons.length - 1].disabled, true,
    'the top rod is unaffordable on the starting wallet');

  const coinsBefore = Number(text(ctx, 'coins'));
  const buyable = buttons.find((b) => !b.disabled && b.textContent.includes('buy'));
  buyable.click();

  assert.match(text(ctx, 'rod'), /Willow Rod|Carbon Float/, 'the rod changed');
  const coinsAfter = Number(text(ctx, 'coins'));
  assert.ok(coinsAfter < coinsBefore, 'the purchase was charged');
  assert.match(text(ctx, 'rod-stats'), /up to 8 kg/, 'the new weight ceiling is shown');

  ctx.doc.getElementById('shop-close').click();
  assert.equal(ctx.doc.getElementById('shop-panel').hidden, true);
});

test('progress and wallet survive a reload', async () => {
  const first = await boot(8);
  localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 4321, rodId: 'carbon', owned: ['bamboo', 'carbon'],
    bestiary: { glidefin: 1.87 },
  }));
  // Re-import a fresh instance against the same JSDOM storage.
  await import('../vendor/fru-angler/angler.js?run=8b');

  assert.equal(text(first, 'coins'), '4321');
  assert.equal(text(first, 'rod'), 'Carbon Float');
  assert.equal(text(first, 'bestiary'), '1/6 species landed');
});

test('a corrupt save falls back to a playable loadout', async () => {
  const ctx = await boot(9);
  localStorage.setItem('fru-angler-save', '{ not json');
  await import('../vendor/fru-angler/angler.js?run=9b');
  assert.equal(text(ctx, 'coins'), '240', 'falls back to the starting wallet');
  assert.match(text(ctx, 'rod'), /Bamboo Pole/);
});

test('an unknown saved rod id is ignored rather than breaking the HUD', async () => {
  const ctx = await boot(10);
  localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 50, rodId: 'hypercarbon', bestiary: null,
  }));
  await import('../vendor/fru-angler/angler.js?run=10b');
  assert.equal(text(ctx, 'rod'), 'Bamboo Pole', 'an unknown rod falls back to the cheapest');
  assert.equal(text(ctx, 'bestiary'), '0/6 species landed', 'a null bestiary is not trusted');
});


test('the scene draws the fishing line from the rod tip to the bobber', async () => {
  const ctx = await boot(11);
  const line = ctx.doc.getElementById('line');
  const start = line.getAttribute('d');

  key(ctx, 'keydown');
  run(ctx, 45);
  key(ctx, 'keyup');

  assert.notEqual(line.getAttribute('d'), start, 'the line follows the cast');

  // The line's end IS the bobber, in the same 0..100 percentage space as the
  // scene's viewBox. It used to be interpolated, which left the line short.
  const d = line.getAttribute('d');
  const end = d.trim().split(/\s+/).slice(-2).map(Number);
  const bobber = ctx.doc.getElementById('bobber');
  const left = parseFloat(bobber.style.left);
  const top = parseFloat(bobber.style.top);
  assert.ok(Math.abs(end[0] - left) < 0.5,
    `line ends at x=${end[0]} but the bobber is at ${left}%`);
  assert.ok(Math.abs(end[1] - top) < 0.5,
    `line ends at y=${end[1]} but the bobber is at ${top}%`);

  // And it must start at the measured rod tip. jsdom reports zero-sized rects, so
  // this asserts the fallback is used rather than NaN creeping into the path.
  const lineStart = d.match(/^M([\d.]+) ([\d.]+)/);
  assert.ok(lineStart, `the line must start with M x y, got "${d}"`);
  assert.ok(Number.isFinite(Number(lineStart[1])) && Number.isFinite(Number(lineStart[2])),
    `the line start must be numbers, got "${d}"`);
});

test('the lake reports its phase so the bobber can restyle itself', async () => {
  const ctx = await boot(12);
  const lake = ctx.doc.getElementById('lake');
  assert.equal(lake.dataset.phase, 'idle');
  key(ctx, 'keydown');
  run(ctx, 3);
  assert.equal(lake.dataset.phase, 'casting');
  key(ctx, 'keyup');
  assert.equal(lake.dataset.phase, 'waiting');
});

test('a landed fish shows rarity as filled blocks, not colour', async () => {
  const ctx = await boot(13, 0.1);   // pinned to a Glidefin: one rarity block filled
  assert.equal(castAndWaitForBite(ctx), true);
  for (let i = 0; i < 60 * 60; i += 1) {
    const ui = reelUi(ctx);
    if (ui.playerLeft + ui.playerWidth / 2 < ui.fish) key(ctx, 'keydown');
    else key(ctx, 'keyup');
    step(ctx);
    if (!ctx.doc.getElementById('catch').hidden) break;
  }
  const pips = ctx.doc.querySelectorAll('#catch-rarity .catch__pip');
  assert.equal(pips.length, 5, 'five rarity blocks, one per tier');
  const filled = [...pips].filter((p) => p.classList.contains('is-on'));
  assert.ok(filled.length >= 1 && filled.length <= 5);
  assert.match(ctx.doc.getElementById('catch-rarity').getAttribute('aria-label'), /Rarity \d of 5/);
});


/* ------------------------------------------------------------ inventory */

const shopRow = (ctx, rodId) =>
  ctx.doc.querySelector(`#shop-list .rod[data-rod="${rodId}"]`);

const rodAppearance = (ctx) => ({
  shaft: ctx.doc.getElementById('rod-shaft').getAttribute('stroke'),
  width: ctx.doc.getElementById('rod-shaft').getAttribute('stroke-width'),
  d: ctx.doc.getElementById('rod-shaft').getAttribute('d'),
  tip: ctx.doc.getElementById('rod-tip').getAttribute('cx'),
});

test('the shop is for buying, and points at the inventory for owned rods', async () => {
  const ctx = await boot(14);
  ctx.doc.getElementById('shop-open').click();
  const headings = [...ctx.doc.querySelectorAll('#shop-list .shop__section')]
    .map((h) => h.textContent);
  assert.match(headings[0], /For sale \(4\)/, `headings were ${JSON.stringify(headings)}`);
  assert.equal(shopRow(ctx, 'bamboo'), null, 'the rod you own is not sold to you again');
  assert.ok(shopRow(ctx, 'willow'), 'rods you do not own are listed');
});

test('a rod you own can be re-equipped for free', async () => {
  const ctx = await boot(15, 0.1);
  ctx.doc.getElementById('shop-open').click();
  // Buy the willow with the starting wallet (it starts with exactly its price).
  shopRow(ctx, 'willow').click();

  assert.match(text(ctx, 'rod'), /Willow Rod/, 'buying equips it');
  const coinsAfterBuy = Number(text(ctx, 'coins'));

  // Now go back to the bamboo pole, from the inventory: no cost, no re-buy.
  ctx.doc.getElementById('inventory-open').click();
  bagRow(ctx, 'bamboo').click();
  assert.equal(text(ctx, 'rod'), 'Bamboo Pole');
  assert.equal(Number(text(ctx, 'coins')), coinsAfterBuy, 're-equipping must be free');
  assert.ok(bagRow(ctx, 'willow'), 'the willow is still owned after re-equipping');
});

test('the visible rod changes when you equip a different one', async () => {
  const ctx = await boot(16);
  const before = rodAppearance(ctx);
  assert.match(text(ctx, 'rod'), /Bamboo Pole/);

  ctx.doc.getElementById('shop-open').click();
  shopRow(ctx, 'willow').click();

  const after = rodAppearance(ctx);
  assert.match(text(ctx, 'rod'), /Willow Rod/);
  assert.notEqual(after.shaft, before.shaft, 'the rod colour must change');
  assert.notEqual(after.d, before.d, 'the rod shape/length must change');
  assert.ok(Number(after.width) > Number(before.width), 'and the better rod is thicker');
  assert.notEqual(after.tip, before.tip, 'the lure moves to the new tip');
});

test('the rod in the scene matches the equipped rod after a reload', async () => {
  const ctx = await boot(17);
  localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 5000, rodId: 'oak', owned: ['bamboo', 'willow', 'oak'], bestiary: {},
  }));
  await import('../vendor/fru-angler/angler.js?run=17b');

  assert.match(text(ctx, 'rod'), /Oak Lance/);
  const art = rodAppearance(ctx);
  assert.equal(art.shaft, '#7d4f2e', 'the oak rod colour must be drawn after reload');
  assert.equal(art.width, '2.4');
});

test('a save with a rod you do not own falls back rather than equipping it', async () => {
  const ctx = await boot(18);
  localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 10, rodId: 'titan', owned: ['bamboo'], bestiary: {},
  }));
  await import('../vendor/fru-angler/angler.js?run=18b');

  assert.match(text(ctx, 'rod'), /Bamboo Pole/,
    'the HUD must not claim a rod the save does not own');
});

test('a save with no inventory at all still loads', async () => {
  const ctx = await boot(19);
  localStorage.setItem('fru-angler-save', JSON.stringify({ coins: 99, bestiary: {} }));
  await import('../vendor/fru-angler/angler.js?run=19b');
  assert.match(text(ctx, 'rod'), /Bamboo Pole/);
  ctx.doc.getElementById('inventory-open').click();
  assert.equal(ctx.doc.querySelectorAll('#inventory-rods .rod').length, 1,
    'an old save gets the starting rod only');
});


/* --------------------------------------------------------- inventory UI */

/**
 * The rods and fish you own lived inside the shop panel, so there was no inventory
 * button at all — nothing to click to see what you had. There is now a real one in
 * the top bar, and the shop is for buying.
 */

const bag = (ctx) => ctx.doc.getElementById('inventory-panel');
const bagRow = (ctx, rodId) =>
  ctx.doc.querySelector(`#inventory-rods .rod[data-rod="${rodId}"]`);

test('there is an inventory button in the top bar, separate from the shop', async () => {
  const ctx = await boot(20);
  const invBtn = ctx.doc.getElementById('inventory-open');
  assert.ok(invBtn, 'the inventory button must exist');
  assert.match(invBtn.textContent, /inventory/i, 'and it must say so');
  assert.ok(ctx.doc.getElementById('shop-open'), 'the shop button should still exist');
  assert.notEqual(invBtn.id, ctx.doc.getElementById('shop-open').id,
    'inventory must not be the shop button wearing a different label');
});

test('the inventory button shows how many rods you carry', async () => {
  const ctx = await boot(21);
  assert.match(ctx.doc.getElementById('inventory-count').textContent, /1 rod/,
    'one rod at the start, singular');

  ctx.doc.getElementById('shop-open').click();
  [...ctx.doc.querySelectorAll('#shop-list .rod')].find((b) => !b.disabled).click();
  assert.match(ctx.doc.getElementById('inventory-count').textContent, /2 rods/,
    'and plural once you buy another');
});

test('opening the inventory shows the rods you own and can equip them', async () => {
  const ctx = await boot(22);
  ctx.doc.getElementById('inventory-open').click();
  assert.equal(bag(ctx).hidden, false, 'the panel opens');

  assert.match(ctx.doc.querySelector('#inventory-rods').previousElementSibling.textContent,
    /your rods/i);
  assert.ok(bagRow(ctx, 'bamboo'), 'your starting rod is listed');
  assert.equal(bagRow(ctx, 'bamboo').dataset.state, 'equipped');
  assert.equal(bagRow(ctx, 'willow'), null, 'rods you do not own are not listed');
});

test('equipping from the inventory works and is free', async () => {
  const ctx = await boot(23);
  ctx.doc.getElementById('shop-open').click();
  [...ctx.doc.querySelectorAll('#shop-list .rod')].find((b) => !b.disabled).click();
  const coins = Number(text(ctx, 'coins'));

  ctx.doc.getElementById('inventory-open').click();
  bagRow(ctx, 'bamboo').click();

  assert.match(text(ctx, 'rod'), /Bamboo Pole/, 'the rod changed');
  assert.equal(Number(text(ctx, 'coins')), coins, 'and it cost nothing');
  assert.equal(bagRow(ctx, 'bamboo').dataset.state, 'equipped');
});

test('the inventory lists every fish, showing the heaviest landed', async () => {
  const ctx = await boot(24);
  ctx.doc.getElementById('inventory-open').click();
  const rows = ctx.doc.querySelectorAll('#inventory-fish .species');
  assert.equal(rows.length, 6, 'all six species are listed even before you catch them');
  assert.equal([...rows].filter((r) => r.dataset.caught === 'true').length, 0,
    'nothing caught yet');

  // Land a fish, then reopen.
  assert.equal(castAndWaitForBite(ctx), true);
  for (let i = 0; i < 60 * 60; i += 1) {
    const ui = reelUi(ctx);
    if (ui.playerLeft + ui.playerWidth / 2 < ui.fish) key(ctx, 'keydown');
    else key(ctx, 'keyup');
    step(ctx);
    if (!ctx.doc.getElementById('catch').hidden) break;
  }
  ctx.doc.getElementById('inventory-open').click();
  const caught = [...ctx.doc.querySelectorAll('#inventory-fish .species')]
    .filter((r) => r.dataset.caught === 'true');
  assert.equal(caught.length, 1, 'exactly the fish just landed');
  assert.match(caught[0].textContent, /kg/, 'and its weight is shown');
  assert.match(caught[0].textContent, /Glidefin/, 'the right species');
});

test('closing the inventory returns focus to its button', async () => {
  const ctx = await boot(25);
  ctx.doc.getElementById('inventory-open').click();
  assert.equal(bag(ctx).hidden, false);
  ctx.doc.getElementById('inventory-close').click();
  assert.equal(bag(ctx).hidden, true);
  assert.equal(ctx.doc.activeElement.id, 'inventory-open');
});

test('only one panel is open at a time', async () => {
  const ctx = await boot(26);
  ctx.doc.getElementById('shop-open').click();
  assert.equal(ctx.doc.getElementById('shop-panel').hidden, false);
  ctx.doc.getElementById('inventory-open').click();
  assert.equal(bag(ctx).hidden, false, 'the inventory opened');
  assert.equal(ctx.doc.getElementById('shop-panel').hidden, true,
    'and the shop closed, rather than stacking two overlays');
});

test('an empty inventory panel still lists all six fish', async () => {
  const ctx = await boot(27);
  ctx.doc.getElementById('inventory-open').click();
  assert.equal(ctx.doc.querySelectorAll('#inventory-fish .species').length, 6);
  assert.match(ctx.doc.getElementById('inventory-rods').textContent, /Bamboo/);
});


/* ------------------------------------------------------- the catch visual */

/** Land a fish (the pinned Glidefin) and return the context. */
async function landOne(ctx, run = 40) {
  assert.equal(castAndWaitForBite(ctx), true, 'hooked');
  for (let i = 0; i < 60 * 60; i += 1) {
    const ui = reelUi(ctx);
    if (ui.playerLeft + ui.playerWidth / 2 < ui.fish) key(ctx, 'keydown');
    else key(ctx, 'keyup');
    step(ctx);
    if (!ctx.doc.getElementById('catch').hidden) break;
  }
  return ctx;
}

test('a landed fish pops up with a drawing, its name, weight and worth', async () => {
  const ctx = await landOne(await boot(28, 0.1));   // pinned to a Glidefin

  // A real SVG, in the card.
  const art = ctx.doc.getElementById('catch-art');
  const svg = art.querySelector('svg');
  assert.ok(svg, 'the fish must be drawn, not just named');
  assert.match(svg.getAttribute('viewBox'), /0 0 120 80/);
  assert.ok(art.querySelector('.body'), 'the drawing needs a body');
  assert.ok(art.querySelector('.tail'), 'and a tail');
  assert.ok(art.querySelector('.eye'), 'and an eye');
  assert.match(svg.getAttribute('aria-label'), /Glidefin/,
    'the drawing must be labelled for screen readers');

  // The three things the player wants to read.
  assert.match(text(ctx, 'catch-name'), /Glidefin/);
  assert.match(text(ctx, 'catch-weight'), /^[\d.]+ kg$/, 'weight with its unit');
  assert.match(text(ctx, 'catch-worth'), /^¤ \d+$/, 'worth in coins');
  assert.match(text(ctx, 'catch-value'), /^¤ \d+$/, 'the total stays too');
});

test('the weight and worth agree with each other', async () => {
  const ctx = await landOne(await boot(29, 0.1));
  const kg = parseFloat(text(ctx, 'catch-weight'));
  const worth = Number(text(ctx, 'catch-worth').replace('¤', ''));
  assert.ok(kg > 0, 'the weight must be a real number');
  assert.ok(worth > 0, 'the worth must be a real number');
  assert.equal(worth, Number(text(ctx, 'catch-value').replace('¤', '')),
    'the labelled worth and the total must not disagree');
});

test('the pop-up announces itself to assistive tech', async () => {
  const ctx = await landOne(await boot(30, 0.1));
  const card = ctx.doc.querySelector('.catch__card');
  assert.equal(card.getAttribute('role'), 'dialog');
  assert.equal(card.getAttribute('aria-modal'), 'true');
  assert.equal(card.getAttribute('aria-labelledby'), 'catch-name');
});

test('a snapped line shows no fish and does not leave a stale drawing', async () => {
  const ctx = await boot(31, 0.1);
  assert.equal(castAndWaitForBite(ctx), true);
  run(ctx, 60 * 60);   // ignore the fish; the line snaps

  assert.equal(text(ctx, 'catch-name'), 'Line snapped');
  assert.equal(ctx.doc.getElementById('catch-art').innerHTML, '',
    'there is no fish to draw, so the art must be cleared');
  assert.equal(text(ctx, 'catch-weight'), '—');
  assert.equal(text(ctx, 'catch-worth'), '—');
});

test('catching a second fish replaces the drawing, it does not stack', async () => {
  const ctx = await landOne(await boot(32, 0.1));
  const first = ctx.doc.getElementById('catch-art').innerHTML;

  ctx.doc.getElementById('catch-again').click();
  await landOne(ctx);

  const after = ctx.doc.getElementById('catch-art');
  assert.equal(after.querySelectorAll('svg').length, 1, 'exactly one fish, not two');
  assert.equal(after.innerHTML, first, 'the same pinned fish draws identically');
});

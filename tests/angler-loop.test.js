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
  assert.doesNotMatch(name, /LINE SNAPPED/, 'a tracked fish is not snapped: ' + name);
  assert.match(meta, /(COMMON|UNCOMMON|RARE|LEGENDARY|MYTHICAL) · [0-9.]+ KG/,
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
  assert.equal(text(ctx, 'catch-name'), 'LINE SNAPPED');
  assert.match(text(ctx, 'catch-meta'), /GOT AWAY|LINE SNAPPED/);
  assert.equal(text(ctx, 'catch-value'), '¤ 0');
});

test('casting again returns to the idle prompt', async () => {
  const ctx = await boot(6);
  assert.equal(castAndWaitForBite(ctx), true);
  run(ctx, 60 * 60);   // let it resolve one way or the other

  ctx.doc.getElementById('catch-again').click();
  assert.equal(ctx.doc.getElementById('catch').hidden, true);
  assert.equal(ctx.doc.getElementById('reel').hidden, true);
  assert.match(text(ctx, 'message'), /HOLD SPACE/);
});

test('the shop lists every rod and a purchase upgrades the equipped one', async () => {
  const ctx = await boot(7);
  ctx.doc.getElementById('shop-open').click();
  assert.equal(ctx.doc.getElementById('shop-panel').hidden, false);

  const buttons = ctx.doc.querySelectorAll('#shop-list .rod');
  assert.equal(buttons.length, 5, 'all five rods are offered');
  assert.equal(buttons[0].disabled, true, 'the equipped rod cannot be bought again');
  assert.equal(buttons[0].textContent.includes('equipped'), true);
  assert.equal(buttons[4].disabled, true, 'the top rod is unaffordable on the starting wallet');

  const coinsBefore = Number(text(ctx, 'coins'));
  const buyable = [...buttons].find((b) => !b.disabled && b.textContent.includes('buy'));
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
    coins: 4321, rodId: 'carbon', bestiary: { glidefin: 1.87 },
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
  const d = line.getAttribute('d');
  const [, x, y] = d.match(/([\d.]+)\s+([\d.]+)$/).map(Number);
  const left = parseFloat(ctx.doc.getElementById('bobber').style.left);
  assert.ok(Math.abs(x - (56 + (left / 100) * 44)) < 0.5,
    `line end ${x} should match the bobber at ${left}%`);
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

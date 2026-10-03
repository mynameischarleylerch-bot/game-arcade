/**
 * Frutiger Angler: input, timing and rendering.
 *
 * Every rule lives in fishing.js (rods, casts, fish, economy) and reel.js (the
 * minigame maths). This file only turns their output into pixels, and is the
 * only part that touches the DOM.
 */
import {
  RODS, FISH, RARITY_ORDER, RARITY_COLOURS,
  castQuality, castDistance, biteDelayFor, rollFish, rollMutation,
  fishWeight, canCatch, catchValue, startingLoadout, buyRod, recordCatch,
  startingInventory, ownsRod, addRodToInventory, equipRod, rodArt, RODS_BY_PRICE,
  fishById, fishSvg,
 fishIndex,
 fishEntry,
} from './fishing.js?v=2026-10-01-p';
import {
  reelConfig, stepReel as advance, reelOutcomeFor, isCaught, lineSnapped,
} from './reel.js?v=2026-10-01-p';

/* ------------------------------------------------------------------ tuning */

const CAST_SPEED = 1.05;      // meter fractions per second while held
const SHAKE_INTERVAL_MS = 900;
const SHAKE_BONUS_MS = 420;   // bite delay removed per shake pressed
const SHAKE_MAX_ON_SCREEN = 3;
const REEL_DT = 1 / 60;
const SAVE_KEY = 'fru-angler-save';
/* How long the player has to set the hook after a bite. Generous, because this
 * is the first time they see the prompt, but finite: without a deadline the
 * "click to hook" rule is only a suggestion. */
const HOOK_WINDOW_MS = 2600;
const IDLE_HINT = 'Hold Space or press and hold, then release in the green band.';

/* --------------------------------------------------------------------- dom */

const el = (id) => document.getElementById(id);
const ui = {
  lake: el('lake'), bobber: el('bobber'), splash: el('splash'),
  cast: el('cast'), castFill: el('cast-fill'),
  bite: el('bite'), hookSet: el('hook-set'),
  reel: el('reel'), reelPlayer: el('reel-player'), reelFish: el('reel-fish'),
  reelFill: el('reel-fill'),
  catch: el('catch'), catchName: el('catch-name'), catchMeta: el('catch-meta'),
  catchValue: el('catch-value'), catchAgain: el('catch-again'),
  catchArt: el('catch-art'), catchWeight: el('catch-weight'), catchWorth: el('catch-worth'),
  shopPanel: el('shop-panel'), shopList: el('shop-list'), shopCoins: el('shop-coins'),
  shopOpen: el('shop-open'), shopClose: el('shop-close'),
  bag: el('inventory-panel'), bagRods: el('inventory-rods'), bagFish: el('inventory-fish'),
  bagEmpty: el('inventory-empty'), bagCount: el('inventory-count'),
  bagOpen: el('inventory-open'), bagClose: el('inventory-close'),
  indexPanel: el('index-panel'), indexList: el('index-list'),
  indexOpen: el('index-open'), indexClose: el('index-close'),
  coins: el('coins'), rod: el('rod'), rodStats: el('rod-stats'), bestiary: el('bestiary'),
  message: el('message'),
  line: el('line'),
  rodShaft: el('rod-shaft'), rodTipDot: el('rod-tip'),
  rarity: el('catch-rarity'),
};

/* ------------------------------------------------------------------- state */

const state = {
  phase: 'idle',        // idle | casting | waiting | reeling | result
  rodId: 'bamboo',
  owned: startingInventory(),   // everything bought so far; rodId is one of these
  coins: 0,
  meter: 0,
  holding: false,
  hooked: null,         // the fish on the line
  reel: null,
  shakeTimer: null,
  biteAt: 0,
  bestiary: {},         // fishId -> heaviest weight landed
  hookAt: 0,            // when the bite window closes
  bitten: null,         // the fish on the line, waiting to be hooked
};

const rod = () => RODS[state.rodId];

/* ------------------------------------------------------------------- save */

function load() {
  const fresh = startingLoadout();
  state.rodId = fresh.rodId;
  state.coins = fresh.coins;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Number.isFinite(saved.coins) && saved.coins >= 0) state.coins = saved.coins;
    // Repair the inventory before trusting the equipped rod: a save from before
    // this feature has no 'owned' list at all.
    state.owned = startingInventory();
    if (Array.isArray(saved.owned)) {
      for (const id of saved.owned) state.owned = addRodToInventory(state.owned, id);
    }
    // Only equip something actually owned, otherwise the HUD would lie.
    if (RODS[saved.rodId] && ownsRod(state.owned, saved.rodId)) state.rodId = saved.rodId;
    else if (!ownsRod(state.owned, state.rodId)) state.rodId = state.owned[0];
    if (saved.bestiary && typeof saved.bestiary === 'object') state.bestiary = saved.bestiary;
  } catch {
    // Corrupt or blocked storage: the fresh loadout above already stands.
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, rodId: state.rodId, owned: state.owned, bestiary: state.bestiary,
    }));
  } catch {
    // Storage blocked: the session still plays, it just will not persist.
  }
}

/* ------------------------------------------------------------------ chrome */

/** Draw the equipped rod. This is what makes buying a rod visible. */
function paintRod() {
  const art = rodArt(state.rodId);
  ui.rodShaft?.setAttribute('d', art.path);
  ui.rodShaft?.setAttribute('stroke', art.colour);
  ui.rodShaft?.setAttribute('stroke-width', String(art.width));
  ui.rodTipDot?.setAttribute('cx', String(art.tipX));
  ui.rodTipDot?.setAttribute('cy', String(art.tipY));
  ui.rodTipDot?.setAttribute('fill', art.colour);
  ui.rodTipDot?.setAttribute('r', String(1 + art.width / 3));
  // The line starts at the rod's new tip, so move it there immediately.
  placeBobber(parseFloat(ui.bobber.style.left) || 60, parseFloat(ui.bobber.style.top) || 70);
}

function paintChrome() {
  const current = rod();
  ui.coins.textContent = state.coins;
  ui.rod.textContent = current.name;
  ui.rodStats.textContent =
    `control ${current.control.toFixed(2)} · resilience ${current.resilience.toFixed(2)} · ` +
    `luck ${current.luck.toFixed(1)} · up to ${current.maxKg} kg`;
  const found = Object.keys(state.bestiary).length;
  ui.bestiary.textContent = `${found}/${FISH.length} species landed`;

  // The button says how many rods you carry, so the inventory is findable at a glance.
  if (ui.bagCount) {
    const rods = state.owned.length;
    ui.bagCount.textContent = `${rods} ${rods === 1 ? 'rod' : 'rods'}`;
  }
  paintRod();
}

function setPhase(phase) {
  state.phase = phase;
  ui.lake.dataset.phase = phase;
  ui.cast.hidden = phase !== 'casting';
  ui.reel.hidden = phase !== 'reeling';
  ui.catch.hidden = phase !== 'result';
  if (ui.bite) ui.bite.hidden = phase !== 'bite';
  if (phase !== 'waiting') clearShake();
}

function say(text) {
  ui.message.hidden = !text;
  ui.message.textContent = text || '';
}

/* ------------------------------------------------------------------- shake */

/** Throw a SHAKE prompt at a random spot. Missing one only costs time. */
function throwShake() {
  if (ui.lake.querySelectorAll('.shake').length >= SHAKE_MAX_ON_SCREEN) return;
  const button = document.createElement('button');
  button.className = 'shake';
  button.type = 'button';
  button.textContent = 'SHAKE';
  const w = ui.lake.clientWidth || 320;
  const h = ui.lake.clientHeight || 240;
  button.style.left = `${40 + Math.random() * Math.max(1, w - 150)}px`;
  button.style.top = `${40 + Math.random() * Math.max(1, h - 170)}px`;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    state.biteAt -= SHAKE_BONUS_MS;
    button.remove();
  });
  button.addEventListener('mousedown', (event) => event.stopPropagation());
  ui.lake.appendChild(button);
}

function clearShake() {
  clearInterval(state.shakeTimer);
  state.shakeTimer = null;
  for (const node of ui.lake.querySelectorAll('.shake')) node.remove();
}

/**
 * Where the rod tip actually renders, as a percentage of the lake.
 *
 * This has to be measured, not read from the lure's cx/cy: those are pre-transform
 * viewBox units, and the scene uses preserveAspectRatio="none" plus a counter-scale
 * on the figure group. Reading the attributes gave a point that was nowhere near
 * where the rod actually ended, so the line started in mid-air.
 */
function rodTip() {
  const lure = ui.lake.querySelector('.scene__lure');
  if (!lure || !ui.lake.getBoundingClientRect) return { x: 60, y: 33 };

  const lake = ui.lake.getBoundingClientRect();
  const dot = lure.getBoundingClientRect();
  if (!lake.width || !lake.height || !dot.width) return { x: 60, y: 33 };

  return {
    x: ((dot.left + dot.width / 2 - lake.left) / lake.width) * 100,
    y: ((dot.top + dot.height / 2 - lake.top) / lake.height) * 100,
  };
}

/**
 * The scene stretches to fill the lake, so a square viewBox on a wide box turns the
 * round blob into an oval. Undo that for the figure group only: scale x by the
 * ratio of the lake's height to its width, about the blob's own centre.
 */
function fitFigure() {
  const group = document.getElementById('angler-fit');
  const box = ui.lake.getBoundingClientRect();
  if (!group || !box.width || !box.height) return;

  // viewBox units are already stretched by width:height; correcting x by
  // height/width makes one unit the same number of pixels on both axes.
  const scale = box.height / box.width;
  group.setAttribute('transform', `translate(33.2 0) scale(${scale.toFixed(4)} 1) translate(-33.2 0)`);
}

/** Move the bobber, its splash and the fishing line together. */
function placeBobber(left, top) {
  ui.bobber.style.left = `${left}%`;
  ui.bobber.style.top = `${top}%`;
  ui.splash.style.left = `${left}%`;
  ui.splash.style.top = `${top}%`;
  // The line runs from the measured rod tip to the bobber. Both ends are
  // percentages of the lake, which is exactly what the scene's 0..100 viewBox
  // maps to, so the bobber end is simply (left, top) — it must NOT be
  // interpolated, which put the line's end short of the bobber.
  const tip = rodTip();
  const x = left;
  const y = top;
  ui.line?.setAttribute('d',
    `M${tip.x.toFixed(2)} ${tip.y.toFixed(2)} `
    + `Q${((tip.x + x) / 2).toFixed(2)} ${((tip.y + y) / 2 + 6).toFixed(2)} `
    + `${x.toFixed(2)} ${y.toFixed(2)}`);
}

/* -------------------------------------------------------------------- cast */

function beginCast() {
  state.meter = 0;
  state.holding = true;
  say('');
  setPhase('casting');
}

function releaseCast() {
  const quality = castQuality(state.meter);
  const reach = castDistance(quality);
  ui.lake.style.setProperty('--cast-ms', `${Math.round(320 + reach * 420)}ms`);
  // A longer cast lands further right, in open water rather than on the pier.
  placeBobber(46 + reach * 42, 70 + reach * 16);
  ui.splash.classList.add('is-on');

  state.biteAt = performance.now() + biteDelayFor(rod());
  setPhase('waiting');
  state.shakeTimer = setInterval(throwShake, SHAKE_INTERVAL_MS);
}

/**
 * Something took the bait. Wait for the player to click SET HOOK before the reel
 * minigame starts — the fight used to begin on its own, with the player already
 * holding, which meant the hook was never really theirs to set.
 */
function hookSet(fish) {
  clearShake();
  state.bitten = fish;
  state.hookAt = performance.now() + HOOK_WINDOW_MS;
  setPhase('bite');
  say('Click SET HOOK');
  if (ui.bite) ui.bite.hidden = false;
}

function hook(fish) {
  clearShake();
  if (ui.bite) ui.bite.hidden = true;
  state.bitten = null;
  state.hooked = fish;
  const cfg = reelConfig({
    fight: fish.fight,
    control: rod().control,
    resilience: rod().resilience,
  });
  // dir is the fish's heading: +/-1. It must persist across frames or the
  // fish would re-roll its direction every time and never travel anywhere.
  state.reel = { cfg, fishX: 0.5, playerX: 0.5, progress: 0.34, dir: Math.random() < 0.5 ? -1 : 1 };
  setPhase('reeling');
  say('');
}

/* ------------------------------------------------------------------- reel */

function stepReel() {
  const r = state.reel;
  const next = advance(r.cfg, {
    fishX: r.fishX,
    playerX: r.playerX,
    progress: r.progress,
    holding: state.holding,
    dir: r.dir,
  }, REEL_DT);

  r.fishX = next.fishX;
  r.playerX = next.playerX;
  r.progress = next.progress;
  r.dir = next.dir;      // carry the heading forward

  ui.reelPlayer.style.width = `${r.cfg.playerWidth * 100}%`;
  ui.reelPlayer.style.left = `${r.playerX * 100 - (r.cfg.playerWidth / 2) * 100}%`;
  ui.reelFish.style.left = `${r.fishX * 100}%`;
  ui.reelFill.style.width = `${r.progress * 100}%`;

  const outcome = reelOutcomeFor(r.progress);
  if (outcome === isCaught) landFish();
  else if (outcome === lineSnapped) loseFish(`${state.hooked.name} got away.`);
}

/** Rarity as a row of blocks: one per tier, filled up to this fish's. */
function paintRarity(rarity) {
  if (!ui.rarity) return;
  const level = RARITY_ORDER.indexOf(rarity) + 1;
  ui.rarity.textContent = '';
  for (let i = 0; i < RARITY_ORDER.length; i += 1) {
    const pip = document.createElement('span');
    pip.className = i < level ? 'catch__pip is-on' : 'catch__pip';
    ui.rarity.appendChild(pip);
  }
  ui.rarity.setAttribute('aria-label', `Rarity ${level} of ${RARITY_ORDER.length}: ${rarity}`);
}

function showResult(name, meta, value, rarity, art = null, stats = null) {
  ui.catchName.textContent = name;
  // Colour carries the rarity at a glance; the pips below give the exact tier.
  ui.catchName.style.color = rarity ? RARITY_COLOURS[rarity] : '#e07b2a';
  paintRarity(rarity);
  ui.catchMeta.textContent = meta;
  ui.catchValue.textContent = `¤ ${value}`;

  // The drawing and the two headline numbers, shown only when there is a fish.
  // A snapped line has no fish, so the art is cleared rather than left stale.
  if (ui.catchArt) ui.catchArt.innerHTML = art ?? '';
  if (ui.catchWeight) ui.catchWeight.textContent = stats?.weight ?? '—';
  if (ui.catchWorth) ui.catchWorth.textContent = art ? `¤ ${value}` : '—';

  setPhase('result');
  ui.catchAgain.focus();
}

function landFish() {
  const fish = state.hooked;
  const kg = fishWeight(fish);
  const current = rod();

  // The weight ceiling is the rod's real limit: land nothing heavier, or it snaps.
  if (!canCatch(fish, kg, current)) {
    return loseFish(
      `${fish.name} weighed ${kg} kg — over this rod's ${current.maxKg} kg limit.`
    );
  }

  const mutation = rollMutation();
  const value = catchValue(fish, kg, mutation.multiplier);
  const wasBest = state.bestiary[fish.id] ?? 0;
  state.coins += value;
  state.bestiary = recordCatch(state.bestiary, fish, kg);

  const meta = [
    fish.rarity,
    `${kg} kg`,
    mutation.name ? `${mutation.name} ×${mutation.multiplier}` : null,
    kg > wasBest ? 'new personal best!' : null,
  ].filter(Boolean).join(' · ');

  showResult(
    mutation.name ? `${mutation.name} ${fish.name}` : fish.name,
    meta, value, fish.rarity,
    fishSvg(fish), { weight: `${kg} kg` },
  );
  save();
  paintChrome();
}

function loseFish(reason) {
  showResult('Line snapped', reason, 0, null);
}

/* -------------------------------------------------------------------- shop */

/**
 * One row per rod, used by both panels. In the shop it can also buy; in the
 * inventory it only equips, because you already own it.
 */
function makeRodRow(id, { owned, onDone }) {
  const spec = RODS[id];
  const equipped = id === state.rodId;
  const art = rodArt(id);
  const affordable = state.coins >= spec.price;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `rod${equipped ? ' rod--equipped' : ''}`;
  button.dataset.rod = id;
  button.dataset.state = equipped ? 'equipped' : owned ? 'owned' : 'unowned';
  button.disabled = equipped || (!owned && !affordable);

  const tag = equipped ? 'equipped' : owned ? 'equip' : affordable ? 'buy' : 'not enough coins';
  button.innerHTML =
    `<span class="rod__row"><span>${spec.name}</span>`
    + `<span>${owned ? '<i class="rod__swatch" style="background:' + art.colour + '"></i>' : '¤' + spec.price}</span></span>`
    + `<span class="rod__stats">control ${spec.control.toFixed(2)} · resilience ${spec.resilience.toFixed(2)} · `
    + `luck ${spec.luck.toFixed(1)} · max ${spec.maxKg} kg</span>`
    + `<span class="rod__blurb">${spec.blurb}</span>`
    + `<span class="rod__state">${tag}</span>`;

  button.addEventListener('click', () => {
    if (owned) {
      const result = equipRod(state.owned, id);
      if (!result.ok) return;
      state.rodId = result.rodId;
    } else {
      const result = buyRod(state, id);
      if (!result.ok) {
        button.querySelector('.rod__state').textContent = result.reason;
        return;
      }
      state.coins = result.coins;
      state.owned = addRodToInventory(state.owned, id);
      state.rodId = id;
    }
    save();
    paintChrome();
    onDone();
  });

  return button;
}

/** A heading above a group of rows. */
function makeHeading(text) {
  const h = document.createElement('h3');
  h.className = 'shop__section';
  h.textContent = text;
  return h;
}

/**
 * The inventory: the rods you own (re-equip free) and every species, showing the
 * heaviest landed. Caught and uncaught fish are both listed so the bestiary reads
 * as a collection to work towards.
 */
function renderInventory() {
  ui.bagRods.textContent = '';
  for (const id of RODS_BY_PRICE) {
    if (ownsRod(state.owned, id)) {
      ui.bagRods.appendChild(makeRodRow(id, { owned: true, onDone: renderInventory }));
    }
  }

  ui.bagFish.textContent = '';
  let landed = 0;
  for (const fish of FISH) {
    const best = state.bestiary[fish.id];
    const got = typeof best === 'number' && best > 0;
    if (got) landed += 1;

    const row = document.createElement('div');
    row.className = 'species';
    row.dataset.caught = String(got);
    row.dataset.fish = fish.id;

    const name = document.createElement('span');
    name.className = 'species__name';
    name.textContent = fish.name;
    name.style.color = RARITY_COLOURS[fish.rarity] ?? '';

    const weight = document.createElement('span');
    if (got) {
      weight.className = 'species__weight';
      weight.textContent = `best ${best} kg`;
    } else {
      weight.className = 'species__none';
      weight.textContent = 'not caught';
    }

    row.append(name, weight);
    ui.bagFish.appendChild(row);
  }

  if (ui.bagEmpty) ui.bagEmpty.hidden = landed > 0;
}

/** The shop is for buying; what you own lives in the inventory. */
/* ------------------------------------------------------------- fish index */

/** Every weight in the table, so per-fish odds can be a share of all casts. */
const TOTAL_WEIGHT = FISH.reduce((sum, f) => sum + f.weight, 0);

/**
 * The fish index: every species grouped by rarity, with the odds for each.
 *
 * Built from fishIndex() so the percentages are derived from the same weights
 * rollFish() uses, and cannot drift out of step with the real odds. Species the
 * player has not landed are dimmed, so the index doubles as a list of targets.
 */
function renderIndex() {
  ui.indexList.textContent = '';

  for (const group of fishIndex()) {
    const tier = document.createElement('div');
    tier.className = 'index__tier';

    const head = document.createElement('div');
    head.className = 'index__head';

    const swatch = document.createElement('span');
    swatch.className = 'index__swatch';
    swatch.style.background = group.colour;

    const name = document.createElement('span');
    name.className = 'index__name';
    name.textContent = group.rarity;

    const chance = document.createElement('span');
    chance.className = 'index__chance';
    chance.textContent = `${formatChance(group.chance)} of casts`;

    head.append(swatch, name, chance);
    tier.appendChild(head);

    for (const raw of group.fish) {
      const fish = fishEntry(raw);
      const row = document.createElement('div');
      row.className = 'index__fish';
      if (!state.bestiary[fish.id]) row.classList.add('index__fish--new');

      // The fish itself, drawn by hue and body shape, same as the catch card.
      const art = document.createElement('div');
      art.className = 'index__art';
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = fishSvg(fish);

      const label = document.createElement('div');
      label.className = 'index__label';
      const fishName = document.createElement('span');
      fishName.className = 'index__fishName';
      fishName.textContent = fish.name;
      const detail = document.createElement('span');
      detail.className = 'index__detail';
      detail.textContent = `${fish.minKg}–${fish.maxKg} kg · ¤${fish.pricePerKg}/kg`;
      label.append(fishName, detail);

      // A share of every cast, not of the tier, so a one-fish tier does not read
      // as 100%.
      const odds = document.createElement('span');
      odds.className = 'index__odds';
      odds.textContent = formatChance((fish.weight / TOTAL_WEIGHT) * 100);

      row.append(art, label, odds);
      tier.appendChild(row);
    }

    ui.indexList.appendChild(tier);
  }
}

/** Odds read better rounded: "1 in 90" beats "1.1%". */
function formatChance(percent) {
  if (percent >= 10) return `${Math.round(percent)}%`;
  const oneIn = Math.round(1 / (percent / 100));
  if (oneIn >= 100) return `1 in ${oneIn}`;
  return `${percent.toFixed(1)}%`;
}

function openIndex() {
  renderIndex();
  ui.indexPanel.hidden = false;
}

function closeIndex() {
  ui.indexPanel.hidden = true;
}

function renderShop() {
  ui.shopCoins.textContent = state.coins;
  ui.shopList.textContent = '';

  const forSale = RODS_BY_PRICE.filter((id) => !ownsRod(state.owned, id));
  ui.shopList.appendChild(makeHeading(`For sale (${forSale.length})`));

  if (forSale.length === 0) {
    const done = document.createElement('p');
    done.className = 'shop__owned-all';
    done.textContent = 'You own every rod. Open your inventory to pick one.';
    ui.shopList.appendChild(done);
    return;
  }

  for (const id of forSale) {
    ui.shopList.appendChild(makeRodRow(id, { owned: false, onDone: renderShop }));
  }
}

/** One overlay at a time: opening either panel closes the other. */
function openShop() {
  ui.bag.hidden = true;
  renderShop();
  ui.shopPanel.hidden = false;
  ui.shopClose.focus();
}

function closeShop() {
  ui.shopPanel.hidden = true;
  ui.shopOpen.focus();
}

function openBag() {
  ui.shopPanel.hidden = true;
  renderInventory();
  ui.bag.hidden = false;
  ui.bagClose.focus();
}

function closeBag() {
  ui.bag.hidden = true;
  ui.bagOpen.focus();
}

/* ------------------------------------------------------------------- input */

function press(event) {
  if (event.type === 'mousedown' || event.type === 'touchstart') event.preventDefault();
  // Pressing while idle is what starts a cast. 'result' is deliberately ignored:
  // a snapped line has to be dismissed with the button, not by flailing at the lake.
  if (state.phase === 'idle') {
    beginCast();
    return;
  }
  if (state.phase === 'casting' || state.phase === 'reeling') state.holding = true;
}

function release() {
  const wasCasting = state.phase === 'casting';
  state.holding = false;
  if (wasCasting) releaseCast();
}

addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (!ui.shopPanel.hidden) return;   // Space must not fight the shop's buttons
  event.preventDefault();
  press(event);
});
addEventListener('keyup', (event) => {
  if (event.code === 'Space') release();
});
ui.lake.addEventListener('mousedown', press);
addEventListener('mouseup', release);
ui.lake.addEventListener('touchstart', press, { passive: false });
addEventListener('touchend', release);
addEventListener('touchcancel', release);
// Losing focus mid-hold would otherwise strand the player mid-reel.
addEventListener('blur', release);

ui.hookSet?.addEventListener('click', () => {
  if (state.phase !== 'bite' || !state.bitten) return;
  hook(state.bitten);
});
ui.catchAgain.addEventListener('click', () => { setPhase('idle'); say(IDLE_HINT); });
ui.shopOpen.addEventListener('click', openShop);
ui.shopClose.addEventListener('click', closeShop);
ui.bagOpen?.addEventListener('click', openBag);
ui.indexOpen?.addEventListener('click', openIndex);
ui.indexClose?.addEventListener('click', closeIndex);
// Clicking the scrim outside the panel closes it, same as the others.
ui.indexPanel?.addEventListener('click', (event) => {
  if (event.target === ui.indexPanel) closeIndex();
});
ui.bagClose?.addEventListener('click', closeBag);
// Clicking the scrim outside the panel closes it, same as the shop.
ui.bag?.addEventListener('click', (event) => {
  if (event.target === ui.bag) closeBag();
});
ui.shopPanel.addEventListener('click', (event) => {
  if (event.target === ui.shopPanel) closeShop();
});

/* -------------------------------------------------------------------- loop */

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.phase === 'casting' && state.holding) {
    // The meter sweeps up then back down; releasing is the whole skill.
    state.meter += CAST_SPEED * dt;
    if (state.meter > 1) state.meter = 2 - state.meter;
    ui.castFill.style.width = `${state.meter * 100}%`;
  }

  if (state.phase === 'waiting' && now >= state.biteAt) {
    hookSet(rollFish(Math.random(), rod()));
  }

  // Miss the window and the fish is gone. Otherwise "click to hook" is optional.
  if (state.phase === 'bite' && now >= state.hookAt) {
    if (ui.bite) ui.bite.hidden = true;
    state.bitten = null;
    loseFish('Too slow — the fish threw the hook.');
  }

  if (state.phase === 'reeling') stepReel();

  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------------- boot */

load();
paintChrome();
fitFigure();
// The lake changes shape with the window, so the counter-scale must follow.
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(fitFigure).observe(ui.lake);
} else {
  addEventListener('resize', fitFigure);
}
setPhase('idle');
say(IDLE_HINT);
requestAnimationFrame(frame);

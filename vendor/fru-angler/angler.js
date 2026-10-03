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
} from './fishing.js?v=2026-10-01-g';
import {
  reelConfig, stepReel as advance, reelOutcomeFor, isCaught, lineSnapped,
} from './reel.js?v=2026-10-01-g';

/* ------------------------------------------------------------------ tuning */

const CAST_SPEED = 1.05;      // meter fractions per second while held
const SHAKE_INTERVAL_MS = 900;
const SHAKE_BONUS_MS = 420;   // bite delay removed per shake pressed
const SHAKE_MAX_ON_SCREEN = 3;
const REEL_DT = 1 / 60;
const SAVE_KEY = 'fru-angler-save';
const IDLE_HINT = 'Hold Space or press and hold, then release in the green band.';

/* --------------------------------------------------------------------- dom */

const el = (id) => document.getElementById(id);
const ui = {
  lake: el('lake'), bobber: el('bobber'), splash: el('splash'),
  cast: el('cast'), castFill: el('cast-fill'),
  reel: el('reel'), reelPlayer: el('reel-player'), reelFish: el('reel-fish'),
  reelFill: el('reel-fill'),
  catch: el('catch'), catchName: el('catch-name'), catchMeta: el('catch-meta'),
  catchValue: el('catch-value'), catchAgain: el('catch-again'),
  shopPanel: el('shop-panel'), shopList: el('shop-list'), shopCoins: el('shop-coins'),
  shopOpen: el('shop-open'), shopClose: el('shop-close'),
  coins: el('coins'), rod: el('rod'), rodStats: el('rod-stats'), bestiary: el('bestiary'),
  message: el('message'),
  line: el('line'),
  rarity: el('catch-rarity'),
};

/* ------------------------------------------------------------------- state */

const state = {
  phase: 'idle',        // idle | casting | waiting | reeling | result
  rodId: 'bamboo',
  coins: 0,
  meter: 0,
  holding: false,
  hooked: null,         // the fish on the line
  reel: null,
  shakeTimer: null,
  biteAt: 0,
  bestiary: {},         // fishId -> heaviest weight landed
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
    if (RODS[saved.rodId]) state.rodId = saved.rodId;
    if (saved.bestiary && typeof saved.bestiary === 'object') state.bestiary = saved.bestiary;
  } catch {
    // Corrupt or blocked storage: the fresh loadout above already stands.
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, rodId: state.rodId, bestiary: state.bestiary,
    }));
  } catch {
    // Storage blocked: the session still plays, it just will not persist.
  }
}

/* ------------------------------------------------------------------ chrome */

function paintChrome() {
  const current = rod();
  ui.coins.textContent = state.coins;
  ui.rod.textContent = current.name;
  ui.rodStats.textContent =
    `control ${current.control.toFixed(2)} · resilience ${current.resilience.toFixed(2)} · ` +
    `luck ${current.luck.toFixed(1)} · up to ${current.maxKg} kg`;
  const found = Object.keys(state.bestiary).length;
  ui.bestiary.textContent = `${found}/${FISH.length} species landed`;
}

function setPhase(phase) {
  state.phase = phase;
  ui.lake.dataset.phase = phase;
  ui.cast.hidden = phase !== 'casting';
  ui.reel.hidden = phase !== 'reeling';
  ui.catch.hidden = phase !== 'result';
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
 * Where the rod tip is, in the scene's percentage coordinates. Taken from the
 * lure's own position so the line always starts exactly where the rod ends.
 */
function rodTip() {
  const lure = ui.lake.querySelector('.scene__lure');
  const cx = parseFloat(lure?.getAttribute('cx') ?? 58);
  const cy = parseFloat(lure?.getAttribute('cy') ?? 31);
  return { x: cx + 1.4, y: cy + 2 };   // nudge onto the line itself
}

/** Move the bobber, its splash and the fishing line together. */
function placeBobber(left, top) {
  ui.bobber.style.left = `${left}%`;
  ui.bobber.style.top = `${top}%`;
  ui.splash.style.left = `${left}%`;
  ui.splash.style.top = `${top}%`;
  // The line runs from the rod tip to the bobber. The tip is read from the scene
  // rather than hardcoded here, so moving the rod can never desync the line.
  const tip = rodTip();
  const x = tip.x + (left / 100) * (100 - tip.x);
  const y = tip.y + (top / 100) * (100 - tip.y);
  ui.line?.setAttribute('d',
    `M${tip.x} ${tip.y} Q${((tip.x + x) / 2).toFixed(2)} ${((tip.y + y) / 2 + 6).toFixed(2)} `
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

function hook(fish) {
  clearShake();
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

function showResult(name, meta, value, rarity) {
  ui.catchName.textContent = name;
  // Colour carries the rarity at a glance; the pips below give the exact tier.
  ui.catchName.style.color = rarity ? RARITY_COLOURS[rarity] : '#e07b2a';
  paintRarity(rarity);
  ui.catchMeta.textContent = meta;
  ui.catchValue.textContent = `¤ ${value}`;
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

  showResult(mutation.name ? `${mutation.name} ${fish.name}` : fish.name, meta, value, fish.rarity);
  save();
  paintChrome();
}

function loseFish(reason) {
  showResult('Line snapped', reason, 0, null);
}

/* -------------------------------------------------------------------- shop */

function renderShop() {
  ui.shopCoins.textContent = state.coins;
  ui.shopList.textContent = '';

  for (const r of Object.values(RODS)) {
    const equipped = r.id === state.rodId;
    const affordable = state.coins >= r.price;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rod${equipped ? ' rod--equipped' : ''}`;
    button.disabled = equipped || !affordable;
    button.innerHTML =
      `<span class="rod__row"><span>${r.name}</span><span>¤${r.price}</span></span>` +
      `<span class="rod__stats">control ${r.control.toFixed(2)} · resilience ${r.resilience.toFixed(2)} · ` +
      `luck ${r.luck.toFixed(1)} · max ${r.maxKg} kg</span>` +
      `<span class="rod__blurb">${r.blurb}</span>` +
      `<span class="rod__stats">${equipped ? 'equipped' : affordable ? 'buy' : 'not enough coins'}</span>`;
    button.addEventListener('click', () => {
      const result = buyRod(state, r.id);
      if (!result.ok) {
        button.textContent = result.reason;
        return;
      }
      state.coins = result.coins;
      state.rodId = result.rodId;
      save();
      paintChrome();
      renderShop();
    });
    ui.shopList.appendChild(button);
  }
}

function openShop() {
  renderShop();
  ui.shopPanel.hidden = false;
  ui.shopClose.focus();
}

function closeShop() {
  ui.shopPanel.hidden = true;
  ui.shopOpen.focus();
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

ui.catchAgain.addEventListener('click', () => { setPhase('idle'); say(IDLE_HINT); });
ui.shopOpen.addEventListener('click', openShop);
ui.shopClose.addEventListener('click', closeShop);
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
    hook(rollFish(Math.random(), rod()));
  }

  if (state.phase === 'reeling') stepReel();

  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------------- boot */

load();
paintChrome();
setPhase('idle');
say(IDLE_HINT);
requestAnimationFrame(frame);

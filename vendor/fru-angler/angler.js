/**
 * Frutiger Angler: input, timing and rendering.
 *
 * Every rule lives in fishing.js (rods, casts, fish, economy) and reel.js (the
 * minigame maths). This file only turns their output into pixels, and is the
 * only part that touches the DOM.
 */
import {
  RODS, FISH, RARITY_COLOURS,
  castQuality, castDistance, biteDelayFor, rollFish, rollMutation,
  fishWeight, canCatch, catchValue, startingLoadout, buyRod, recordCatch,
} from './fishing.js?v=2026-10-01-a';
import {
  reelConfig, stepReel as advance, reelOutcomeFor, isCaught,
} from './reel.js?v=2026-10-01-a';

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
  ui.bobber.style.left = `${22 + reach * 56}%`;
  ui.bobber.style.top = `${30 + reach * 26}%`;
  ui.splash.style.left = ui.bobber.style.left;
  ui.splash.style.top = ui.bobber.style.top;
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
  state.reel = { cfg, fishX: 0.5, playerX: 0.5, progress: 0.34 };
  setPhase('reeling');
  say('');
}

/* ------------------------------------------------------------------- reel */

function stepReel() {
  const r = state.reel;
  const next = advance(r.cfg, {
    fishX: r.fishX, playerX: r.playerX, progress: r.progress, holding: state.holding,
  }, REEL_DT);

  r.fishX = next.fishX;
  r.playerX = next.playerX;
  r.progress = next.progress;

  ui.reelPlayer.style.width = `${r.cfg.playerWidth * 100}%`;
  ui.reelPlayer.style.left = `${r.playerX * 100 - (r.cfg.playerWidth / 2) * 100}%`;
  ui.reelFish.style.left = `${r.fishX * 100}%`;
  ui.reelFill.style.width = `${r.progress * 100}%`;

  const outcome = reelOutcomeFor(r.progress);
  if (outcome === isCaught) landFish();
  else if (outcome === lineSnapped) loseFish(`${state.hooked.name} got away.`);
}

function showResult(name, meta, value, colour) {
  ui.catchName.textContent = name;
  ui.catchName.style.color = colour ?? RARITY_COLOURS.Common;
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
      `${fish.name} weighed ${kg} kg — over this rod's ${current.maxKg} kg limit. Line snapped.`,
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

  showResult(mutation.name ? `${mutation.name} ${fish.name}` : fish.name, meta, value, RARITY_COLOURS[fish.rarity]);
  save();
  paintChrome();
}

function loseFish(reason) {
  showResult('Line snapped', reason, 0, '#e07b2a');
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

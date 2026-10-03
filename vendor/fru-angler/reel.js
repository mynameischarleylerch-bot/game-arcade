/**
 * The reeling minigame for Frutiger Angler: given a rod, a fish and the player's
 * input, return the next frame.
 *
 * Pure maths — no DOM, no canvas, no timers. angler.js owns those. Rod Control
 * widens the player's bar and rod Resilience damps the fish, so upgrading gear
 * makes a hard fish easier without changing which fish it is. That is exactly
 * how upgrading feels in Fisch.
 */

/* ------------------------------------------------------------------ tuning */

const BASE_FISH_SPEED = 0.55;      // bar-widths per second at fight = 1
const BASE_PLAYER_SPEED = 1.05;    // bar-widths per second under the player's thumb
/* The bar is pushed right while held and slides left when released, so the two
 * speeds must stay close. A much slower drift made a left-swimming fish
 * impossible to follow; 0.9 keeps a small penalty for mashing the key. */
const IDLE_DRIFT = BASE_PLAYER_SPEED * 0.9;
const PROGRESS_RATE = 0.34;        // scale applied to the fill/drain rate
const DRAIN_RATE = 0.22;           // scale applied to the drain rate
const EASY_FRAMES = 2.2;           // seconds of perfect containment for a docile fish
const HARD_FRAMES = 5.5;           // ...and for a Mythical
const RESILIENCE_CALM = 0.55;      // how much resilience can flatten the fish
const MAX_PLAYER_WIDTH = 0.5;
const MAX_GUST = 1.25;                               // the fastest a gust can push it
const MAX_FISH_SPEED = BASE_PLAYER_SPEED * 0.8;   // peak, gust included: always catchable

export const reelOutcome = {
  inProgress: 'in-progress',
  caught: 'caught',
  snapped: 'snapped',
};
export const isCaught = reelOutcome.caught;
export const lineSnapped = reelOutcome.snapped;

/* ------------------------------------------------------------------ config */

/** Derive every minigame number from the fish's fight and the rod's stats. */
export function reelConfig({ fight, control, resilience }) {
  const f = Math.min(Math.max(fight, 0), 1);
  const c = Math.min(Math.max(control, 0.05), MAX_PLAYER_WIDTH);
  const r = Math.min(Math.max(resilience, 0), 1);

  // Resilience damps both the fish's speed and how erratically it turns.
  const calm = 1 - r * RESILIENCE_CALM;
  const rawSpeed = BASE_FISH_SPEED * (0.35 + f * 0.65) * calm;

  // Fairness: the fish must stay under the player's top speed or a hard fish
  // becomes mathematically unwinnable rather than merely hard. Magnitude is
  // capped; craziness comes from changing heading, not from moving faster.
  // Capped against the gusted peak: fishSpeed * MAX_GUST must stay under the
  // player's top speed, so a hard fish can never be literally uncatchable.
  const fishSpeed = Math.min(rawSpeed, MAX_FISH_SPEED / MAX_GUST);

  // Heading changes per second. This, not speed, is what makes a fish feel wild:
  // a Common drifts one way for a beat, a Mythical thrashes across the bar.
  // Squared so the top tiers are clearly crazier than the middle ones.
  const turnRate = (0.22 + f * f * 4.6) * (1 - r * 0.6);

  return {
    fight: f,
    playerWidth: c,
    fishSpeed,
    turnRate,
    jitter: turnRate,
    playerSpeed: BASE_PLAYER_SPEED,
    idleDrift: IDLE_DRIFT,
    // Docile fish fill fast and rare; Mythicals drag on.
    progressRate: PROGRESS_RATE * (1 + (1 - f) * 0.6),
    drainRate: DRAIN_RATE * (1 + f * 0.8),
    progressNeeded: 1 / (EASY_FRAMES + (HARD_FRAMES - EASY_FRAMES) * f),
  };
}

/* -------------------------------------------------------------- containment */

/** Is the fish's line inside the player's bar? */
export function isContained(cfg, fishX, playerX) {
  return Math.abs(fishX - playerX) <= cfg.playerWidth / 2;
}

/** 1 while the fish is contained, 0 otherwise. */
export function containedFraction(cfg, fishX, playerX) {
  return isContained(cfg, fishX, playerX) ? 1 : 0;
}

/* -------------------------------------------------------------------- step */

/**
 * Advance one frame.
 * @param {object} cfg   from reelConfig()
 * @param {object} state { fishX, playerX, progress, holding, dir } — 0..1, dir is +/-1
 * @param {number} dt    seconds since the last frame
 * @param {number} seed  0..1, decides whether the fish turns on this frame
 * @returns {{fishX:number, playerX:number, progress:number, contained:boolean, dir:number}}
 */
export function stepReel(cfg, state, dt, seed = Math.random()) {
  // The fish has a heading, and reverses it now and then. It used to drift right
  // with only its speed wobbling, which made it read as one-way traffic; a
  // heading that actually flips is what makes it feel like it is fighting you.
  let dir = state.dir ?? 1;
  if (seed < cfg.turnRate * dt) dir = -dir;

  // Speed breathes within its own cap so a turn does not look mechanical.
  const gust = 0.75 + (1 - seed) * (MAX_GUST - 0.75);
  let fishX = state.fishX + dir * cfg.fishSpeed * gust * dt;

  // Hitting an end reverses the heading, so the fish always comes back.
  if (fishX < 0) { fishX = -fishX; dir = 1; }
  if (fishX > 1) { fishX = 2 - fishX; dir = -1; }

  let playerX = state.holding
    ? state.playerX + cfg.playerSpeed * dt
    : state.playerX - cfg.idleDrift * dt;
  if (playerX < 0) playerX = 0;
  if (playerX > 1) playerX = 1;

  const contained = isContained(cfg, fishX, playerX);
  const progress = contained
    ? state.progress + cfg.progressRate * cfg.progressNeeded * dt
    : state.progress - cfg.drainRate * dt;

  return {
    fishX,
    playerX,
    progress: Math.min(1, Math.max(0, progress)),
    contained,
    dir,
  };
}

/** Which end of the minigame have we reached, if any? */
export function reelOutcomeFor(progress) {
  if (progress >= 1) return isCaught;
  if (progress <= 0) return lineSnapped;
  return reelOutcome.inProgress;
}

/**
 * Fishing simulation for Frutiger Angler: rods, cast quality, bite timing, the
 * fish table and the economy.
 *
 * Pure functions, no DOM and no canvas — angler.js turns whatever these return
 * into pixels. Randomness is always an injected `roll`/`seed` so tests stay
 * deterministic.
 */

/* ------------------------------------------------------------------ tuning */

const PERFECT_BAND = { from: 0.45, to: 0.55 };  // the green zone on the cast meter
const GOOD_BAND = 0.2;                           // above this is "good", below is "poor"
const CAST_REACH = { perfect: 1, good: 0.65, poor: 0.3 };
const BITE_BASE_MS = 2600;
const BITE_JITTER_MS = 1800;
const BITE_MIN_MS = 350;
const LUCK_BITE_SHORTENING = 0.05;   // per point of luck, capped at 20%
const LUCK_BITE_CAP = 0.2;

/* -------------------------------------------------------------- mutations */

export const MUTATIONS = [
  { id: 'none', name: '', multiplier: 1, weight: 74 },
  { id: 'shiny', name: 'Shiny', multiplier: 1.5, weight: 18 },
  { id: 'glowy', name: 'Glowy', multiplier: 2, weight: 7 },
  { id: 'crowned', name: 'Crowned', multiplier: 5, weight: 1 },
];

/* ------------------------------------------------------------------- rods */

/**
 * control: width of the player's bar in the reeling minigame.
 * resilience: how much the fish's movement is damped.
 * luck: shifts the weight table toward rarer fish, and shortens the bite.
 * lureSpeed: how fast the wait before a bite passes.
 * maxKg: the weight ceiling — land nothing heavier, or the line snaps.
 */
export const RODS = {
  bamboo: {
    id: 'bamboo', name: 'Bamboo Pole', price: 60,
    control: 0.20, resilience: 0.30, luck: 0, lureSpeed: 1, maxKg: 3,
    blurb: 'Splinters. Still better than nothing.',
  },
  willow: {
    id: 'willow', name: 'Willow Rod', price: 240,
    control: 0.24, resilience: 0.42, luck: 0.4, lureSpeed: 1.6, maxKg: 8,
    blurb: 'Bends without complaining.',
  },
  carbon: {
    id: 'carbon', name: 'Carbon Float', price: 900,
    control: 0.28, resilience: 0.55, luck: 0.8, lureSpeed: 2.4, maxKg: 20,
    blurb: 'Light, springy, slightly smug.',
  },
  oak: {
    id: 'oak', name: 'Oak Lance', price: 3200,
    control: 0.32, resilience: 0.70, luck: 1.2, lureSpeed: 3.2, maxKg: 45,
    blurb: 'Heavy enough to feel the water.',
  },
  titan: {
    id: 'titan', name: 'Titan Aero', price: 11000,
    control: 0.36, resilience: 0.85, luck: 1.8, lureSpeed: 4.2, maxKg: 120,
    blurb: 'Absorbs thrashing like a rumour.',
  },
};

/**
 * How each rod is drawn in the scene: its length, thickness and colour, plus where
 * the lure ends up. Without this, buying a rod changed the numbers but not a single
 * pixel on screen. Coordinates are the scene's percentage space, running from the
 * angler's shoulder at (40.7, 52) up and to the right.
 *
 * Upgrades get longer and thicker, so the progression is legible at a glance.
 */
const ROD_LOOKS = {
  bamboo: { path: 'M40.7 52 L52 40', width: 1.1, colour: '#c8a06a' },
  willow: { path: 'M40.7 52 L55 35', width: 1.5, colour: '#a9714a' },
  carbon: { path: 'M40.7 52 L58 31', width: 1.9, colour: '#4a6b7c' },
  oak: { path: 'M40.7 52 L61 27', width: 2.4, colour: '#7d4f2e' },
  titan: { path: 'M40.7 52 L64 23', width: 3.0, colour: '#8c9aa8' },
};

const LURE_OFFSET = 0.6;   // nudge the lure just past the tip so it sits on the end

/** Tip coordinates are derived from the path, never typed twice. */
function withTip(look) {
  const end = look.path.split('L')[1].trim().split(/\s+/).map(Number);
  return { ...look, tipX: end[0] + LURE_OFFSET, tipY: end[1] - LURE_OFFSET };
}

export const ROD_ART = Object.fromEntries(
  Object.entries(ROD_LOOKS).map(([id, look]) => [id, withTip(look)]),
);

/** The scene art for a rod, falling back to the starting rod for anything unknown. */
export function rodArt(rodId) {
  return ROD_ART[rodId] ?? ROD_ART.bamboo;
}

/** Every rod id, cheapest first. The shop and the inventory both list them in order. */
export const RODS_BY_PRICE = Object.keys(RODS)
  .sort((a, b) => RODS[a].price - RODS[b].price);

/* ------------------------------------------------------------------- fish */

/**
 * fight: how violently the fish moves the reeling line, 0 (docile) to 1 (Mythical).
 * draw/hue: how angler.js paints it, so this file needs no canvas.
 *
 * Names are original and Frutiger-themed on purpose — not real species, and not
 * Fisch's. Rarity order matches Fisch's so the difficulty curve reads the same.
 */
export const FISH = [
  { id: 'glidefin', name: 'Glidefin', rarity: 'Common', pricePerKg: 4, minKg: 0.4, maxKg: 2.0, fight: 0.35, hue: 195, draw: 'slim', weight: 30 },
  { id: 'aero-minnow', name: 'Aero Minnow', rarity: 'Common', pricePerKg: 6, minKg: 0.3, maxKg: 1.2, fight: 0.45, hue: 210, draw: 'slim', weight: 26 },
  { id: 'metro-trout', name: 'Metro Trout', rarity: 'Uncommon', pricePerKg: 18, minKg: 1.5, maxKg: 5.5, fight: 0.60, hue: 150, draw: 'deep', weight: 20 },
  { id: 'doric-dab', name: 'DORFic Dab', rarity: 'Rare', pricePerKg: 55, minKg: 0.8, maxKg: 3.4, fight: 0.75, hue: 45, draw: 'flat', weight: 12 },
  { id: 'eco-gar', name: 'Eco Gar', rarity: 'Legendary', pricePerKg: 140, minKg: 12, maxKg: 40, fight: 0.88, hue: 110, draw: 'long', weight: 8 },
  { id: 'glacier-char', name: 'Glacier Char', rarity: 'Mythical', pricePerKg: 320, minKg: 30, maxKg: 110, fight: 1.0, hue: 275, draw: 'long', weight: 4 },
];

export const RARITY_COLOURS = {
  Common: '#7ea8bd',
  Uncommon: '#7aa84a',
  Rare: '#e07b2a',
  Legendary: '#c8a02e',
  Mythical: '#8b5cf6',
};

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythical'];

/* ------------------------------------------------------------------ casts */

/** 'perfect' | 'good' | 'poor' for a meter position in 0..1. */
export function castQuality(meter) {
  const value = Math.min(Math.max(meter, 0), 1);
  if (value >= PERFECT_BAND.from && value <= PERFECT_BAND.to) return 'perfect';
  return value >= GOOD_BAND ? 'good' : 'poor';
}

/** How far the bobber flies, as a fraction of the maximum range. */
export function castDistance(quality) {
  return CAST_REACH[quality] ?? CAST_REACH.poor;
}

/* ------------------------------------------------------------------- bites */

/**
 * Wait time before the bite, in ms. Lure speed shortens it; luck shortens it
 * slightly. `seed` in 0..1 controls the jitter so the caller owns randomness.
 */
export function biteDelayFor(rod, { baseMs = BITE_BASE_MS, seed = Math.random() } = {}) {
  const speed = Math.max(1, rod?.lureSpeed || 1);
  const luckShortening = Math.min(LUCK_BITE_CAP, (rod?.luck || 0) * LUCK_BITE_SHORTENING);
  const base = (baseMs / speed) * (1 - luckShortening);
  const spread = (BITE_JITTER_MS / speed) * Math.min(Math.max(seed, 0), 1);
  return Math.max(BITE_MIN_MS, Math.round(base + spread));
}

/* --------------------------------------------------------------- the table */

/**
 * Weighted roll over the fish table. `roll` is a uniform 0..1 from the caller.
 * Luck multiplies the weight of everything rarer than Common, scaled by how
 * far down the table a fish sits, so the good stuff drifts up gradually.
 */
export function rollFish(roll, rod) {
  const luck = Math.max(0, rod?.luck || 0);
  const weights = FISH.map((fish, index) => {
    const base = fish.weight ?? 1;
    const depth = index / Math.max(1, FISH.length - 1);
    const boost = fish.rarity === 'Common' ? 1 : 1 + luck * depth * 2;
    return base * boost;
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let cursor = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (let i = 0; i < FISH.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return FISH[i];
  }
  return FISH[0];
}

/** Roll a mutation. Weights are percentages and must total 100. */
export function rollMutation(roll = Math.random()) {
  const total = MUTATIONS.reduce((sum, m) => sum + m.weight, 0);
  let cursor = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (const mutation of MUTATIONS) {
    cursor -= mutation.weight;
    if (cursor <= 0) return mutation;
  }
  return MUTATIONS[0];
}

/* ------------------------------------------------------------------ money */

/** Roll a weight for `fish` inside its own bounds. `roll` in 0..1. */
export function fishWeight(fish, roll = Math.random()) {
  const span = fish.maxKg - fish.minKg;
  const clamped = Math.min(Math.max(roll, 0), 1);
  return Math.round((fish.minKg + span * clamped) * 100) / 100;
}

/** Can this rod land a fish of this weight? Above the ceiling, the line snaps. */
export function canCatch(fish, weight, rod) {
  return weight <= rod.maxKg;
}

export function catchValue(fish, weight, mutationMultiplier = 1) {
  return Math.round(fish.pricePerKg * weight * mutationMultiplier);
}

/**
 * The wallet starts with enough to buy the first upgrade, so the shop is
 * reachable immediately rather than after an hour of grinding the worst rod.
 */
export function startingLoadout() {
  return { rodId: 'bamboo', coins: RODS.willow.price };
}

/* ------------------------------------------------------------------- shop */

/**
 * Attempt a purchase. Never mutates the wallet: on failure the caller gets the
 * same coins and rod back plus a reason.
 */
export function buyRod(wallet, rodId) {
  const rod = RODS[rodId];
  if (!rod) return { ...wallet, ok: false, reason: 'Unknown rod.' };
  if (wallet.coins < rod.price) {
    return { ...wallet, ok: false, reason: 'Not enough coins.' };
  }
  return { ok: true, rodId, coins: wallet.coins - rod.price };
}

/* ------------------------------------------------------------- inventory */

/** The rods you own, cheapest first. Everyone starts with the bamboo pole. */
export function startingInventory() {
  return ['bamboo'];
}

export function ownsRod(inventory, rodId) {
  return Array.isArray(inventory) && inventory.includes(rodId);
}

/**
 * Put a rod in the bag. Never duplicates, always keeps price order so the shop can
 * list owned and unowned rods together without sorting twice.
 */
export function addRodToInventory(inventory, rodId) {
  const owned = Array.isArray(inventory) ? inventory.filter((id) => RODS[id]) : [];
  if (!RODS[rodId] || owned.includes(rodId)) return [...owned];
  return [...owned, rodId].sort((a, b) => RODS[a].price - RODS[b].price);
}

/**
 * Equip an owned rod. This is free and separate from buying, which is the point of
 * an inventory: you can go back to an earlier rod without paying again.
 */
export function equipRod(inventory, rodId) {
  if (!ownsRod(inventory, rodId)) {
    return { rodId: inventory?.[0] ?? 'bamboo', ok: false, reason: 'You do not own that rod.' };
  }
  return { rodId, ok: true };
}

/* ------------------------------------------------------------- bestiary */

/** Record a catch if it is heavier than the one already held for that species. */
export function recordCatch(bestiary, fish, weight) {
  const best = bestiary[fish.id] ?? 0;
  return { ...bestiary, [fish.id]: Math.max(best, weight) };
}

export function fishById(id) {
  return FISH.find((f) => f.id === id) ?? null;
}

export { RARITY_ORDER };

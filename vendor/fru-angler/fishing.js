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
    traits: [],
    blurb: 'Splinters. Still better than nothing.',
  },
  willow: {
    id: 'willow', name: 'Willow Rod', price: 240,
    control: 0.28, resilience: 0.42, luck: 0.4, lureSpeed: 1.6, maxKg: 8,
    traits: [],
    blurb: 'Bends without complaining.',
  },
  carbon: {
    id: 'carbon', name: 'Carbon Float', price: 900,
    control: 0.34, resilience: 0.55, luck: 0.8, lureSpeed: 2.4, maxKg: 20,
    traits: [],
    blurb: 'Light, springy, slightly smug.',
  },
  oak: {
    id: 'oak', name: 'Oak Lance', price: 3200,
    control: 0.40, resilience: 0.70, luck: 1.2, lureSpeed: 3.2, maxKg: 45,
    traits: [],
    blurb: 'Heavy enough to feel the water.',
  },
  titan: {
    id: 'titan', name: 'Titan Aero', price: 11000,
    control: 0.46, resilience: 0.85, luck: 1.8, lureSpeed: 4.2, maxKg: 120,
    traits: [],
    blurb: 'Absorbs thrashing like a rumour.',
  },

  /* ---- specialist rods ---------------------------------------------
   * Each exists to open one gated lake, so each carries that lake's trait.
   * They cost a real premium over the plain top rod: the gate has to be an
   * economy decision, not a formality. Stats are otherwise comparable, so the
   * player is paying for access rather than for power.
   */
  canopy: {
    id: 'canopy', name: 'Canopy Stretch', price: 16000,
    control: 0.46, resilience: 0.78, luck: 2.2, lureSpeed: 5.0, maxKg: 90,
    traits: ['flex'],
    blurb: 'Reaches over the reeds without touching them.',
  },
  glacier: {
    id: 'glacier', name: 'Frostline Core', price: 24000,
    control: 0.48, resilience: 0.80, luck: 1.6, lureSpeed: 4.0, maxKg: 140,
    traits: ['ice'],
    blurb: 'Bored through the ice. Useless anywhere warm.',
  },
  abyss: {
    id: 'abyss', name: 'Abyssal Rig', price: 42000,
    control: 0.50, resilience: 0.92, luck: 2.0, lureSpeed: 4.6, maxKg: 260,
    traits: ['reinforced'],
    blurb: 'Built for pressure. Heavy enough to be a nuisance on the bank.',
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
  // Longer and thicker again, and tinted with their own lake, so the scene says
  // which water this rod is built for.
  canopy: { path: 'M40.7 52 L65 25', width: 3.1, colour: '#5f8f3f' },
  glacier: { path: 'M40.7 52 L66 23', width: 3.4, colour: '#bfe4f5' },
  abyss: { path: 'M40.7 52 L68 21', width: 4.2, colour: '#1d4a63' },
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
  { id: 'glidefin', name: 'Glidefin', rarity: 'Common', pricePerKg: 4, minKg: 0.4, maxKg: 2, fight: 0.35, hue: 195, draw: 'slim', weight: 30,
    hook: 'The wind picks up. You feel something small skimming across the top.' },
  { id: 'sunscale', name: 'Sunscale', rarity: 'Common', pricePerKg: 7, minKg: 0.5, maxKg: 2.4, fight: 0.4, hue: 48, draw: 'slim', weight: 22,
    hook: 'Warm as a windowsill. You feel it turn towards the light.' },
  { id: 'bubbleperch', name: 'Bubble Perch', rarity: 'Common', pricePerKg: 8, minKg: 0.4, maxKg: 1.8, fight: 0.42, hue: 160, draw: 'deep', weight: 16,
    hook: 'It blows a small burst of bubbles. You feel the line twitch and think it is a fish.' },
  { id: 'aero-minnow', name: 'Aero Minnow', rarity: 'Common', pricePerKg: 6, minKg: 0.3, maxKg: 1.2, fight: 0.45, hue: 210, draw: 'slim', weight: 26,
    hook: 'A flicker of silver. You feel the line go slack, then taut again.' },
  { id: 'ripplefin', name: 'Ripplefin', rarity: 'Common', pricePerKg: 9, minKg: 0.6, maxKg: 2.8, fight: 0.5, hue: 178, draw: 'flat', weight: 18,
    hook: 'The surface dimples where it goes. You feel the ring travel up the line.' },
  { id: 'glossdace', name: 'Gloss Dace', rarity: 'Common', pricePerKg: 10, minKg: 0.7, maxKg: 3.1, fight: 0.55, hue: 200, draw: 'slim', weight: 14,
    hook: 'Silver under the light, gone again. You feel it hesitate before it commits.' },
  { id: 'metro-trout', name: 'Metro Trout', rarity: 'Uncommon', pricePerKg: 18, minKg: 1.5, maxKg: 5.5, fight: 0.6, hue: 150, draw: 'deep', weight: 20,
    hook: 'You feel it darting under the surface, quick and stubborn.' },
  { id: 'coralpike', name: 'Coral Pike', rarity: 'Uncommon', pricePerKg: 24, minKg: 2, maxKg: 7, fight: 0.65, hue: 20, draw: 'deep', weight: 14,
    hook: 'You feel it hold station in the warm shallows, refusing to move.' },
  { id: 'reedcarp', name: 'Reed Carp', rarity: 'Uncommon', pricePerKg: 26, minKg: 2.4, maxKg: 8.5, fight: 0.68, hue: 95, draw: 'deep', weight: 11,
    hook: 'Something grinds through the reeds. You feel the line judder as it passes.' },
  { id: 'duskdarter', name: 'Dusk Darter', rarity: 'Uncommon', pricePerKg: 22, minKg: 1.2, maxKg: 4.6, fight: 0.7, hue: 330, draw: 'slim', weight: 12,
    hook: 'A shadow crosses the line. You feel it gone before you see it.' },
  { id: 'lanternjack', name: 'Lantern Jack', rarity: 'Uncommon', pricePerKg: 28, minKg: 1.8, maxKg: 6.4, fight: 0.72, hue: 55, draw: 'flat', weight: 10,
    hook: 'A pale light moves under the surface. You feel it drift, unhurried.' },
  { id: 'snowsmelt', name: 'Snowsmelt', rarity: 'Uncommon', pricePerKg: 30, minKg: 2.6, maxKg: 9, fight: 0.76, hue: 190, draw: 'slim', weight: 9,
    hook: 'Meltwater runs down the line. You feel the cold coming from upstream.' },
  { id: 'mudsole', name: 'Mud Sole', rarity: 'Rare', pricePerKg: 58, minKg: 3.5, maxKg: 12, fight: 0.74, hue: 88, draw: 'flat', weight: 8,
    hook: 'The line goes slack and stays slack. You feel it working something over.' },
  { id: 'doric-dab', name: 'DORFic Dab', rarity: 'Rare', pricePerKg: 55, minKg: 0.8, maxKg: 3.4, fight: 0.75, hue: 45, draw: 'flat', weight: 12,
    hook: 'The line drags low. You feel whatever this is hugging the bottom.' },
  { id: 'orangebarbel', name: 'Orange Barbel', rarity: 'Rare', pricePerKg: 62, minKg: 4, maxKg: 14, fight: 0.78, hue: 32, draw: 'deep', weight: 8,
    hook: 'You feel it dive for the warm bottom and hold there, heavy and sure.' },
  { id: 'emberfin', name: 'Emberfin', rarity: 'Rare', pricePerKg: 76, minKg: 4.5, maxKg: 16, fight: 0.8, hue: 12, draw: 'long', weight: 7,
    hook: 'The line comes back warm. You feel the heat before the weight.' },
  { id: 'mirrorpike', name: 'Mirror Pike', rarity: 'Rare', pricePerKg: 70, minKg: 5, maxKg: 18, fight: 0.82, hue: 168, draw: 'long', weight: 7,
    hook: 'You feel something long decide to move, and then it simply does.' },
  { id: 'frostfin', name: 'Frostfin', rarity: 'Rare', pricePerKg: 88, minKg: 6, maxKg: 22, fight: 0.84, hue: 196, draw: 'long', weight: 6,
    hook: 'Ice ticks against the line. You feel it hold perfectly still, waiting.' },
  { id: 'blueglass', name: 'Blueglass', rarity: 'Legendary', pricePerKg: 168, minKg: 9, maxKg: 34, fight: 0.87, hue: 215, draw: 'deep', weight: 4,
    hook: 'You feel something turn over, slow and heavy, like a pane of glass.' },
  { id: 'eco-gar', name: 'Eco Gar', rarity: 'Legendary', pricePerKg: 140, minKg: 12, maxKg: 40, fight: 0.88, hue: 110, draw: 'long', weight: 8,
    hook: 'You feel the power of the environment surge up the line.' },
  { id: 'rimepike', name: 'Rime Pike', rarity: 'Legendary', pricePerKg: 155, minKg: 10, maxKg: 38, fight: 0.9, hue: 205, draw: 'long', weight: 5,
    hook: 'You feel the cold come off the line in waves. It is not struggling. It is waiting.' },
  { id: 'deepglow', name: 'Deepglow', rarity: 'Legendary', pricePerKg: 205, minKg: 16, maxKg: 60, fight: 0.93, hue: 262, draw: 'long', weight: 4,
    hook: 'You feel a light on the other end of the line. It is not your lamp.' },
  { id: 'pressurefin', name: 'Pressurefin', rarity: 'Legendary', pricePerKg: 228, minKg: 20, maxKg: 70, fight: 0.95, hue: 250, draw: 'deep', weight: 3,
    hook: 'The line hums with pressure. You feel the weight of the water itself.' },
  { id: 'blackmirror', name: 'Blackmirror', rarity: 'Mythical', pricePerKg: 390, minKg: 24, maxKg: 88, fight: 0.97, hue: 240, draw: 'deep', weight: 2,
    hook: 'The line goes dead, and then you feel it pull again, from straight down.' },
  { id: 'voidpike', name: 'Voidpike', rarity: 'Mythical', pricePerKg: 355, minKg: 26, maxKg: 96, fight: 0.98, hue: 285, draw: 'long', weight: 2,
    hook: 'You feel it take the line and hold it, out past where light gives up.' },
  { id: 'glacier-char', name: 'Glacier Char', rarity: 'Mythical', pricePerKg: 320, minKg: 30, maxKg: 110, fight: 1, hue: 275, draw: 'long', weight: 4,
    hook: 'The cold runs up your arm. This one is older than the ice.' },
  { id: 'lastlantern', name: 'Lastlantern', rarity: 'Mythical', pricePerKg: 420, minKg: 30, maxKg: 120, fight: 1, hue: 190, draw: 'long', weight: 1,
    hook: 'You feel the line go warm for the first time in your life.' },
];;

export const RARITY_COLOURS = {
  Common: '#7ea8bd',
  Uncommon: '#7aa84a',
  Rare: '#e07b2a',
  Legendary: '#c8a02e',
  Mythical: '#8b5cf6',
};

/* Rare first, so an index or a guide can walk the tiers in order without
   re-declaring them. Exported at the bottom of this file. */
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythical'];

/* The share of casts each tier accounts for, as a percentage. rollFish() picks a
   fish by weight within the whole table, so these are derived from the weights
   rather than declared separately — see fishIndex(), which computes them. */

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
export function rollFish(roll, rod, areaId) {
  // Only the fish living in the water you are standing in are on the table. An
  // unknown id falls back to the first lake, which is always open.
  const area = AREAS.find((a) => a.id === areaId) ?? AREAS[0];
  const pool = area.fish.map((id) => FISH.find((f) => f.id === id)).filter(Boolean);
  const table = pool.length ? pool : FISH;

  const luck = Math.max(0, rod?.luck || 0);
  const weights = table.map((fish, index) => {
    const base = fish.weight ?? 1;
    const depth = index / Math.max(1, FISH.length - 1);
    const boost = fish.rarity === 'Common' ? 1 : 1 + luck * depth * 2;
    return base * boost;
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let cursor = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (let i = 0; i < table.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return table[i];
  }
  return table[0];
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

/* ---------------------------------------------------------- fish visuals */

/**
 * Body shapes for the catch card. The `draw` field on every fish picks one, and the
 * `hue` tints it. Coordinates are in a 120x80 box with the fish facing right.
 *
 * Kept here rather than in angler.js so the drawing is testable without a DOM, and
 * so a fish's look lives with its data.
 */
export const FISH_SHAPES = {
  /** Slim and quick: the small, fast fish. */
  slim: {
    body: 'M34 40 C44 26 66 24 80 34 C88 40 88 42 80 48 C66 58 44 56 34 42 Z',
    tail: 'M34 40 L12 24 L18 40 L12 58 Z',
    fin: 'M56 34 C60 26 66 24 70 28 C66 32 62 36 58 42 Z',
    eye: { cx: 72, cy: 38, r: 3.4 },
    stripe: 'M48 33 L52 49 M58 32 L62 50 M68 34 L72 46',
  },
  /** Deep-bodied and broad: the trout-like fish. */
  deep: {
    body: 'M32 40 C42 20 70 18 84 32 C92 40 92 44 84 50 C70 62 42 60 32 40 Z',
    tail: 'M32 40 L8 20 L16 40 L8 62 Z',
    fin: 'M56 26 C62 14 72 12 78 18 C72 22 66 28 60 38 Z',
    eye: { cx: 76, cy: 36, r: 4 },
    stripe: 'M46 28 L50 56 M58 25 L62 59 M70 28 L74 54',
  },
  /** Flat and wide, low in the water: the dab. */
  flat: {
    body: 'M30 42 C40 28 72 26 86 36 C94 42 94 46 86 52 C72 60 40 58 30 42 Z',
    tail: 'M30 42 L8 32 L14 42 L8 54 Z',
    fin: 'M58 32 C64 22 74 20 80 26 C74 30 68 34 62 40 Z',
    eye: { cx: 78, cy: 40, r: 3.6 },
    stripe: 'M44 34 C56 30 70 32 82 38 M44 50 C58 54 72 52 82 46',
  },
  /** Long and sinuous: the big legendary fish. */
  long: {
    body: 'M26 40 C38 22 74 18 90 30 C100 38 100 44 90 50 C74 62 38 58 26 40 Z',
    tail: 'M26 40 L4 18 L13 40 L4 64 Z',
    fin: 'M54 26 C62 12 74 10 82 16 C74 20 66 28 58 38 Z',
    eye: { cx: 82, cy: 36, r: 4.2 },
    stripe: 'M40 28 L44 54 M52 25 L56 57 M64 24 L68 56 M76 26 L80 52',
  },
};

/**
 * Render a fish as a standalone SVG string, tinted by its hue and built from its
 * shape. Rarer fish get a warmer highlight so a Mythical reads as special at a
 * glance, not just by the rarity pips.
 *
 * @param {object} fish  a FISH entry; anything unknown falls back to the first fish
 * @returns {string} an SVG element, ready to drop into innerHTML
 */
export function fishSvg(fish) {
  const spec = FISH.find((f) => f && f.id === (fish && fish.id)) ?? FISH[0];
  const shape = FISH_SHAPES[spec.draw] ?? FISH_SHAPES[FISH[0].draw];
  const h = spec.hue ?? FISH[0].hue;
  const { eye } = shape;

  /* Every id here is namespaced per fish. They used to be a flat id="fb" and
   * id="fs", so six fish in the index produced six copies of each and url(#fb)
   * resolved to whichever gradient came first in the document. */
  const id = `fa-${spec.id}`;
  const body_ = `url(#${id}-body)`;
  const fin_ = `url(#${id}-fin)`;
  const tail_ = `url(#${id}-tail)`;
  const sheen_ = `url(#${id}-sheen)`;
  const bloom_ = `url(#${id}-bloom)`;

  // A deeper, more saturated set than the old pastel trio: maximalist Aero wants
  // a lit top surface falling into a deep, saturated belly.
  const top = `hsl(${h} 92% 78%)`;
  const high = `hsl(${h} 88% 62%)`;
  const mid = `hsl(${h} 78% 46%)`;
  const low = `hsl(${h} 72% 28%)`;
  const deep = `hsl(${h} 68% 17%)`;

  // Rarer fish get more of everything: more sparkle, a brighter bloom, a crown of
  // light. This is the visual half of the rarity curve.
  const tier = RARITY_ORDER.indexOf(spec.rarity);              // 0 Common .. 4 Mythical
  const lavish = tier;                                          // 0 for Common, 4 for Mythical
  const sparkleCount = 2 + tier * 2;                            // 2 for Common, 10 for Mythical
  const glow = 1.4 + tier * 1.1;                                // rarer fish glow harder
  const sparkleR = 4.6 - tier * 0.5;                            // and their glints tighten
  const crown = tier >= 3;                                      // Legendary and up

  // Sparkles sit on a spread-out ring so they read as scattered glints.
  const sparkles = Array.from({ length: sparkleCount }, (_, n) => {
    const angle = (n / sparkleCount) * Math.PI * 2 + 0.4;
    const rx = 46 + ((n * 13) % 9);
    const ry = 30 + ((n * 7) % 7);
    const cx = (60 + Math.cos(angle) * rx * 0.62).toFixed(1);
    const cy = (40 + Math.sin(angle) * ry * 0.5).toFixed(1);
    const r = (sparkleR + ((n * 3) % 2) * 0.7).toFixed(2);
    return `<path class="sparkle" d="M${cx} ${(+cy - +r).toFixed(1)}
      L${(+cx + +r * 0.32).toFixed(1)} ${(+cy - +r * 0.32).toFixed(1)}
      L${cx} ${(+cy + +r).toFixed(1)}
      L${(+cx - +r * 0.32).toFixed(1)} ${(+cy - +r * 0.32).toFixed(1)} Z"
      fill="#ffffff" opacity="${(0.5 + lavish * 0.09).toFixed(2)}"/>`;
  }).join('\n    ');

  const bubbles = Array.from({ length: 4 + lavish }, (_, n) => {
    const cx = 14 + ((n * 23) % 96);
    const cy = 12 + ((n * 31) % 58);
    const r = (1.8 + ((n * 5) % 4) * 0.7).toFixed(1);
    return `<circle class="bubbles" cx="${cx}" cy="${cy}" r="${r}"
      fill="#ffffff" opacity="${(0.34 + ((n % 3) * 0.12)).toFixed(2)}"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"
     role="img" aria-label="A ${spec.name}">
  <defs>
    <!-- the body: a lit dorsal surface falling to a deep belly -->
    <linearGradient id="${id}-body" x1="0.18" y1="0" x2="0.72" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.34" stop-color="${high}"/>
      <stop offset="0.62" stop-color="${mid}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <linearGradient id="${id}-fin" x1="0.3" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${high}"/>
      <stop offset="1" stop-color="${low}"/>
    </linearGradient>
    <linearGradient id="${id}-tail" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="${low}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <!-- the specular sweep across the back -->
    <radialGradient id="${id}-sheen" cx="0.32" cy="0.22" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".85"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <!-- light spilling out of the fish; stronger on rare ones -->
    <radialGradient id="${id}-bloom" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="hsl(${h} 100% 82%)" stop-opacity="${(0.3 + lavish * 0.11).toFixed(2)}"/>
      <stop offset="0.6" stop-color="hsl(${h} 100% 78%)" stop-opacity="${(0.12 + lavish * 0.06).toFixed(2)}"/>
      <stop offset="1" stop-color="hsl(${h} 100% 74%)" stop-opacity="0"/>
    </radialGradient>
    <!-- the pond, deep at the bottom and bright at the surface -->
    <linearGradient id="${id}-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eaf9ff"/>
      <stop offset="0.42" stop-color="#a9e2fb"/>
      <stop offset="0.78" stop-color="#5cc0ee"/>
      <stop offset="1" stop-color="#2b8fd0"/>
    </linearGradient>
    <!-- a glassy sheet of light lying on the water -->
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id}-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${glow.toFixed(1)}" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- the pond, deepest layer -->
  <rect width="120" height="80" rx="14" fill="url(#${id}-water)"/>

  <!-- the sun burning through the surface, behind everything -->
  <circle class="bloom" cx="100" cy="14" r="26" fill="url(#${id}-bloom)"/>
  <circle cx="100" cy="14" r="10" fill="#fffde7" opacity=".85"/>
  <circle cx="100" cy="14" r="6" fill="#ffffff" opacity=".9"/>

  <!-- caustics: the light ripples that say "underwater" -->
  <g class="caustics" fill="none" stroke="#ffffff" stroke-linecap="round">
    <path d="M8 22 C22 15 36 29 50 22 C64 15 78 29 92 22" stroke-width="2" opacity=".5"/>
    <path d="M12 34 C26 27 40 41 54 34 C68 27 82 41 96 34" stroke-width="1.6" opacity=".38"/>
    <path d="M6 46 C20 39 34 53 48 46 C62 39 76 53 90 46" stroke-width="1.4" opacity=".28"/>
  </g>

  <!-- bubbles rising through the water column -->
  <g class="bubbles">
    ${bubbles}
  </g>

  <!-- the fish's own halo, so it sits in the light rather than on top of it -->
  <ellipse class="halo" cx="58" cy="40" rx="44" ry="26" fill="url(#${id}-bloom)"
           opacity="${(0.3 + lavish * 0.12).toFixed(2)}" filter="url(#${id}-glow)"/>

  <!-- tail and fins first, so the body overlaps them -->
  <g filter="url(#${id}-glow)">
    <path class="tail" d="${shape.tail}" fill="${tail_}"/>
    <path class="fin" d="${shape.fin}" fill="${fin_}"/>
    <path class="body" d="${shape.body}" fill="${body_}" stroke="${deep}"
          stroke-width="1.1" stroke-opacity=".35"/>

    <!-- the belly, lit from below by the water -->
    <path class="belly" d="M40 52 C56 60 76 58 88 48 C76 58 56 62 40 54 Z"
          fill="#ffffff" opacity=".34"/>

    <!-- lateral stripes, in the deep tone so they read as depth not decoration -->
    <g class="stripe" stroke="${deep}" stroke-width="1.8" opacity=".42"
       stroke-linecap="round" fill="none">
      <path d="${shape.stripe}"/>
    </g>

    <!-- the scale sheen: three offset arcs of light along the flank -->
    <g class="scales" fill="none" stroke="#ffffff" stroke-linecap="round" opacity=".3">
      <path d="M44 44 C52 40 60 40 68 43" stroke-width="1.2"/>
      <path d="M48 48 C56 45 64 45 72 47" stroke-width="1"/>
      <path d="M52 52 C60 50 68 50 76 51" stroke-width=".8"/>
    </g>
  </g>

  <!-- the specular sweep: the gloss cap that makes it read as glassy -->
  <ellipse class="specular" cx="50" cy="29" rx="19" ry="9" fill="${sheen_}"
           transform="rotate(-16 50 29)"/>

  <!-- the eye, with a highlight so it looks wet -->
  <circle class="eye" cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="#ffffff"/>
  <circle cx="${+eye.cx + 0.8}" cy="${eye.cy}" r="${(eye.r * 0.52).toFixed(2)}" fill="#06334f"/>
  <circle cx="${+eye.cx + eye.r * 0.3}" cy="${+eye.cy - eye.r * 0.4}" r="${(eye.r * 0.2).toFixed(2)}"
          fill="#ffffff"/>

  <!-- sparkles, more the rarer the fish -->
  <g class="sparkles">
    ${sparkles}
  </g>

  <!-- a soft shadow on the water under the fish -->
  <ellipse class="shadow" cx="56" cy="66" rx="34" ry="5"
           fill="#0a4a70" opacity=".18"/>

  <!-- the glassy surface sheet, catching the sun -->
  <rect class="surface" width="120" height="26" fill="url(#${id}-glass)"
        opacity=".38" rx="14"/>

  <!-- a Legendary or Mythical gets a crown of light above it -->
  ${crown ? `<g class="ring">
    <ellipse cx="58" cy="17" rx="26" ry="7" fill="none" stroke="#ffffff"
             stroke-width="1.6" opacity=".5"/>
    <ellipse cx="58" cy="17" rx="17" ry="4.6" fill="none" stroke="#fff9c4"
             stroke-width="1.2" opacity=".65"/>
  </g>` : ''}
</svg>`;
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


/* -------------------------------------------------------------- fish index */

/**
 * The in-game fish index: every fish grouped by rarity, with the real odds.
 *
 * The chance per tier is derived from the weights in FISH rather than hardcoded,
 * so it cannot drift out of step with what rollFish() actually does. Each group's
 * chance is the share of the total weight that falls in that rarity.
 */
/**
 * What you feel the moment the hook goes in.
 *
 * One line per species, so a bite has a voice before the reeling starts. Unknown
 * fish fall back to a rarity-flavoured line, so an old save naming a fish that no
 * longer exists still says something rather than showing "undefined".
 */
export function hookLineFor(fish) {
  const spec = FISH.find((f) => f && f.id === (fish && fish.id));
  if (spec && spec.hook) return spec.hook;
  const idx = RARITY_ORDER.indexOf(fish?.rarity);
  const tier = idx >= 0 ? RARITY_ORDER[idx] : 'Common';
  const extra = tier === 'Common' ? '' : `, and ${tier.toLowerCase()}`;
  return `Something takes the bait. You feel it move${extra}.`;
}

/* ------------------------------------------------------------------ areas */

/**
 * The lakes, in order. Each is a Frutiger world with its own light, and each is
 * harder than the last — a lake is unlocked by clearing the one before it.
 *
 * The palettes are lifted from the site's own five themes so a lake looks like
 * the shell theme it is named for. `locked` marks whether a lake opens from the
 * start; only the first does.
 */
export const AREAS = [
  {
    id: 'aero-lake',
    name: 'Aero Lake',
    theme: 'Frutiger Aero',
    blurb: 'Still, bright water under a very large sun.',
    locked: false,
    trait: null,
    fish: ['glidefin', 'aero-minnow', 'sunscale', 'ripplefin', 'bubbleperch', 'glossdace'],
    palette: {
      skyTop: '#81d4fa', skyMid: '#b3e5fc', skyFloor: '#f4fbff',
      water: '#2f81c4', accent: '#4fc3f7',
      haze: 'rgba(255, 255, 255, 0.75)', sun: 'rgba(255, 255, 255, 0.95)',
    },
  },
  {
    id: 'doric-delta',
    name: 'DORFic Delta',
    theme: 'DORFic',
    blurb: 'Warm orange shallows cut by straight geometric channels.',
    locked: true,
    trait: null,
    fish: ['coralpike', 'duskdarter', 'metro-trout', 'doric-dab', 'orangebarbel', 'emberfin'],
    palette: {
      skyTop: '#f7c894', skyMid: '#fbe0c4', skyFloor: '#fffaf4',
      water: '#c2701f', accent: '#e07b2a',
      haze: 'rgba(255, 240, 224, 0.5)', sun: 'rgba(255, 214, 170, 0.7)',
    },
  },
  {
    id: 'eco-marsh',
    name: 'Eco Marsh',
    theme: 'Eco',
    blurb: 'Green water, dappled light, and things that hide in it.',
    locked: true,
    trait: 'flex',
    traitNote: 'needs a rod that can reach over the reeds',
    fish: ['reedcarp', 'lanternjack', 'mudsole', 'mirrorpike', 'eco-gar', 'coralpike'],
    palette: {
      skyTop: '#a8cf8f', skyMid: '#c8e0b0', skyFloor: '#f6faf0',
      water: '#4e7a35', accent: '#7aa84a',
      haze: 'rgba(255, 255, 255, 0.45)', sun: 'rgba(255, 255, 245, 0.85)',
    },
  },
  {
    id: 'glacier-fjord',
    name: 'Glacier Fjord',
    theme: 'Glacier',
    blurb: 'Pale blue ice water. Everything here is cold and fast.',
    locked: true,
    trait: 'ice',
    traitNote: 'needs a rod that can bore through the ice',
    fish: ['snowsmelt', 'frostfin', 'rimepike', 'blueglass', 'glacier-char', 'mirrorpike'],
    palette: {
      skyTop: '#cfe6f5', skyMid: '#e3f1f9', skyFloor: '#fbfdff',
      water: '#3f7fa8', accent: '#7fc4e8',
      haze: 'rgba(255, 255, 255, 0.8)', sun: 'rgba(255, 255, 255, 1)',
    },
  },
  {
    id: 'dark-aero-deep',
    name: 'Dark Aero Deep',
    theme: 'Dark Aero',
    blurb: 'The bottom of the world, where the light barely reaches.',
    locked: true,
    trait: 'reinforced',
    traitNote: 'needs a rod reinforced enough for the pressure',
    fish: ['deepglow', 'pressurefin', 'voidpike', 'blackmirror', 'lastlantern', 'glacier-char'],
    palette: {
      skyTop: '#0f2027', skyMid: '#122a34', skyFloor: '#0a141a',
      water: '#06222e', accent: '#29b6f6',
      haze: 'rgba(150, 200, 240, 0.08)', sun: 'rgba(180, 225, 255, 0.22)',
    },
  },
];

/**
 * Is this lake open yet?
 *
 * A lake opens once every fish that lives in it has been landed and every rod is
 * owned. The first lake is always open, so a fresh or corrupt save can always fish.
 */
/**
 * Can this rod work this lake?
 *
 * A lake that names a trait can only be fished with a rod carrying it. That is the
 * point of the specialist rods: without one, the lake is shut to you however much
 * money you have. Money buys the trait, but nothing else substitutes for it.
 */
export function rodWorksIn(rodId, areaId) {
  const area = AREAS.find((a) => a.id === areaId) ?? AREAS[0];
  if (!area.trait) return true;
  return (RODS[rodId]?.traits ?? []).includes(area.trait);
}

/** rodWorksIn, with a reason a player can read. */
export function rodCheckIn(rodId, areaId) {
  const area = AREAS.find((a) => a.id === areaId) ?? AREAS[0];
  if (!area.trait) return { ok: true, reason: '' };
  const rod = RODS[rodId];
  if (!rod) return { ok: false, reason: `Unknown rod: ${rodId}` };
  if (rod.traits.includes(area.trait)) return { ok: true, reason: '' };
  return {
    ok: false,
    reason: `${area.name} needs a rod with the ${area.trait} trait. ${rod.name} has none.`,
  };
}

/** Every lake this rod is allowed in, in order. */
export function areasForRod(rodId) {
  return AREAS.filter((a) => rodWorksIn(rodId, a.id));
}

export function areaUnlocked(area, progress) {
  if (!area || area.locked === false) return true;
  const bestiary = progress?.bestiary ?? {};
  const owned = progress?.owned ?? [];
  const allRods = Object.keys(RODS);
  if (allRods.some((id) => !owned.includes(id))) return false;
  // And every species of the lake BEFORE this one. This used to count the fish in
  // the lake being opened, so a lake advertised its own contents before you had
  // earned it, and the gate moved whenever the roster changed.
  const index = AREAS.indexOf(area);
  const previous = index > 0 ? AREAS[index - 1] : null;
  const gate = previous ? previous.fish : area.fish;
  return gate.every((id) => Number(bestiary[id]) > 0);
}

/** How close a player is to opening the next lake, for the locked badge. */
export function areaProgress(area, progress) {
  const bestiary = progress?.bestiary ?? {};
  const index = AREAS.indexOf(area);
  const previous = index > 0 ? AREAS[index - 1] : null;
  const gate = previous ? previous.fish : (area?.fish ?? []);
  const landed = gate.filter((id) => Number(bestiary[id]) > 0).length;
  return {
    landed,
    total: gate.length,
    rods: (progress?.owned ?? []).filter((id) => RODS[id]).length,
    rodTotal: Object.keys(RODS).length,
  };
}

export function fishIndex() {
  const total = FISH.reduce((sum, f) => sum + f.weight, 0);
  return RARITY_ORDER.map((rarity) => {
    const fish = FISH.filter((f) => f.rarity === rarity);
    const chance = fish.reduce((sum, f) => sum + f.weight, 0) / total * 100;
    return {
      rarity,
      colour: RARITY_COLOURS[rarity],
      chance,
      fish,
      // A short label for the index row: the cheapest to the heaviest member.
      from: Math.min(...fish.map((f) => f.minKg)),
      to: Math.max(...fish.map((f) => f.maxKg)),
    };
  });
}

/** One fish's row, with everything the index needs to display it. */
export function fishEntry(fish) {
  return {
    ...fish,
    colour: RARITY_COLOURS[fish.rarity],
    valueRange: [Math.round(fish.minKg * fish.pricePerKg), Math.round(fish.maxKg * fish.pricePerKg)],
  };
}

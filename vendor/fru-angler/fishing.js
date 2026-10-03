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
    control: 0.28, resilience: 0.42, luck: 0.4, lureSpeed: 1.6, maxKg: 8,
    blurb: 'Bends without complaining.',
  },
  carbon: {
    id: 'carbon', name: 'Carbon Float', price: 900,
    control: 0.34, resilience: 0.55, luck: 0.8, lureSpeed: 2.4, maxKg: 20,
    blurb: 'Light, springy, slightly smug.',
  },
  oak: {
    id: 'oak', name: 'Oak Lance', price: 3200,
    control: 0.40, resilience: 0.70, luck: 1.2, lureSpeed: 3.2, maxKg: 45,
    blurb: 'Heavy enough to feel the water.',
  },
  titan: {
    id: 'titan', name: 'Titan Aero', price: 11000,
    control: 0.46, resilience: 0.85, luck: 1.8, lureSpeed: 4.2, maxKg: 120,
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

  const light = `hsl(${h} 88% 74%)`;
  const mid = `hsl(${h} 68% 52%)`;
  const deep = `hsl(${h} 60% 26%)`;
  const { eye } = shape;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"
     role="img" aria-label="A ${spec.name}">
  <defs>
    <linearGradient id="fb" x1="0.15" y1="0" x2="0.75" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.5" stop-color="${mid}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="fs" cx="0.3" cy="0.24" r="0.62">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".62"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- the Aero pond behind the fish -->
  <rect width="120" height="80" rx="14" fill="#e1f5fe"/>
  <circle cx="98" cy="16" r="13" fill="#fff9c4" opacity=".7"/>
  <ellipse cx="60" cy="72" rx="52" ry="7" fill="#b3e5fc" opacity=".8"/>

  <!-- tail first, so the body overlaps it -->
  <path class="tail" d="${shape.tail}" fill="${deep}" opacity=".85"/>
  <path class="fin" d="${shape.fin}" fill="${mid}"/>
  <path class="body" d="${shape.body}" fill="url(#fb)"/>
  <g class="stripe" stroke="${deep}" stroke-width="1.6" opacity=".38"
     stroke-linecap="round" fill="none">
    <path d="${shape.stripe}"/>
  </g>
  <path class="belly" d="M40 52 C56 60 76 58 88 48 C76 58 56 62 40 54 Z"
        fill="#ffffff" opacity=".3"/>
  <circle class="eye" cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="#ffffff"/>
  <circle cx="${eye.cx + 0.8}" cy="${eye.cy}" r="${(eye.r * 0.5).toFixed(2)}" fill="#06334f"/>
  <ellipse class="sheen" cx="52" cy="30" rx="16" ry="8" fill="url(#fs)"/>
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

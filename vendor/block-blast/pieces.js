/**
 * The blocks Block Blast deals.
 *
 * Each block is a list of [x, y] cells from its own top-left. No rotation: that
 * is the rule of the real game, and a 3x2 rectangle stays a 3x2 rectangle.
 *
 * `weight` is how often the block is drawn. The 3x3 is deliberately the rarest,
 * because a 3x3 with no 3x3 hole left on the board ends the run.
 *
 * Blocks carry a hue, not a number. Clearing lines is Block Blast; merging
 * adjacent numbered blocks is the separate game Block Blast 2048.
 */

export const PIECES = {
  // 1 cell
  dot: { cells: [[0, 0]], weight: 30, hue: 195 },
  // 2 cells
  i2: { cells: [[0, 0], [1, 0]], weight: 18, hue: 200 },
  v2: { cells: [[0, 0], [0, 1]], weight: 18, hue: 168 },
  // 3 cells
  i3: { cells: [[0, 0], [1, 0], [2, 0]], weight: 10, hue: 210 },
  v3: { cells: [[0, 0], [0, 1], [0, 2]], weight: 10, hue: 185 },
  l3: { cells: [[0, 0], [0, 1], [1, 1]], weight: 8, hue: 155 },
  j3: { cells: [[1, 0], [0, 1], [1, 1]], weight: 8, hue: 48 },
  // 4 cells
  o2: { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 9, hue: 88 },
  t4: { cells: [[0, 0], [1, 0], [2, 0], [1, 1]], weight: 6, hue: 265 },
  s4: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], weight: 5, hue: 20 },
  z4: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], weight: 5, hue: 300 },
  i4: { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 6, hue: 235 },
  v4: { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 6, hue: 250 },
  l4: { cells: [[0, 0], [0, 1], [0, 2], [1, 2]], weight: 5, hue: 32 },
  // 5 cells
  i5: { cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 4, hue: 275 },
  // 9 cells: the run-killer, so it is the rarest block in the set
  big: { cells: [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ], weight: 1, hue: 320 },
};

export const PIECE_KEYS = Object.keys(PIECES);

/** Total weight across every block. */
export const TOTAL_WEIGHT = PIECE_KEYS.reduce((sum, k) => sum + PIECES[k].weight, 0);

/**
 * Draw a block key by weight.
 *
 * `rng` returns 0..1 and is injected rather than calling Math.random, so a test can
 * pin the result. Out-of-range values are clamped so a bad rng cannot index off
 * the end of the list.
 */
export function weightedPick(rng = Math.random) {
  const roll = Math.min(Math.max(rng(), 0), 0.999999) * TOTAL_WEIGHT;
  let cursor = roll;
  for (const key of PIECE_KEYS) {
    cursor -= PIECES[key].weight;
    if (cursor <= 0) return key;
  }
  return PIECE_KEYS[PIECE_KEYS.length - 1];
}
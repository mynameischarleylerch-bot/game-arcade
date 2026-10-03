/**
 * Block Blast rules. Pure functions over a plain board — no DOM, no timers, no
 * Math.random. Every function that needs randomness takes an injected `rng`, so
 * the whole game is testable deterministically.
 *
 * The board is SIZE x SIZE of 0 (empty) or a hue number. A hue is the block's
 * identity on screen; it has no effect on the rules.
 */
import { PIECES, PIECE_KEYS, weightedPick } from './pieces.js';

/** The grid is 8x8, as in the real game. */
export const SIZE = 8;

/** How many blocks you are dealt at a time. */
export const TRAY_SIZE = 3;

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cellAt(board, x, y) {
  return board[y]?.[x] ?? 0;
}

/** Every cell in bounds and empty. This is the single rule both preview and drop use. */
export function inBounds(board, cells, ox, oy) {
  return cells.every(([dx, dy]) => {
    const x = ox + dx;
    const y = oy + dy;
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE && board[y][x] === 0;
  });
}

export function canPlace(board, cells, ox, oy) {
  return inBounds(board, cells, ox, oy);
}

export function widthOf(cells) {
  return Math.max(...cells.map(([x]) => x)) + 1;
}

export function heightOf(cells) {
  return Math.max(...cells.map(([, y]) => y)) + 1;
}

/**
 * Write a block onto the board, returning a NEW board. The original is untouched,
 * so a caller can render a preview and then commit or discard without a copy.
 * An illegal placement returns the board it was given, unchanged.
 */
export function place(board, cells, ox, oy, hue) {
  if (!canPlace(board, cells, ox, oy)) return board;
  const next = board.map((row) => [...row]);
  for (const [dx, dy] of cells) next[oy + dy][ox + dx] = hue;
  return next;
}
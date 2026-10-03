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

/* ----------------------------------------------------------------- clears */

/** Every complete row and column in the board. */
export function fullLines(board) {
  const rows = [];
  const cols = [];
  for (let y = 0; y < SIZE; y += 1) {
    if (board[y].every((cell) => cell !== 0)) rows.push(y);
  }
  for (let x = 0; x < SIZE; x += 1) {
    let full = true;
    for (let y = 0; y < SIZE; y += 1) {
      if (board[y][x] === 0) { full = false; break; }
    }
    if (full) cols.push(x);
  }
  return { rows, cols };
}

/** Empty out the given rows and columns. The intersection is emptied once. */
export function clearLines(board, { rows, cols }) {
  if (rows.length === 0 && cols.length === 0) return board;
  const next = board.map((row) => [...row]);
  for (const y of rows) for (let x = 0; x < SIZE; x += 1) next[y][x] = 0;
  for (const x of cols) for (let y = 0; y < SIZE; y += 1) next[y][x] = 0;
  return next;
}

/* ---------------------------------------------------------------- scoring */

/** Placing a block earns one point per cell it covers. */
export function scorePlacement(cellCount) {
  return cellCount;
}

/** Points per block in a line clear, before the combo multiplier. */
export const POINTS_PER_LINE_CELL = 10;

export function scoreLines(lineCount, combo) {
  return lineCount * SIZE * POINTS_PER_LINE_CELL * (1 + combo);
}

/**
 * Resolve one placement: score it, clear anything it completed, move the combo.
 *
 * The combo rises by one when the placement cleared a line and resets to zero when
 * it did not. That reset is what makes it a combo rather than a permanent bonus.
 *
 * The new combo is used to score the clear, so clearing raises your multiplier
 * from the first clear rather than after it.
 */
export function applyMove(state, boardAfterPlacement, cellCount) {
  const cleared = fullLines(boardAfterPlacement);
  const lineCount = cleared.rows.length + cleared.cols.length;
  const combo = lineCount > 0 ? state.combo + 1 : 0;
  const gained = scorePlacement(cellCount) + scoreLines(lineCount, combo);
  return {
    score: state.score + gained,
    combo,
    board: clearLines(boardAfterPlacement, cleared),
    cleared,
  };
}

/* ---------------------------------------------------------------- dealing */

/** Can this block go anywhere on the board at all? */
export function fitsAnywhere(board, cells) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (canPlace(board, cells, x, y)) return true;
    }
  }
  return false;
}

/** Is there at least one placeable block in this tray? */
export function hasAnyMove(board, keys) {
  return keys.some((key) => fitsAnywhere(board, PIECES[key].cells));
}

/**
 * Deal TRAY_SIZE blocks.
 *
 * Returns the array of keys, with a `dead` flag attached. `dead` is true when any
 * dealt block cannot be placed anywhere — the real game's game-over condition.
 *
 * It is checked against the board as it stands right now, before the player has had
 * a chance to use anything, which is what makes a 3x3 arriving into a cluttered
 * board fatal.
 */
export function dealTray(board, rng = Math.random) {
  const keys = Array.from({ length: TRAY_SIZE }, () => weightedPick(rng));
  keys.dead = !hasAnyMove(board, keys);
  return keys;
}

/** A fresh run: empty board, no score, a full tray. */
export function newGame(rng = Math.random) {
  const board = emptyBoard();
  const tray = dealTray(board, rng);
  return { board, score: 0, combo: 0, tray, over: tray.dead === true };
}

/**
 * Start the next round: a new tray is dealt, while the board and score carry over.
 * The run is over if the new tray holds a block that cannot be placed.
 */
export function nextRound(game, rng = Math.random) {
  if (game.over) return game;
  const tray = dealTray(game.board, rng);
  return {
    board: game.board,
    score: game.score,
    combo: game.combo,
    tray,
    over: tray.dead === true,
  };
}

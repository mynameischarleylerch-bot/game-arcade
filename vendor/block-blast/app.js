/**
 * Block Blast — DOM, rendering and input.
 *
 * All the rules live in blast.js. This file only draws what the rules decide and
 * turns pointer input into placements, so the rules stay testable without a DOM.
 *
 * The interaction is click-then-click: pick a block up, then click a cell to drop
 * it. That is deliberate rather than a shortcut — true pointer-drag is listed as a
 * follow-up, and it must keep using canPlace() for its preview or the ghost block
 * will promise moves the game then refuses.
 */
import {
  SIZE, canPlace, place, applyMove, nextRound, newGame, widthOf, heightOf,
} from './blast.js';
import { PIECES } from './pieces.js';

const el = (id) => document.getElementById(id);
const ui = {
  board: el('board'), tray: el('tray'), score: el('score'),
  combo: el('combo'), best: el('best'), over: el('over'),
  final: el('final'), again: el('again'),
};

const SAVE_KEY = 'block-blast-save';

let game = newGame();
/** The block picked up but not yet dropped, or null. */
let held = null;
/** The lines cleared by the last move, for the burst effect. */
let lastClear = { rows: [], cols: [] };

/* ------------------------------------------------------------------ score */

function loadBest() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const value = raw ? JSON.parse(raw).best : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;   // blocked or corrupt storage: the run still works
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ best }));
  } catch { /* the record is a nicety, not a requirement */ }
}

/* --------------------------------------------------------------- painting */

function cellAt(x, y) {
  return game.board[y][x];
}

/** Draw the whole board: 64 cells, rebuilt whenever the board actually changes. */
function paintBoard() {
  const frag = document.createDocumentFragment();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      const hue = cellAt(x, y);
      cell.dataset.filled = hue === 0 ? 'false' : 'true';
      if (hue !== 0) cell.style.setProperty('--hue', String(hue));
      frag.appendChild(cell);
    }
  }
  ui.board.textContent = '';
  ui.board.appendChild(frag);
}

/** One tray block, laid out from its cell list. */
function paintTrayBlock(key, index) {
  const piece = PIECES[key];
  const wrap = document.createElement('div');
  wrap.className = 'tray__block';
  wrap.dataset.key = key;
  wrap.dataset.index = String(index);
  wrap.style.setProperty('--hue', String(piece.hue));
  wrap.style.setProperty('--w', String(widthOf(piece.cells)));
  wrap.style.setProperty('--h', String(heightOf(piece.cells)));
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label',
    `Block ${index + 1}, ${widthOf(piece.cells)} by ${heightOf(piece.cells)}`);

  for (const [dx, dy] of piece.cells) {
    const cell = document.createElement('span');
    cell.className = 'block__cell';
    cell.style.left = `${dx * (100 / widthOf(piece.cells))}%`;
    cell.style.top = `${dy * (100 / heightOf(piece.cells))}%`;
    cell.style.width = `${100 / widthOf(piece.cells)}%`;
    cell.style.height = `${100 / heightOf(piece.cells)}%`;
    wrap.appendChild(cell);
  }
  return wrap;
}

function paintTray() {
  ui.tray.textContent = '';
  game.tray.forEach((key, index) => ui.tray.appendChild(paintTrayBlock(key, index)));
}

function paintHud() {
  ui.score.textContent = String(game.score);
  ui.combo.textContent = game.combo > 0 ? `combo x${game.combo}` : '';
  const best = Math.max(loadBest(), game.score);
  ui.best.textContent = String(best);
  ui.over.hidden = !game.over;
  if (game.over) ui.final.textContent = String(game.score);
  return best;
}

/**
 * Burst over every cell that just cleared.
 *
 * Uses offsetLeft/offsetTop, which jsdom reports as 0 — so this is skipped when
 * the board has no layout rather than scattering blooms at the origin.
 */
function paintBursts() {
  const cleared = lastClear.rows.length + lastClear.cols.length;
  if (cleared === 0) return;

  const cells = [];
  for (const y of lastClear.rows) for (let x = 0; x < SIZE; x += 1) cells.push([x, y]);
  for (const x of lastClear.cols) for (let y = 0; y < SIZE; y += 1) cells.push([x, y]);

  for (const [x, y] of cells) {
    const cell = ui.board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell || cell.offsetWidth === 0) continue;   // no layout: nothing to burst
    const burst = document.createElement('span');
    burst.className = 'burst';
    burst.style.width = `${cell.offsetWidth}px`;
    burst.style.height = `${cell.offsetWidth}px`;
    burst.style.left = `${cell.offsetLeft - 8}px`;
    burst.style.top = `${cell.offsetTop - 8}px`;
    ui.board.appendChild(burst);
  }
}

function repaint() {
  paintBoard();
  paintTray();
  const best = paintHud();
  paintBursts();
  if (best > loadBest()) saveBest(best);
}

/* ------------------------------------------------------------------ input */

/** Pick a block up from the tray. */
function pickUp(node) {
  if (game.over || held) return;
  const index = Number(node.dataset.index);
  held = { key: game.tray[index], index };
  node.classList.add('is-held');
}

/** Put a held block back, e.g. after a refused drop. */
function releaseHeld() {
  if (!held) return;
  ui.tray.querySelector(`[data-index="${held.index}"]`)?.classList.remove('is-held');
  held = null;
}

/** Clear any preview highlight. */
function clearPreview() {
  for (const cell of ui.board.querySelectorAll('.is-target, .is-blocked')) {
    cell.classList.remove('is-target', 'is-blocked');
  }
}

/**
 * Highlight where a held block would land.
 *
 * The WHOLE placement is checked with canPlace, not cell by cell. Marking each
 * cell by whether it happens to be free meant a 3-wide block hovering at x=6 lit
 * up the anchor cell even though the block hung off the right edge — so the
 * preview promised a move the drop then refused.
 */
function preview(cell) {
  clearPreview();
  if (!held || !cell || game.over) return;
  const piece = PIECES[held.key];
  const ox = Number(cell.dataset.x);
  const oy = Number(cell.dataset.y);
  ui.board.style.setProperty('--hue', String(piece.hue));

  const legal = canPlace(game.board, piece.cells, ox, oy);
  for (const [dx, dy] of piece.cells) {
    const x = ox + dx;
    const y = oy + dy;
    // Off-board cells have no element to mark; the anchor still turns red, which
    // is what tells the player the drop will not take.
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
    const target = ui.board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (!target) continue;
    target.classList.add(legal ? 'is-target' : 'is-blocked');
  }
}

/**
 * Drop a held block onto a grid cell.
 *
 * The cell you drop on is the block's top-left cell, which is the least surprising
 * mapping between where you aim and where it lands. An illegal drop changes
 * nothing and the block returns to the tray.
 */
function dropOn(cell) {
  clearPreview();
  if (!held || game.over) return;

  const piece = PIECES[held.key];
  const next = place(game.board, piece.cells, Number(cell.dataset.x), Number(cell.dataset.y), piece.hue);

  if (next === game.board) { releaseHeld(); repaint(); return; }   // refused

  const result = applyMove({ score: game.score, combo: game.combo }, next, piece.cells.length);
  game.board = result.board;
  game.score = result.score;
  game.combo = result.combo;
  lastClear = result.cleared;

  // The block is spent, so close the gap in the tray.
  game.tray.splice(held.index, 1);
  held = null;

  if (game.tray.length === 0) game = nextRound(game);
  repaint();
}

function restart() {
  game = newGame();
  held = null;
  lastClear = { rows: [], cols: [] };
  repaint();
}

ui.board.addEventListener('mousedown', (event) => {
  const cell = event.target.closest('.cell');
  if (cell) dropOn(cell);
});

ui.board.addEventListener('mousemove', (event) => {
  if (!held) return;
  preview(event.target.closest('.cell'));
});

ui.tray.addEventListener('mousedown', (event) => {
  const node = event.target.closest('.tray__block');
  if (node) pickUp(node);
});

// Keyboard: Tab to a block, Enter or Space to pick it up.
addEventListener('keydown', (event) => {
  if (event.code === 'KeyR') { restart(); return; }
  const node = event.target?.closest?.('.tray__block');
  if (node && (event.code === 'Enter' || event.code === 'Space')) {
    pickUp(node);
    event.preventDefault();
  }
});

ui.again.addEventListener('click', restart);

repaint();
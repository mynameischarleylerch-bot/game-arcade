/**
 * Block Blast rules — pure logic, no DOM.
 *
 * Blocks are coordinate lists ([x, y] cells), not bitmaps: a drag hit-test and a
 * grid write both need the cell list, and a bitmap would make both re-derive it.
 *
 * These blocks carry a hue, NOT a number. Block Blast clears lines; merging
 * adjacent numbered blocks is the separate game Block Blast 2048.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PIECE_KEYS, weightedPick } from '../vendor/block-blast/pieces.js';
import {
  SIZE, emptyBoard, inBounds, canPlace, place, cellAt, widthOf, heightOf,
  fullLines, clearLines, scorePlacement, scoreLines, applyMove,
} from '../vendor/block-blast/blast.js';

test('every block is a list of distinct in-range cells', () => {
  for (const key of PIECE_KEYS) {
    const cells = PIECES[key].cells;
    assert.ok(Array.isArray(cells) && cells.length > 0, `${key} has no cells`);
    for (const [x, y] of cells) {
      assert.ok(Number.isInteger(x) && x >= 0, `${key} has a bad x: ${x}`);
      assert.ok(Number.isInteger(y) && y >= 0, `${key} has a bad y: ${y}`);
    }
    const seen = new Set(cells.map(([x, y]) => `${x},${y}`));
    assert.equal(seen.size, cells.length, `${key} lists a cell twice`);
  }
});

test('blocks are square-ish and never wider than the board', () => {
  for (const key of PIECE_KEYS) {
    const xs = PIECES[key].cells.map(([x]) => x);
    const ys = PIECES[key].cells.map(([, y]) => y);
    const w = Math.max(...xs) + 1;
    const h = Math.max(...ys) + 1;
    assert.ok(w <= 8 && h <= 8, `${key} is ${w}x${h}, larger than the 8x8 board`);
    assert.ok(Math.max(w, h) <= 5, `${key} is ${w}x${h}, too big to place usefully`);
  }
});

test('the block set includes the shapes Block Blast actually deals', () => {
  // A single cell, the dominoes, the 2x2, the awkward L, the 3x3 and a long bar.
  for (const key of ['dot', 'i2', 'v2', 'o2', 'l3', 'j3', 't4', 's4', 'big', 'i5']) {
    assert.ok(PIECES[key], `missing block shape: ${key}`);
  }
});

test('the 3x3 is the rarest block, because it is the run-killer', () => {
  // If a 3x3 arrives with no 3x3 hole left, the run is over. It must be rare.
  const weights = PIECE_KEYS.map((k) => PIECES[k].weight);
  assert.equal(PIECES.big.weight, Math.min(...weights),
    'the 3x3 should be the rarest block');
});

test('weightedPick is deterministic and always returns a real key', () => {
  // A fixed rng means a fixed answer — this is what makes the rules testable.
  for (let roll = 0; roll < 500; roll += 1) {
    const key = weightedPick(() => roll / 500);
    assert.ok(PIECE_KEYS.includes(key), `picked an unknown block: ${key}`);
  }
  assert.equal(weightedPick(() => 0), PIECE_KEYS[0]);
  assert.equal(weightedPick(() => 0.999999), PIECE_KEYS[PIECE_KEYS.length - 1]);
});

test('weightedPick respects the weights over many rolls', () => {
  const counts = {};
  for (let i = 0; i < 20000; i += 1) {
    const key = weightedPick(() => ((i * 2654435761) % 100000) / 100000);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  assert.ok(counts.big < counts.dot * 0.25,
    `the 3x3 (${counts.big}) should be far rarer than the single cell (${counts.dot})`);
});

test('the board is 8x8 and starts empty', () => {
  assert.equal(SIZE, 8);
  const board = emptyBoard();
  assert.equal(board.length, 8);
  for (const row of board) {
    assert.equal(row.length, 8);
    assert.deepEqual(row, Array(8).fill(0));
  }
});

test('a block lands only when every cell is in bounds and empty', () => {
  const cells = [[0, 0], [1, 0]];
  assert.equal(canPlace(emptyBoard(), cells, 0, 0), true);
  assert.equal(canPlace(emptyBoard(), cells, 6, 0), true, 'a domino fits flush right at x=6');
  assert.equal(canPlace(emptyBoard(), cells, 7, 0), false,
    'a domino cannot start at x=7: its second cell would be at x=8');
  assert.equal(canPlace(emptyBoard(), cells, 8, 0), false, 'hanging off the right edge');
  assert.equal(canPlace(emptyBoard(), cells, 0, 8), false, 'hanging off the bottom');
  assert.equal(canPlace(emptyBoard(), cells, -1, 0), false, 'hanging off the left edge');

  const blocked = emptyBoard();
  blocked[0][1] = 'x';
  assert.equal(canPlace(blocked, cells, 0, 0), false, 'a domino needs two empty cells');
});

test('placing writes a hue and returns a new board', () => {
  const before = emptyBoard();
  const after = place(before, [[0, 0], [1, 0]], 3, 4, 195);
  assert.equal(cellAt(after, 3, 4), 195);
  assert.equal(cellAt(after, 4, 4), 195);
  assert.equal(cellAt(before, 3, 4), 0, 'the original board must not be mutated');
});

test('placing is refused rather than corrupting the board', () => {
  const board = emptyBoard();
  board[2][2] = 'x';
  assert.equal(place(board, [[0, 0]], 2, 2, 195), board,
    'an illegal place returns the board unchanged');
});

test('inBounds and the block extents agree', () => {
  assert.equal(inBounds(emptyBoard(), [[0, 0], [1, 1]], 7, 7), false);
  assert.equal(inBounds(emptyBoard(), [[0, 0], [1, 1]], 6, 6), true);
  assert.equal(widthOf([[0, 0], [2, 1]]), 3);
  assert.equal(heightOf([[0, 0], [2, 1]]), 2);
});

/** A board with every cell of the given rows filled. */
function boardWithRows(rows) {
  const b = emptyBoard();
  for (const y of rows) for (let x = 0; x < SIZE; x += 1) b[y][x] = 1;
  return b;
}

test('a full row is detected, a nearly full row is not', () => {
  const { rows } = fullLines(boardWithRows([0, 3]));
  assert.deepEqual(rows, [0, 3]);

  const nearly = boardWithRows([2]);
  nearly[2][4] = 0;
  assert.deepEqual(fullLines(nearly).rows, [], 'one gap means the row is not full');
});

test('a full column is detected too', () => {
  const b = emptyBoard();
  for (let y = 0; y < SIZE; y += 1) b[y][5] = 1;
  const { rows, cols } = fullLines(b);
  assert.deepEqual(rows, []);
  assert.deepEqual(cols, [5]);
});

test('a cell where a row and column cross is cleared once, not twice', () => {
  const b = emptyBoard();
  for (let x = 0; x < SIZE; x += 1) b[4][x] = 1;
  for (let y = 0; y < SIZE; y += 1) b[y][6] = 1;
  b[0][0] = 1;   // filled, and in neither the full row nor the full column
  const after = clearLines(b, fullLines(b));
  assert.equal(cellAt(after, 6, 4), 0, 'the intersection must be emptied');
  assert.equal(cellAt(after, 7, 0), 0, 'and the cleared lines are gone');
  assert.equal(cellAt(after, 0, 0), 1, 'a filled cell outside both lines survives');
  assert.equal(cellAt(after, 5, 5), 0, 'an untouched cell is still empty');
});

test('clearing nothing leaves the board alone', () => {
  const b = boardWithRows([]);
  assert.deepEqual(clearLines(b, { rows: [], cols: [] }), b);
});

test('placement scores one point per cell', () => {
  assert.equal(scorePlacement(1), 1);
  assert.equal(scorePlacement(9), 9, 'the 3x3 is nine cells, so nine points');
  assert.equal(scorePlacement(0), 0);
});

test('a line clear scores per block, multiplied by the combo', () => {
  assert.equal(scoreLines(1, 0), 10 * SIZE);
  assert.equal(scoreLines(2, 0), 20 * SIZE, 'two lines double it');
  assert.equal(scoreLines(1, 1), 10 * SIZE * 2, 'combo 1 doubles');
  assert.equal(scoreLines(1, 3), 10 * SIZE * 4, 'combo 3 quadruples');
});

test('the combo rises on a clear and resets when a round clears nothing', () => {
  let state = { score: 0, combo: 0 };

  state = applyMove(state, boardWithRows([0]), 4);
  assert.equal(state.combo, 1, 'clearing a line raises the combo');
  assert.ok(state.score > 0);

  // A round that clears nothing: back to zero. That reset is what makes it a
  // combo rather than a permanent multiplier.
  state = applyMove(state, emptyBoard(), 4);
  assert.equal(state.combo, 0, 'a round with no clear resets the combo');
});

test('applyMove is total: it returns the score gained, the combo and the cleared lines', () => {
  // Scored at the new combo (1), so the first clear is already doubled. That is
  // what applyMove documents: a clear raises your multiplier as it pays out.
  const result = applyMove({ score: 100, combo: 0 }, boardWithRows([7]), 4);
  assert.equal(result.score, 100 + 4 + 10 * SIZE * 2);
  assert.equal(result.combo, 1);
  assert.equal(result.cleared.rows.length + result.cleared.cols.length, 1);
  // And the board it hands back has that line gone.
  assert.deepEqual(result.board[7], Array(SIZE).fill(0));
});

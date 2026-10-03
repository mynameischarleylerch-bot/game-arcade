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

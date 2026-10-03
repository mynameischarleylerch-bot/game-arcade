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

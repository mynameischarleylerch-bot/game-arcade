import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIndex, nextIndex, isAdjacent } from '../vendor/seal-scroller/scroll.js';

test('clampIndex keeps the index inside the feed', () => {
  assert.equal(clampIndex(-1, 20), 0);
  assert.equal(clampIndex(0, 20), 0);
  assert.equal(clampIndex(19, 20), 19);
  assert.equal(clampIndex(99, 20), 19);
});

test('clampIndex handles an empty feed without going negative', () => {
  assert.equal(clampIndex(3, 0), 0);
});

test('nextIndex advances down and wraps like a Shorts feed', () => {
  assert.equal(nextIndex(0, 20, 1), 1);
  assert.equal(nextIndex(19, 20, 1), 0, 'last item wraps to the top');
  assert.equal(nextIndex(0, 20, -1), 19, 'up from the top wraps to the last');
});

test('isAdjacent detects which neighbours to preload', () => {
  assert.equal(isAdjacent(0, 0, 1), true);
  assert.equal(isAdjacent(0, 1, 1), true);
  assert.equal(isAdjacent(0, 2, 1), false);
});
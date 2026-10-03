/**
 * Block Blast, driven through a real DOM with jsdom.
 *
 * The page's module script is stripped and the module is imported here instead, so
 * the wiring is under test rather than the markup. Pointer input is simulated
 * with the mouse events jsdom understands, which is the path a real click takes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PIECES } from '../vendor/block-blast/pieces.js';

const PAGE = readFileSync(
  new URL('../vendor/block-blast/index.html', import.meta.url), 'utf8',
).replace(/<script[\s\S]*?<\/script>/g, '');

/** Boot one instance. A pinned rng makes every block it deals predictable. */
async function boot(run = 1, seed = 0.5) {
  const dom = new JSDOM(PAGE, { url: 'http://localhost:8080/vendor/block-blast/index.html' });
  const win = dom.window;
  globalThis.Math.random = () => seed;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.requestAnimationFrame = () => {};
  await import(`../vendor/block-blast/app.js?run=${run}`);
  return win;
}

/** The rendered cell at (x, y). */
function cellAt(doc, x, y) {
  return doc.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function mouse(win, type, target) {
  // Always dispatch ON the element. Dispatching on document leaves
  // event.target.closest('.cell') with nothing to find, so a drop never fires.
  target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }));
}

test('the board renders 64 empty cells', async () => {
  const win = await boot(1);
  assert.equal(win.document.querySelectorAll('#board .cell').length, 64);
  assert.equal(win.document.querySelectorAll('#board .cell[data-filled="true"]').length, 0);
  assert.equal(win.document.getElementById('score').textContent, '0');
});

test('the tray shows three blocks', async () => {
  const win = await boot(2);
  assert.equal(win.document.querySelectorAll('#tray .tray__block').length, 3);
});

test('click a block then a cell, and the block lands and scores', async () => {
  const win = await boot(3);
  const doc = win.document;
  const block = doc.querySelector('#tray .tray__block');
  mouse(win, 'mousedown', block);
  assert.ok(block.classList.contains('is-held'), 'the block should be held');

  mouse(win, 'mousedown', cellAt(doc, 0, 0));

  assert.ok(doc.querySelectorAll('#board .cell[data-filled="true"]').length > 0,
    'the block should have landed');
  assert.ok(Number(doc.getElementById('score').textContent) > 0,
    'and scoring should have moved');
  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 2,
    'a spent block leaves the tray');
});

test('a drop that overlaps is refused and the block returns to the tray', async () => {
  const win = await boot(4);
  const doc = win.document;

  // Place the first block for real, at (0,0). Going through the public
  // interaction matters: hand-editing the DOM would leave the app's own board
  // empty, and the rules read that one, so the refusal could never happen.
  mouse(win, 'mousedown', doc.querySelector('#tray .tray__block'));
  mouse(win, 'mousedown', cellAt(doc, 0, 0));
  const afterFirst = doc.querySelectorAll('#board .cell[data-filled="true"]').length;
  assert.ok(afterFirst > 0, 'precondition: the first block landed');
  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 2);

  // Now drop the next block on the same cell. Overlap is always illegal.
  mouse(win, 'mousedown', doc.querySelector('#tray .tray__block'));
  mouse(win, 'mousedown', cellAt(doc, 0, 0));

  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 2,
    'a refused block must stay in the tray, not be consumed');
  assert.equal(doc.querySelectorAll('#board .cell[data-filled="true"]').length, afterFirst,
    'and the board must not have grown');
});

test('restarting gives a clean board and a zero score', async () => {
  const win = await boot(5);
  const doc = win.document;
  const block = doc.querySelector('#tray .tray__block');
  mouse(win, 'mousedown', block);
  mouse(win, 'mousedown', cellAt(doc, 2, 2));
  assert.ok(Number(doc.getElementById('score').textContent) > 0, 'precondition: something landed');

  mouse(win, 'click', doc.getElementById('again'));
  assert.equal(doc.querySelectorAll('#board .cell[data-filled="true"]').length, 0,
    'restart clears the board');
  assert.equal(doc.getElementById('score').textContent, '0');
  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 3, 'and refills the tray');
});

test('holding a block previews where it lands', async () => {
  const win = await boot(6);
  const doc = win.document;
  const block = doc.querySelector('#tray .tray__block');
  const heldKey = block.dataset.key;

  mouse(win, 'mousedown', block);
  mouse(win, 'mousemove', cellAt(doc, 3, 3));

  const targets = doc.querySelectorAll('#board .cell.is-target');
  assert.ok(targets.length > 0, 'a legal cell should preview the landing cells');

  // The preview must cover the cells of the block actually held.
  const piece = PIECES[heldKey];
  assert.equal(targets.length, piece.cells.length,
    `previewing ${heldKey} should cover ${piece.cells.length} cells, got ${targets.length}`);
});

test('the preview marks a cell the block cannot use as blocked, not as valid', async () => {
  const win = await boot(7);
  const doc = win.document;

  // Land a block, so there is something to overlap.
  mouse(win, 'mousedown', doc.querySelector('#tray .tray__block'));
  mouse(win, 'mousedown', cellAt(doc, 0, 0));

  const occupied = doc.querySelector('#board .cell[data-filled="true"]');
  assert.ok(occupied, 'precondition: something is on the board');

  mouse(win, 'mousedown', doc.querySelector('#tray .tray__block'));
  mouse(win, 'mousemove', occupied);

  const blocked = doc.querySelector('#board .cell.is-blocked');
  assert.ok(blocked, 'an occupied cell must be marked blocked');
  assert.equal(doc.querySelector('#board .cell.is-blocked')?.dataset.filled, 'true');
});

test('the preview is cleared once the block is dropped', async () => {
  const win = await boot(8);
  const doc = win.document;
  mouse(win, 'mousedown', doc.querySelector('#tray .tray__block'));
  mouse(win, 'mousemove', cellAt(doc, 2, 2));
  assert.ok(doc.querySelectorAll('#board .is-target, #board .is-blocked').length > 0,
    'precondition: a preview is showing');

  mouse(win, 'mousedown', cellAt(doc, 6, 6));
  assert.equal(doc.querySelectorAll('#board .is-target, #board .is-blocked').length, 0,
    'the preview must not survive the drop');
});

test('the preview never promises a move the game would refuse', async () => {
  // The strong property: every cell the preview lights up must genuinely be in
  // bounds and empty. If that holds, the drop cannot be refused — the preview
  // and the drop use the same rule, so they cannot disagree.
  const win = await boot(9);
  const doc = win.document;
  const block = doc.querySelector('#tray .tray__block');
  const piece = PIECES[block.dataset.key];

  mouse(win, 'mousedown', block);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      mouse(win, 'mousemove', cellAt(doc, x, y));
      const shown = [...doc.querySelectorAll('#board .cell.is-target')]
        .map((c) => [Number(c.dataset.x), Number(c.dataset.y)]);

      for (const [cx, cy] of shown) {
        // Marked cells exist in the DOM, so they are in bounds by construction.
        // What must hold is that they are genuinely free.
        const cell = cellAt(doc, cx, cy);
        assert.equal(cell.dataset.filled, 'false',
          `preview lit ${cx},${cy}, but that cell is occupied`);
      }
      // Either the whole block fits (and every cell is lit) or none of it is.
      assert.ok(shown.length === 0 || shown.length === piece.cells.length,
        `hovering ${x},${y} lit ${shown.length} of ${piece.cells.length} cells — ` +
        'a partial preview would promise a move that cannot be made');
    }
  }
});

test('placing a whole tray refills it with three new blocks', async () => {
  const win = await boot(10);
  const doc = win.document;

  /** Place the held block at the first legal cell; returns false if none. */
  function placeHeld() {
    const block = doc.querySelector('#tray .tray__block');
    if (!block) return false;
    mouse(win, 'mousedown', block);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        mouse(win, 'mousemove', cellAt(doc, x, y));
        if (!doc.querySelector('#board .cell.is-target')) continue;
        mouse(win, 'mousedown', cellAt(doc, x, y));
        return true;
      }
    }
    mouse(win, 'mousedown', block);   // put it back
    return false;
  }

  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 3);

  // Place all three. The tray empties, then refills.
  for (let i = 0; i < 3; i += 1) {
    const before = doc.querySelectorAll('#tray .tray__block').length;
    if (before === 0) break;
    assert.equal(placeHeld(), true, `block ${i + 1} of the tray should have placed`);
  }

  assert.equal(doc.querySelectorAll('#tray .tray__block').length, 3,
    'an emptied tray is refilled with three new blocks');
  assert.ok(Number(doc.getElementById('score').textContent) > 0,
    'placing scored something');
  assert.equal(doc.getElementById('over').hidden, true, 'the run continues');
});

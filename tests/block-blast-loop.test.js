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

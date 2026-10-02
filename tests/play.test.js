import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initPlayer } from '../src/play.js';

function makeDom() {
  return new JSDOM(
    `<!doctype html><html><head><title>arcade</title></head><body>
       <a id="back" href="./index.html">&larr; All games</a>
       <h1 id="title"></h1>
       <p id="meta"></p>
       <button id="fullscreen" type="button">Fullscreen</button>
       <div id="stage"><iframe id="frame" title="game"></iframe></div>
     </body></html>`,
    { url: 'https://example.test/game-arcade/play.html?game=demo-snake' },
  );
}

const game = {
  slug: 'demo-snake',
  title: 'Demo Snake',
  playUrl: './vendor/demo-snake/index.html',
  controls: 'Arrow keys',
  year: 2026,
  repoUrl: 'https://github.com/karin/demo-snake',
};

test('loads the game into the iframe and fills in the chrome', () => {
  const dom = makeDom();
  initPlayer({ window: dom.window, config: { games: [game] }, slug: 'demo-snake' });
  const { document } = dom.window;
  assert.equal(document.getElementById('frame').getAttribute('src'), './vendor/demo-snake/index.html');
  assert.equal(document.getElementById('title').textContent, 'Demo Snake');
  assert.match(document.getElementById('meta').textContent, /Arrow keys/);
  assert.equal(document.title, 'Demo Snake — Arcade');
});

test('shows an error state for an unknown slug instead of a blank page', () => {
  const dom = makeDom();
  initPlayer({ window: dom.window, config: { games: [game] }, slug: 'does-not-exist' });
  const { document } = dom.window;
  assert.equal(document.getElementById('frame').hasAttribute('src'), false);
  assert.match(document.getElementById('meta').textContent, /not in games\.config\.json/i);
  assert.ok(document.getElementById('stage').hasAttribute('hidden'));
});

test('fullscreen button requests fullscreen on the stage', () => {
  const dom = makeDom();
  initPlayer({ window: dom.window, config: { games: [game] }, slug: 'demo-snake' });
  const stage = dom.window.document.getElementById('stage');
  let requested = false;
  stage.requestFullscreen = () => {
    requested = true;
    return Promise.resolve();
  };
  dom.window.document.getElementById('fullscreen').dispatchEvent(new dom.window.Event('click'));
  assert.equal(requested, true);
});

test('Escape exits to the index', () => {
  const dom = makeDom();
  const exits = [];
  // onExit stands in for window.location.assign: jsdom does not navigate, but the
  // shell's intent (leave the player, go to ./index.html) is what this test owns.
  initPlayer({ window: dom.window, config: { games: [game] }, slug: 'demo-snake', onExit: (url) => exits.push(url) });
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(exits, ['./index.html']);
});

test('does not hijack keys that belong to the game', () => {
  const dom = makeDom();
  initPlayer({ window: dom.window, config: { games: [game] }, slug: 'demo-snake' });
  let defaultPrevented = false;
  const arrow = new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
  arrow.preventDefault = () => {
    defaultPrevented = true;
  };
  dom.window.document.dispatchEvent(arrow);
  assert.equal(defaultPrevented, false);
});
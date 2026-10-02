import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderCard, renderGrid, renderTagFilters } from '../src/render.js';

const game = {
  slug: 'demo-snake',
  title: 'Demo Snake',
  summary: 'Placeholder.',
  repoUrl: 'https://github.com/karin/demo-snake',
  playUrl: './vendor/demo-snake/index.html',
  cover: './assets/covers/demo-snake.svg',
  tags: ['arcade', 'canvas'],
  controls: 'Arrow keys',
  year: 2026,
  featured: true,
};

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(escapeHtml('<img src=x onerror="boom()">'), '&lt;img src=x onerror=&quot;boom()&quot;&gt;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('renderCard escapes every text field', () => {
  const html = renderCard({ ...game, title: '<script>alert(1)</script>' });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('renderCard links to the player and the repo', () => {
  const html = renderCard(game);
  assert.ok(html.includes('href="./play.html?game=demo-snake"'));
  assert.ok(html.includes('href="https://github.com/karin/demo-snake"'));
  assert.ok(html.includes('src="./assets/covers/demo-snake.svg"'));
  assert.ok(html.includes('Demo Snake'));
});

test('renderCard marks featured games', () => {
  assert.ok(renderCard({ ...game, featured: true }).includes('data-featured="true"'));
  assert.ok(!renderCard({ ...game, featured: false }).includes('data-featured="true"'));
});

test('renderGrid renders one card per game', () => {
  const html = renderGrid([game, { ...game, slug: 'b', title: 'B' }]);
  assert.equal((html.match(/class="card"/g) ?? []).length, 2);
  assert.ok(renderGrid([]).includes('No games yet'));
});

test('renderTagFilters marks the active tag', () => {
  const html = renderTagFilters(['arcade', 'puzzle'], 'arcade');
  assert.ok(html.includes('data-active="true"'));
  assert.ok(html.includes('data-tag="puzzle"'));
});
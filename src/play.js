/**
 * The player shell. The ONLY module that touches the DOM.
 * document and window arrive as parameters so jsdom can drive it in tests.
 *
 * Keyboard policy: this shell handles Escape and nothing else. Every other key
 * belongs to the game running inside the iframe. Swallowing them here would
 * break input for every game at once.
 */
import { findBySlug } from './config.js';
import { backUrl } from './router.js';

const ESCAPE_KEY = 'Escape';

export function initPlayer({ window, config, slug, onExit = null }) {
  const { document } = window;
  const titleEl = document.getElementById('title');
  const metaEl = document.getElementById('meta');
  const stageEl = document.getElementById('stage');
  const frameEl = document.getElementById('frame');
  const fullscreenEl = document.getElementById('fullscreen');
  const backEl = document.getElementById('back');

  if (backEl) backEl.setAttribute('href', backUrl());

  const game = findBySlug(config, slug);
  if (!game) {
    titleEl.textContent = 'Game not found';
    metaEl.textContent = `"${slug ?? ''}" is not in games.config.json. Add it, or go back to the arcade.`;
    stageEl.setAttribute('hidden', '');
    fullscreenEl?.setAttribute('hidden', '');
    return;
  }

  titleEl.textContent = game.title;
  metaEl.textContent = `${game.controls} · ${game.year}`;
  document.title = `${game.title} — Arcade`;
  frameEl.setAttribute('src', game.playUrl);
  frameEl.setAttribute('title', game.title);

  fullscreenEl?.addEventListener('click', () => {
    const target = stageEl.requestFullscreen ? stageEl : document.documentElement;
    target.requestFullscreen?.().catch(() => {
      // Fullscreen can be denied (permissions, iframe embedding). The game still works.
    });
  });

  // Navigating is the default; onExit exists so a test can observe the intent
  // without depending on jsdom, which does not implement real page navigation.
  const exit = onExit ?? (() => window.location.assign(backUrl()));

  document.addEventListener('keydown', (event) => {
    if (event.key !== ESCAPE_KEY) return; // every other key belongs to the game
    exit(backUrl());
  });
}
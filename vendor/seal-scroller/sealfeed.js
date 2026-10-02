/** Renders the seal feed from gifs.json and drives snap-scroll + Ken Burns. */
import { clampIndex, nextIndex, isAdjacent } from './scroll.js';
import { loadLikes, saveLikes, toggleLike } from './likes.js';

/*
 * GitHub Pages serves everything with `Cache-Control: max-age=600`, so a hard
 * refresh is the only way to see a data change and it is easy to forget. These
 * files change rarely, so they are fetched with a cache-busting query keyed on a
 * build id. Bump BUILD_ID in a commit whenever gifs.json or sources.json changes
 * and every visitor picks it up on their next normal load.
 */
const BUILD_ID = '2026-10-01-the-creator';
const MANIFEST_URL = `./gifs.json?v=${BUILD_ID}`;
const SOURCES_URL = `./sources.json?v=${BUILD_ID}`;
const PRELOAD_RADIUS = 2;   // neighbours either side get eager loading
const SCROLL_KEYS = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };

const feedEl = document.getElementById('feed');
const hudEl = document.getElementById('hud');
const dotsEl = document.getElementById('dots');
const messageEl = document.getElementById('message');
const sourcesEl = document.getElementById('sources');
const sourcesBodyEl = document.getElementById('sources-body');
const sourcesToggleEl = document.getElementById('sources-toggle');
const sourcesCloseEl = document.getElementById('sources-close');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showMessage(text) {
  messageEl.hidden = false;
  messageEl.textContent = text;
  hudEl.textContent = 'no seals';
  feedEl.innerHTML = '';
  dotsEl.innerHTML = '';
}

function renderSlides(items) {
  // No counter anywhere: the badge and the dots both leaked the total, so the
  // feed is an endless-feeling scroll rather than a finite list.
  feedEl.innerHTML = items
    .map(
      (item, index) => `
      <section class="slide" data-index="${index}" aria-label="${escapeHtml(item.title)}">
        <div class="slide__frame">
          <img class="slide__img" src="./media/${escapeHtml(item.file)}"
               alt="${escapeHtml(item.title)}" loading="${index <= PRELOAD_RADIUS ? 'eager' : 'lazy'}"
               decoding="async" draggable="false">
        </div>
        <button class="like" type="button" data-like="${index}" aria-pressed="false"
                aria-label="Like this seal">
          <span class="like__icon" aria-hidden="true">&#9829;</span>
          <span class="like__count">0</span>
        </button>
        <div class="slide__credit">
          <span>${escapeHtml(item.title)}</span>
          ${item.source
            ? `<a href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">
                 ${escapeHtml(item.creator)} · ${escapeHtml(item.license)}
               </a>`
            : `<span class="slide__by">${escapeHtml(item.creator)} · ${escapeHtml(item.license)}</span>`}
        </div>
      </section>`,
    )
    .join('');
}

/* The dots used to render one per seal, which gave the total away. Removed. */
function renderProgress(active) {
  dotsEl.innerHTML = `<span class="dot dot--active"></span>`;
  dotsEl.setAttribute('aria-hidden', 'true');
}

function setActive(index, items) {
  const active = clampIndex(index, items.length);
  for (const slide of feedEl.querySelectorAll('.slide')) {
    const slideIndex = Number(slide.dataset.index);
    slide.classList.toggle('is-active', slideIndex === active);
    const img = slide.querySelector('.slide__img');
    // Only neighbours are worth decoding; the rest stay lazy.
    img.loading = isAdjacent(slideIndex, active, PRELOAD_RADIUS) ? 'eager' : 'lazy';
  }
  renderProgress(active);
  // Deliberately no "n / total" here — the feed should not advertise its length.
  hudEl.textContent = items.length > 0 ? 'seal' : '';
}

/**
 * Likes are per slide index and persist in localStorage. The count shown on a
 * slide is the number of likes THAT seal has, which does not reveal the total
 * number of seals in the feed.
 */
let likes = new Set();

function renderLike(index) {
  const button = feedEl.querySelector(`.like[data-like="${index}"]`);
  if (!button) return;
  const liked = likes.has(index);
  button.setAttribute('aria-pressed', String(liked));
  button.classList.toggle('is-liked', liked);
  const count = button.querySelector('.like__count');
  if (count) count.textContent = liked ? '1' : '0';
}

function bindLikes() {
  const storage = window.localStorage;
  likes = loadLikes(storage);

  feedEl.addEventListener('click', (event) => {
    const button = event.target.closest('.like');
    if (!button) return;
    event.stopPropagation(); // don't let a tap also scroll the feed
    const index = Number(button.dataset.like);
    if (!Number.isInteger(index)) return;
    likes = toggleLike(likes, index);
    saveLikes(storage, likes);
    renderLike(index);
  });

  for (const slide of feedEl.querySelectorAll('.slide')) {
    renderLike(Number(slide.dataset.index));
  }
}

const slideHeight = () => feedEl.clientHeight || 1;
const currentIndex = () => Math.round(feedEl.scrollTop / slideHeight());

function bindScroll(items) {
  let ticking = false;
  feedEl.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setActive(currentIndex(), items);
        ticking = false;
      });
    },
    { passive: true },
  );

  addEventListener('keydown', (event) => {
    const direction = SCROLL_KEYS[event.code];
    if (direction === undefined) return;
    event.preventDefault();
    const target = nextIndex(currentIndex(), items.length, direction);
    feedEl.scrollTo({ top: target * slideHeight(), behavior: 'smooth' });
  });
}

/**
 * The animals this feed is about, shown beside the scroller with a link to each
 * facility. Sources fail soft: a missing sources.json must not break the feed.
 */
async function loadSources() {
  if (!sourcesEl || !sourcesBodyEl) return;
  let sources;
  try {
    const response = await fetch(SOURCES_URL);
    if (!response.ok) return;
    sources = (await response.json()).sources ?? [];
  } catch {
    return;
  }
  if (sources.length === 0) return;

  sourcesBodyEl.innerHTML = `
    <h2 class="sources__title">Where these seals live</h2>
    <ul class="sources__list">
      ${sources
        .map(
          (source) => `
        <li class="sources__item">
          <a class="sources__name" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(source.name)}
          </a>
          <span class="sources__latin">${escapeHtml(source.latin)}</span>
          <span class="sources__facility">${escapeHtml(source.facility)} · ${escapeHtml(source.location)}</span>
          <span class="sources__note">${escapeHtml(source.note)}</span>
        </li>`,
        )
        .join('')}
    </ul>`;

  bindSourcesToggle();
}

/**
 * The panel starts collapsed so it does not cover the feed. It opens and closes
 * from two places: the Info button (which lives outside the panel and stays put)
 * and the close button inside the panel. Escape closes it too.
 */
function bindSourcesToggle() {
  if (!sourcesToggleEl) return;

  const setOpen = (open) => {
    sourcesEl.classList.toggle('is-open', open);
    sourcesToggleEl.setAttribute('aria-expanded', String(open));
    sourcesToggleEl.textContent = open ? 'Info ▾' : 'Info';
  };

  setOpen(false);

  sourcesToggleEl.addEventListener('click', () => {
    setOpen(!sourcesEl.classList.contains('is-open'));
  });

  sourcesCloseEl?.addEventListener('click', () => setOpen(false));

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sourcesEl.classList.contains('is-open')) setOpen(false);
  });
}

async function main() {
  let manifest;
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`${MANIFEST_URL} responded ${response.status}`);
    manifest = await response.json();
  } catch {
    showMessage(
      `Could not load ${MANIFEST_URL}. Serve over HTTP (npm run serve), then run: node scripts/fetch-seals.mjs`,
    );
    return;
  }

  const items = manifest.items ?? [];
  if (items.length === 0) {
    showMessage('gifs.json has no items. Re-run: node scripts/fetch-seals.mjs');
    return;
  }

  renderSlides(items);
  setActive(0, items);
  bindScroll(items);
  bindLikes();
  loadSources();
}

main();
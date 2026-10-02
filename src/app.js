/** Boots the arcade index: load registry, validate, render, wire tag filters. */
import { validateConfig, filterByTag, allTags } from './config.js';
import { renderGrid, renderTagFilters } from './render.js';

const CONFIG_URL = './games.config.json';

async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error(`${CONFIG_URL} responded ${response.status}`);
  return response.json();
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.hidden = false;
  document.getElementById('grid').innerHTML = '';
}

async function main() {
  let config;
  try {
    config = await loadConfig();
  } catch {
    showError(
      `Could not load ${CONFIG_URL}. Serve the folder over HTTP (npm run serve) — fetch does not work from file://.`,
    );
    return;
  }

  const { ok, errors } = validateConfig(config);
  if (!ok) {
    showError(`games.config.json is invalid:\n${errors.join('\n')}`);
    return;
  }

  const gridEl = document.getElementById('grid');
  const filtersEl = document.getElementById('filters');
  let activeTag = '';

  const paint = () => {
    gridEl.innerHTML = renderGrid(filterByTag(config, activeTag));
    filtersEl.innerHTML = renderTagFilters(allTags(config), activeTag);
  };

  filtersEl.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    activeTag = chip.dataset.tag;
    paint();
  });

  paint();
}

main();
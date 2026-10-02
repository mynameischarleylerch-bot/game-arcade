/**
 * Registry of games: validation + queries. Pure functions, no DOM, no fetch.
 * The whole point is that a typo in games.config.json produces a readable error
 * message instead of a blank card on the page.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_KEYS = ['slug', 'title', 'summary', 'repoUrl', 'playUrl', 'cover', 'tags', 'controls', 'year'];
const STRING_KEYS = ['title', 'summary', 'repoUrl', 'playUrl', 'cover', 'controls'];
const PATH_KEYS = ['playUrl', 'cover'];
const SAFE_PATH_PREFIXES = ['./', 'https://'];

function validateGame(game, index) {
  const at = `games[${index}]`;
  if (typeof game !== 'object' || game === null || Array.isArray(game)) {
    const actual = Array.isArray(game) ? 'array' : game === null ? 'null' : typeof game;
    return [`${at}: expected an object, got ${actual}`];
  }

  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!(key in game)) errors.push(`${at}.${key}: missing`);
  }
  for (const key of STRING_KEYS) {
    if (key in game && typeof game[key] !== 'string') {
      errors.push(`${at}.${key}: must be a string, got ${typeof game[key]}`);
    }
  }
  if ('year' in game && !Number.isInteger(game.year)) {
    errors.push(`${at}.year: must be an integer, got ${JSON.stringify(game.year)}`);
  }
  if ('tags' in game && (!Array.isArray(game.tags) || game.tags.some((t) => typeof t !== 'string'))) {
    errors.push(`${at}.tags: must be an array of strings`);
  }
  if (typeof game.slug === 'string' && !SLUG_PATTERN.test(game.slug)) {
    errors.push(`${at}.slug: must be lowercase kebab-case, got "${game.slug}"`);
  }
  for (const key of PATH_KEYS) {
    const value = game[key];
    if (typeof value !== 'string') continue;
    if (!SAFE_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))) {
      errors.push(`${at}.${key}: must start with "./" or "https://", got "${value}"`);
    }
  }
  return errors;
}

/** @returns {{ok: boolean, errors: string[], games: object[]}} */
export function validateConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['config: expected a JSON object at the top level'], games: [] };
  }
  if (!Array.isArray(raw.games)) {
    return { ok: false, errors: ['config.games: must be an array'], games: [] };
  }

  const errors = raw.games.flatMap((game, index) => validateGame(game, index));

  const seen = new Set();
  for (const game of raw.games) {
    if (typeof game?.slug !== 'string') continue;
    if (seen.has(game.slug)) errors.push(`config.games: duplicate slug "${game.slug}"`);
    seen.add(game.slug);
  }

  return { ok: errors.length === 0, errors, games: raw.games };
}

const gamesOf = (config) => (Array.isArray(config?.games) ? config.games : []);

export function findBySlug(config, slug) {
  return gamesOf(config).find((game) => game.slug === slug) ?? null;
}

export function filterByTag(config, tag) {
  const games = gamesOf(config);
  if (!tag) return games;
  const wanted = tag.toLowerCase();
  return games.filter((game) => (game.tags ?? []).some((t) => t.toLowerCase() === wanted));
}

export function featuredGames(config) {
  return gamesOf(config).filter((game) => game.featured === true);
}

export function allTags(config) {
  const tags = new Set();
  for (const game of gamesOf(config)) for (const tag of game.tags ?? []) tags.add(tag);
  return [...tags].sort();
}
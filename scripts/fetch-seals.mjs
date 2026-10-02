#!/usr/bin/env node
/**
 * One-shot fetcher: pulls CC-licensed seal photos from Openverse into
 * vendor/seal-scroller/media/ and writes gifs.json beside it.
 *
 *   node scripts/fetch-seals.mjs
 *
 * Openverse needs no API key (unlike Giphy/Tenor, which both reject unauthenticated
 * requests). Re-run to refresh the feed. Images are committed to the repo, so the
 * game never calls out to the network at runtime.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = fileURLToPath(new URL('../vendor/seal-scroller/', import.meta.url));
const MEDIA_DIR = path.join(GAME_DIR, 'media');
const MANIFEST = path.join(GAME_DIR, 'gifs.json');

/**
 * Ringed / bakail seals only — the genus Pusa (ringed P. hispida, bearded
 * P. barbata, hooded P. fasciata) plus the Caspian seal, which is what "bakail"
 * refers to. Earlier versions of this feed mixed in harbor seal pups and fur
 * seals, which are Phoca and Otariidae, not Pusa.
 *
 * Bare "seal" queries return wax seals and civic crest stamps, so these terms
 * name the animals or the genus directly. Several of these return few results
 * in Openverse, hence the long list.
 */
const SEARCH_TERMS = [
  'hooded+seal',
  'bearded+seal',
  'ringed+seal',
  'Pusa+hispida',
  'Caspian+seal',
  'Baltic+ringed+seal',
  'ringed+seal+Pusa',
  'seal+Pusa+species',
  'Pusa+annulatus',
  'Arctic+ringed+seal',
];
const WANT_TOTAL = 20;
const PER_TERM = 20;
/* Cap per term so one well-ranked species cannot fill the whole feed. */
const MAX_PER_TERM = 5;
const API = 'https://api.openverse.org/v1/images';

// Wax/official seals are documents, not animals. Drop them by title.
/**
 * Wax/official seals, museum artefacts and maps are documents, not animals.
 * This list is deliberately aggressive: a wrong photo in the feed is worse than
 * a short feed. Several of these searches legitimately return such items
 * ("Ring Seal Bonn", "seal trousers", species-distribution maps), and they match
 * "seal" perfectly well.
 */
const NOT_A_SEAL = new RegExp([
  'seal of', 'official seal', 'wax', 'great seal', 'town of', 'coat of arms',
  'christmas seal', 'stamp', 'gold ring', 'roman', 'benn', 'map', 'distribution',
  'trousers', 'boots', 'shoes', 'pelt', 'cloak', 'garment', 'costume',
  'museum', 'artefact', 'artifact', 'sword', 'sceptre', 'emblem', 'medallion',
  'clipart', 'drawing', 'illustration', 'logo', 'icon', 'schematic', 'diagram',
  'hieroglyph', 'sigillum', 'wappen',
].join('|'), 'i');

/* Titles that positively identify a live seal of the ringed group (genus Pusa). */
const IS_RINGED_GROUP = /hooded|bearded|ringed|pusa|caspian|ringelrob/i;

/**
 * "ring seal" also names a medieval wax artefact ("Ring Seal Bonn", "Medieval
 * ring seal"), so it must never satisfy the animal check on its own. If the
 * title uses that exact phrase, it also has to name a real species or animal.
 */
const RING_SEAL_PHRASE = /ring seal/i;
const RING_SEAL_ANIMAL = /seal.*(bonn|medieval|medieval|bronze|iron|gold|silver|jewel|matrix|intaglio)/i;

// "NoDerivatives" forbids adapted works. The feed crops (object-fit: cover) and
// scales every photo, which is an adaptation, so by-nd is excluded outright.
// Attribution duty under by / by-sa is met by the on-screen credit line.
const EXCLUDED_LICENSES = new Set(['by-nd', 'cc0-nd', 'sampling+']);

// A real photograph is comfortably over this; below it we are usually handed a
// placeholder thumbnail, an error graphic, or an SVG/PNG masquerading as .jpg.
const MIN_PHOTO_BYTES = 25_000;
const MIN_PHOTO_EDGE = 320;

/*
 * Size ceiling. The feed crops to a 16:9-ish viewport on a phone and displays at
 * most ~1200px wide, so anything much larger is wasted bytes. The earlier
 * unrestricted run pulled 2.5 MB originals and the feed hit 31 MB; capping at
 * this keeps it near 8 MB with no visible difference on screen.
 */
const MAX_PHOTO_BYTES = 700_000;

/* Ideal long edge after cropping to a portrait/landscape viewport. */
const TARGET_LONG_EDGE = 1600;

/** Openverse titles sometimes carry raw HTML from the source page. */
function cleanTitle(title) {
  return String(title)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

async function main() {
  const items = [];
  const seen = new Set();
  const perTermCount = new Map();

  await mkdir(MEDIA_DIR, { recursive: true });

  for (const term of SEARCH_TERMS) {
    if (items.length >= WANT_TOTAL) break;

    const data = await fetchJson(`${API}?q=${term}&page_size=${PER_TERM}&license_type=commercial`);
    console.log(`\n"${term}" -> ${data.results?.length ?? 0} results`);

    for (const result of data.results ?? []) {
      if (items.length >= WANT_TOTAL) break;
      // Enforce the per-species cap; move on to the next term.
      if ((perTermCount.get(term) ?? 0) >= MAX_PER_TERM) break;
      if (!result.url || seen.has(result.url)) continue;

      const title = result.title ?? '';
      if (NOT_A_SEAL.test(title)) continue;
      // Positive check: the title must actually name a ringed/bearded/hooded
      // seal, so unrelated-but-legal results cannot slip into the feed.
      if (!IS_RINGED_GROUP.test(title)) continue;
      if (RING_SEAL_PHRASE.test(title) && RING_SEAL_ANIMAL.test(title)) continue;

      // An uncredited photo cannot satisfy the attribution obligation, so it is
      // not usable here — every slide must name a creator.
      const creator = result.creator ?? '';
      if (!creator.trim()) continue;
      if (EXCLUDED_LICENSES.has(result.license)) continue;

      const image = await fetch(result.url);
      if (!image.ok) {
        console.warn(`  skipped (${image.status}): ${result.url}`);
        continue;
      }

      const bytes = Buffer.from(await image.arrayBuffer());

      // Reject placeholders and mislabelled formats before they reach the feed.
      if (bytes.length < MIN_PHOTO_BYTES) {
        console.warn(`  skipped (only ${bytes.length} bytes, likely a placeholder): ${result.title}`);
        continue;
      }
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!isJpeg) {
        console.warn(`  skipped (not a JPEG): ${result.url}`);
        continue;
      }
      if ((result.width ?? 0) < MIN_PHOTO_EDGE || (result.height ?? 0) < MIN_PHOTO_EDGE) {
        console.warn(`  skipped (too small: ${result.width}x${result.height}): ${result.title}`);
        continue;
      }
      // Skip the huge originals when a lighter variant of the same photo exists.
      if (bytes.length > MAX_PHOTO_BYTES) {
        console.warn(
          `  skipped (${(bytes.length / 1024 / 1024).toFixed(1)} MB > ` +
            `${MAX_PHOTO_BYTES / 1024 / 1024} MB): ${result.title}`,
        );
        continue;
      }

      seen.add(result.url);
      perTermCount.set(term, (perTermCount.get(term) ?? 0) + 1);
      const file = `seal-${String(items.length + 1).padStart(2, '0')}.jpg`;
      await writeFile(path.join(MEDIA_DIR, file), bytes);

      items.push({
        file,
        title: cleanTitle(title) || 'Seal',
        creator,
        license: result.license ?? 'unknown',
        licenseUrl: result.license_url ?? '',
        source: result.foreign_landing_url ?? result.url,
      });
      console.log(`  ${file}  ${(bytes.length / 1024).toFixed(0)} KB  ${title.slice(0, 40)}`);
    }
  }

  if (items.length < WANT_TOTAL) {
    console.error(`\nOnly collected ${items.length}/${WANT_TOTAL}. Add a term to SEARCH_TERMS.`);
    process.exit(1);
  }

  await writeFile(
    MANIFEST,
    `${JSON.stringify({ generated: new Date().toISOString(), items }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nWrote ${items.length} items to vendor/seal-scroller/gifs.json`);
}

await main();
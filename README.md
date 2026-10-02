# Arcade

A tiny site that lists the games I build and plays them right in the page.
No framework, no build step, no runtime dependencies — `jsdom` is dev-only.

## Run it locally

    npm install
    npm run serve        # http://localhost:8080
    npm test

Open http://localhost:8080/index.html. Do not open `index.html` from the file
system: `fetch()` of `games.config.json` is blocked on `file://`.

## Layout

    games.config.json      registry: one object per game
    src/config.js          validation + queries (pure)
    src/render.js          card/grid HTML strings (pure)
    src/router.js          ?game=slug resolution (pure)
    src/play.js            the only DOM module; window/document are parameters
    vendor/<slug>/         built game files, committed, same-origin iframe
    scripts/vendor.mjs     copy a game's build into vendor/<slug>/
    scripts/validate-config.mjs
    tests/                 node:test + jsdom

## Add a game

1. Build your game to a folder containing `index.html` (static files, no
   bundler needed — relative paths only, since it is served from a subpath).
2. Add an entry to `games.config.json`:

       { "slug": "my-game", "title": "My Game", "summary": "One line.",
         "repoUrl": "https://github.com/mynameischarleylerch-bot/my-game",
         "playUrl": "./vendor/my-game/index.html",
         "cover": "./assets/covers/my-game.svg",
         "tags": ["arcade"], "controls": "Arrow keys", "year": 2026,
         "featured": false }

   `slug` must be lowercase kebab-case and unique. `playUrl` and `cover` must
   start with `./` or `https://` — the validator rejects anything else, which is
   what stops a `javascript:` URL from ever reaching an `href`.
3. Import the build:

       node scripts/vendor.mjs my-game /path/to/build

4. Add a cover image at `assets/covers/my-game.svg`.
5. `npm test` then open the game and play it for 20 seconds.

## Deploy

Push to GitHub, then **Settings → Pages → Source: GitHub Actions**. The included
workflow publishes the repo root to `https://<user>.github.io/game-arcade/`.

## Rules that keep this working

- Every asset path is `./`-relative. This site is served from a subpath, so a
  leading `/` 404s in production while working fine locally.
- Games live in `vendor/<slug>/` and are same-origin, so the player iframe has no
  cross-origin restrictions and input works.
- The player shell handles only `Esc`, in both the page and the game iframe —
  while a game has focus, keystrokes never reach the shell. Every other key
  belongs to the game.

## Seal Scroller

A vertical, snap-scrolling feed in the same Aero glass as the rest of the site. Arrow keys,
page keys, mouse wheel and touch all work; the last seal wraps to the top. Each photo gets a
slow CSS pan/zoom so it reads as a moving clip.

### Where the photos come from

The photographs in `vendor/seal-scroller/media/stars/` were **supplied directly by karin**
for this site. They are not Creative Commons and are committed for personal use only — do not
redistribute them. `gifs.json` records the credit line and the file order.

`scripts/fetch-seals.mjs` is **disabled**. It used to pull CC-licensed photos from
[Openverse](https://openverse.org), and it exited non-zero rather than being deleted because
leaving a stale script that writes into `media/` would be a trap. There is no automated
refresh for this feed; to change the photos, replace the files in `media/stars/` and re-order
the `items` array in `gifs.json`.

An earlier version of this feed used those Openverse photos. Two problems with it: the
searches surfaced wax seals, civic crests and museum artefacts alongside animals, and one
photo was verified by eye as a **dead, human-handled seal** (belly-up, abdomen cut open,
exposed tissue). That photo was removed. The lesson is recorded here because it generalises:
obvious-to-the-eye content cannot be detected from a filename, a title or a search rank, and
a filtered fetcher is not a content review.

### Sources panel

Beside the scroller, a glass panel lists the three animals this feed is about, each linking
to the facility that cares for it. The data lives in `vendor/seal-scroller/sources.json`:

| Seal | Species | Facility |
|---|---|---|
| Niko | Baikal seal (*Pusa sibirica*) | [Toba Aquarium](https://www.toba-aquarium.com/), Mie |
| Yuki | Ringed seal (*Pusa hispida*) | [Osaka Aquarium Kaiyukan](https://www.kaiyukan.com/) |
| Yo-chan | Ringed seal (*Pusa hispida*) | [Okhotsk Tokkari Center](https://o-tower.co.jp/tokkaricenter.html), Hokkaido |

The panel loads from `sources.json` independently of the feed and fails soft: if that file is
missing the panel simply stays hidden and the scroller still works. It collapses to a bottom
strip under 760px, where there is no room beside the feed.

**The panel credits the animals; it does not claim the photographs are of them.** The supplied
photos include harbour seals and a harp seal pup as well as the three named animals, and there
is no reliable way to tell which is which from the image alone. Labelling a photo "Yuki"
without certainty would put a false claim about an identifiable animal on the page.

## Themes

The **Theme:** button in the header cycles the page between five Frutiger-Family looks:

| Theme | Character |
|---|---|
| Frutiger Aero | The original: glossy glass, aqua, sky, hills, bubbles |
| Frutiger DORFic | Abstract and near-minimal — flat fields, thin rules, no gloss |
| Frutiger Eco | Organic and matte — green and earth, natural surfaces |
| Frutiger Glacier | Cold and high-key — ice blue, frosted |
| Dark Aero | The same glass and gloss on near-black |

DORFic, Eco and Glacier are established Frutiger-Family aesthetics (siblings to Frutiger
Aero, alongside Metro, Technozen, Aurora and Jolly), each named after an Adrian Frutiger
typeface. The palettes follow that character rather than being arbitrary colour swaps.

Every colour in `styles.css` is a custom property on `:root`. Each theme is a
`[data-theme="name"]` block that redefines **only** those properties; shape, spacing and
motion are shared. Switching sets `data-theme` on `<html>` (`src/theme-ui.js`), so there is
no reload and no re-render.

Two deliberate limits:

- **Games keep their own colours.** The theme applies to site chrome only. Each game is a
  separate document in an `iframe`, so a parent theme cannot leak into it. Theming the
  games would mean editing every vendored file, and they would drift apart over time.
- **The choice is not remembered.** A fresh visit always starts on Frutiger Aero. There is
  no `localStorage`, which also means no flash of a stale theme on load.

### Adding a theme

1. Add an entry to `THEMES` in `src/themes.js` (`id` must be lowercase kebab-case).
2. Add a matching `[data-theme="id"]` block in `styles.css`.
3. Run `npm test`. Two checks guard this:
   - `scripts/check-themes.mjs` fails if the block does not override **every** palette
     token on `:root`, so a partial block is caught immediately rather than shipping one
     element that stays Aero.
   - `scripts/check-contrast.mjs` fails if body text drops below WCAG AA (4.5:1) against the
     background or the card surface.

Both run as part of `npm test`. `color-scheme: dark` in the Dark Aero block is what makes
form controls and scrollbars render dark too.
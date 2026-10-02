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

A vertical, snap-scrolling feed of seals in the same Aero glass as the rest of the site.
Arrow keys, page keys, mouse wheel and touch all work; the last seal wraps to the top.

The photos are **not GIFs**. They are still CC-licensed photographs from
[Openverse](https://openverse.org), each given a slow CSS pan/zoom so it reads as a moving
clip. GIFs were the original ask, but every GIF API needs a key this machine does not have —
Giphy's public beta key returns `403 BANNED` and Tenor rejects unauthenticated calls — and
redistributing downloaded GIFs conflicts with Giphy's terms. Openverse content exists for
this kind of reuse, and every slide credits its creator and licence on screen.

`scripts/fetch-seals.mjs` excludes three things on purpose:

- **Wax and official seals** — bare "seal" searches return civic crests and stamps, which
  are documents, not animals. Filtered by title, using seal-specific search terms.
- **`by-nd` ("no derivatives") images** — the feed crops and scales every photo, which is an
  adaptation, so those licences cannot be used here.
- **Uncredited photos** — anything without a creator is dropped, since attribution is
  mandatory under the licences that remain.

It also rejects anything under 25 KB that is not a JPEG, which catches placeholder
thumbnails and mislabelled PNGs.

Refresh or change the feed:

    node scripts/fetch-seals.mjs

The script is deterministic in shape but not in content — Openverse returns whatever is
ranked at the time, so a re-run may swap which seals appear. `gifs.json` records the
filenames, titles, creators and licences for the current set.

Photos in `vendor/seal-scroller/media/` **are committed** (about 8 MB). That is deliberate:
the Pages workflow publishes the git checkout, so gitignored photos would ship a live site
with broken images while every local test still passed.

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
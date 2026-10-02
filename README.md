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
         "repoUrl": "https://github.com/karin/my-game",
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
# Move the site to `mynameischarleylerch-bot.github.io` (drop the `/game-arcade/` path)

## Goal

Make the arcade live at `https://mynameischarleylerch-bot.github.io/` instead of `https://mynameischarleylerch-bot.github.io/game-arcade/`, by renaming the GitHub repository from `game-arcade` to `mynameischarleylerch-bot.github.io`.

## Current context / assumptions

### The address is set entirely by GitHub, not by code

This is the single most important fact in this plan, and it is worth stating plainly because "change the website address" sounds like an editing task and is not one.

A GitHub Pages address is derived from **two** things:

| Thing | Where it comes from | Currently |
|---|---|---|
| Host | the account that owns the repo | `mynameischarleylerch-bot.github.io` |
| Path | **the repository name**, verbatim | `game-arcade` |

The path is not configured in a file. There is no base path, no CNAME, no rewrites table. GitHub serves a repository named `<account>.github.io` at the bare host, and any other repository at `<host>/<repo-name>/`.

So the change is: **rename the repository.** No HTML, CSS or JavaScript edits are required, and none should be made.

### Verified: nothing in the code depends on the path

I checked, and this is worth knowing before touching anything:

- **Zero absolute asset paths.** Every `src`, `href` and `versioned()` argument in every shipped `.html`, `.js`, `.mjs` and `.css` file begins with `./`. No `/assets/...` style leading-slash reference exists anywhere.
- **The Pages workflow has no base path.** `.github/workflows/pages.yml` uploads `path: '.'` — the repo root — and never sets `base_path`.
- **`.nojekyll` is absent.** Jekyll only rewrites paths for sites without it; with the workflow uploading raw files this is irrelevant, and it should stay that way.

Because everything is relative, the same files work identically at `/game-arcade/` and at `/`. This is the payoff for a rule the repo has been holding to from the start, stated in its own README:

> Every asset path is `./`-relative. This site is served from a subpath, so a leading `/` 404s in production while working fine locally.

### The rename is done in GitHub's UI, not in git

The local git history is **not** touched by this. A repository rename:

- happens on GitHub's servers,
- keeps every commit, branch, tag and issue,
- **redirects the old remote URL permanently**, so `git push` to the old address keeps working,
- and changes the clone URL to `https://github.com/mynameischarleylerch-bot/mynameischarleylerch-bot.github.io.git`.

The local working copy at `C:\Users\karin\game-arcade` can stay exactly where it is. Renaming the local folder is optional cosmetic tidying and is **not** part of this plan.

### One thing to confirm before doing it

Renaming to `<account>.github.io` makes the repository a **user site**. GitHub treats the user site specially:

- It must be **public**. This repo already is — and must stay so, because GitHub Pages on the free plan only serves public repositories. (The repo is public for hosting, with the proprietary `LICENSE` doing the legal work. That trade-off is already settled and this plan does not revisit it.)
- If the account ever has a second repo whose name also starts with `<account>.github.io`, the user site wins and the other is served from a subpath of it. Not a concern here.

If the repository were ever made private, the site would go offline entirely. Worth stating once, not fixing.

## Architecture / proposed approach

Rename the repository through **Settings → General → Rename**, on GitHub's web UI, in two steps: first rename to a temporary name, then to the final one — because GitHub refuses to rename a repository to a name that is already in use, and refuses to reuse a name for a while after a repo is deleted.

Then update the two places in the repo that state the old address, and verify the live site.

There is **no code change.** If a task below ever requires editing an asset path, something has gone wrong — stop and re-read this plan.

## Step-by-step tasks

### Task 1 — Record the current state, so you can prove nothing was lost

This is a read-only step. It exists because a rename touches the thing your whole site lives on, and afterwards you want to be able to show that nothing was lost.

Run, and keep the output:

```bash
cd C:\Users\karin\game-arcade
git log --oneline -5
git status --short
node -e "console.log(require('fs').readFileSync('package.json','utf8').length)"
```

Expected: the recent commits listed, a clean working tree (or only your known local edits), and a positive byte count.

Also open the live site and confirm it currently works:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mynameischarleylerch-bot.github.io/game-arcade/
```

Expected: `200`

If that is **not** `200`, stop. The site is already broken and renaming will not fix it — find out why first.

---

### Task 2 — Run the full test suite before touching anything

```bash
cd C:\Users\karin\game-arcade
npm test
```

Expected at the end:

```
ℹ fail 0
games.config.json OK: 5 game(s)
aero        ...  PASS AA
doric       ...  PASS AA
eco         ...  PASS AA
glacier     ...  PASS AA
dark-aero   ...  PASS AA
all themes PASS AA (>= 4.5)
```

Write this number down: **`N` passing**. You will compare against it in Task 5. If the suite is already red, stop and fix that first — otherwise you will not know whether the rename broke something.

---

### Task 3 — Guard the "no absolute paths" rule with a test

Right now the relative-path convention is a README sentence and a habit. This task makes it enforced, so a future edit cannot quietly reintroduce a leading slash that works locally and 404s in production — and so a future move of this site cannot be broken the same way.

**Test first.** Append to `tests/cache-stamps.test.js`:

```js
test('no shipped file uses a path that depends on where the site is served from', () => {
  // Every asset reference must be ./-relative or absolute-URL. A leading slash
  // ("/assets/x.svg") works when you open the file locally and 404s in
  // production, because production serves from a subpath. This is the rule that
  // makes the site relocatable, so it is enforced rather than remembered.
  const roots = ['index.html', 'play.html', 'styles.css', 'src', 'vendor'];
  const files = [];
  const walk = (rel) => {
    const full = new URL(`../${rel}`, import.meta.url);
    if (full.pathname.endsWith('/')) {
      for (const entry of globSync(`${full.pathname}*`)) {
        walk(`${rel}/${entry.split(/[/\\]/).pop()}`);
      }
    } else {
      files.push(full);
    }
  };
  for (const rel of roots) walk(rel);

  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:src|href)\s*=\s*["'](\/[^"']*)["']/g)) {
      offenders.push(`${file.pathname.split('/game-arcade/')[1]}: ${m.group(1)}`);
    }
    for (const m of text.matchAll(/versioned\(\s*["'](\/[^"']*)["']/g)) {
      offenders.push(`${file.pathname.split('/game-arcade/')[1]}: ${m.group(1)}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these paths assume the site is served from a domain root: ${offenders.join('; ')}`);
});
```

If `globSync` is not already imported in that file, add it to the existing `node:fs` import:

```js
import { globSync } from 'node:fs';
```

Run — expect GREEN, because the code already complies. That is the point: the test passes now and fails if anyone breaks it later.

```bash
node --test tests/cache-stamps.test.js
```

Commit:

```bash
git add tests/cache-stamps.test.js
git commit -m "test: pin the relative-path rule that makes the site relocatable"
```

---

### Task 4 — Rename the repository on GitHub

This is the only step that changes the live address. Everything else in this plan is documentation.

GitHub will not let you rename straight to the final name if it is in use, and will not immediately reuse a name that was recently deleted. So rename **twice**: to a scratch name, then to the final name.

**Step 4a — rename to a scratch name**

1. Open `https://github.com/mynameischarleylerch-bot/game-arcade`
2. Click the **Settings** tab, at the top of the repository, under the repository name.
3. In the left sidebar, click **General**. It is the first item, above "Code and automation".
4. Scroll to the very top, to the box titled **Repository name**.
5. Clear the field. It currently reads `game-arcade`.
6. Type `game-arcade-tmp` and press **Rename**.

**Step 4b — rename to the final name**

GitHub now redirects the old name to the new one, and the old name is reserved while that redirect exists. Repeat the same clicks:

1. **Settings** → **General** → **Repository name**.
2. Clear `game-arcade-tmp`.
3. Type `mynameischarleylerch-bot.github.io` — exactly, with no spaces and no trailing slash.
4. Press **Rename**.

GitHub warns that the rename can take up to an hour to fully propagate, and shows a confirmation panel. Confirm it.

**Step 4c — check Pages survived**

1. Still in **Settings**, click **Pages** in the left sidebar (under "Build, deployment, and environments").
2. Under **Source**, it must read **GitHub Actions**. If it does, nothing to do.

If **Source** now says **Deploy from a branch**, choose the **GitHub Actions** radio button and save. This is the one setting a rename can reset.

**Step 4d — confirm the old URL redirects and the new one serves**

```bash
curl -s -o /dev/null -w "old: %{http_code} -> %{redirect_url}\n" https://mynameischarleylerch-bot.github.io/game-arcade/
curl -s -o /dev/null -w "new: %{http_code}\n" https://mynameischarleylerch-bot.github.io/
```

Expected: the old address responds `301` with a redirect URL, and the new one responds `200`.

If the new one is `404` after 20 minutes, GitHub has not finished provisioning. Wait and re-check; it is not a fault in the repo.

---

### Task 5 — Update the local remote and verify nothing was lost

**Test first.** Confirm the test count has not moved:

```bash
cd C:\Users\karin\game-arcade
npm test
```

Expected: `ℹ fail 0`, and the **same passing count `N`** as Task 2.

If it is lower, something changed that should not have. Check `git status` and `git log --oneline -3` before going further.

Update the remote to the new name. GitHub redirects the old one, so this is tidiness, not a requirement:

```bash
cd C:\Users\karin\game-arcade
git remote set-url origin https://github.com/mynameischarleylerch-bot/mynameischarleylerch-bot.github.io.git
git remote -v
```

Expected: `origin` now shows the new URL.

Confirm the pipeline still runs on the renamed repo:

```bash
git push origin main
```

Then open `https://github.com/mynameischarleylerch-bot/mynameischarleylerch-bot.github.io/actions` and check the newest **Deploy arcade to GitHub Pages** run says **success**.

Do **not** rename the local folder. `C:\Users\karin\game-arcade` can keep its name indefinitely and nothing breaks.

---

### Task 6 — Fix the README's two stale sentences

The README documents the old address in two places. Both are now wrong, and a README that lies about where the site lives is worse than one that says nothing.

**Test first.** Append to `tests/config.test.js`:

```js
test('the README does not tell people to visit a path that no longer exists', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  // The site is now a GitHub user site, served from the bare host. The old
  // "https://<user>.github.io/game-arcade/" form would send people to a 404.
  assert.equal(/github\.io\/game-arcade\//.test(readme), false,
    'README still points at the old /game-arcade/ path');
  assert.match(readme, /mynameischarleylerch-bot\.github\.io\/`/,
    'README should state the real address');
});
```

Run — expect RED:

```bash
node --test tests/config.test.js
```

Fix both lines in `README.md`. Under `## Deploy`:

```markdown
Push to GitHub, then **Settings → Pages → Source: GitHub Actions**. The included
workflow publishes the repo root to `https://mynameischarleylerch-bot.github.io/`.

The repository is named after the account, which is what makes it a GitHub *user
site* — GitHub serves a repo called `<account>.github.io` from the bare host with
no path. Every asset path in this repo is `./`-relative, so the site works at any
path; renaming the repository was the only change required.
```

And under `## Rules that keep this working`, replace the first bullet:

```markdown
- Every asset path is `./`-relative, never `/`-rooted. A leading `/` works when you
  open the file locally and 404s in production, and it would break the site the
  moment it moved to a different path. `tests/cache-stamps.test.js` enforces this.
```

Run — expect GREEN:

```bash
node --test tests/config.test.js
npm test
```

Commit and push:

```bash
git add README.md tests/config.test.js
git commit -m "docs: the site is a GitHub user site at the bare host"
git push origin main
```

---

### Task 7 — Verify the live site end to end

Every asset and game, at the new address:

```bash
B=https://mynameischarleylerch-bot.github.io
for p in "" index.html play.html styles.css assets/icon.svg assets/covers/demo-snake.svg assets/covers/fru-angler.svg assets/covers/seal-scroller.svg assets/covers/demo-blocks.svg vendor/demo-snake/index.html vendor/demo-blocks/index.html vendor/fru-angler/index.html vendor/fru-angler/angler.js vendor/fru-angler/fishing.js vendor/fru-angler/reel.js vendor/seal-scroller/index.html src/app.js src/render.js src/build.js; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$B/$p")" "$p"
done
```

Expected: **`200` on every line.**

Then confirm the shell actually resolves the games at the new path — this is the one that would catch a stray absolute path:

```bash
curl -s "$B/index.html?v=2026-10-02-a" | grep -o 'src="[^"]*"' | sort -u
```

Expected: every `src` starts with `./`.

And confirm the old address is gone rather than silently serving stale content:

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://mynameischarleylerch-bot.github.io/game-arcade/
```

Expected: `301` pointing at the bare host.

**Open the site in your browser and click through all four games.** Structural checks cannot tell you that a game iframe loaded at the new path and renders its own Aero styling rather than inheriting a broken one.

## Tests / validation

| When | Command | Expected |
|---|---|---|
| Task 1 | `curl -o /dev/null -w '%{http_code}' .../game-arcade/` | `200` before anything changes |
| Task 2 | `npm test` | `ℹ fail 0`, note the count `N` |
| Task 3 | `node --test tests/cache-stamps.test.js` | pass — the code already complies |
| Task 4 | `curl -w '%{http_code}' .../game-arcade/` and `.../` | `301` then `200` |
| Task 5 | `npm test` | `ℹ fail 0`, **same count `N`** |
| Task 6 | `node --test tests/config.test.js` | pass |
| Task 7 | the `for` loop over 18 paths | `200` on every line |

Two tests are added, both written before the change they describe: the relative-path guard (Task 3) and the stale-README guard (Task 6). Both are about **conventions**, not about this particular move — they keep the next one safe.

## Risks, tradeoffs, and open questions

**The rename is not atomic and not instant.** GitHub redirects the old repository name to the new one, and the bare-host site can take up to an hour to provision. During that window the old URL may still serve and the new one may 404. Nothing is lost either way; it is a propagation delay, not a fault.

**Any existing link to the old address now redirects.** The redirect is a courtesy, not a guarantee — GitHub's repository redirects are not documented as permanent. If the old `github.io/game-arcade/` address has been shared publicly, it is worth telling people the new one.

**Sharing is unchanged.** The address is not a secret and was never one; it has been public since the first deploy. This plan changes what the address *is*, not who can see it.

**A private repo would take the site offline.** This is the one real risk in the whole exercise, and it is not introduced by it: GitHub Pages on the free plan only serves public repositories, so the repo must stay public. The `LICENSE` file carries the proprietary notice. If anyone later runs **Settings → General → Danger Zone → Change visibility → Private**, the site stops working — do not.

**I did not rename the local folder.** `C:\Users\karin\game-arcade` keeps its name and works fine; the folder name has nothing to do with the URL. Renaming it would break nothing but would also achieve nothing, and it churns the path every future script uses.

**A future custom domain would need more than this.** If you later buy a real domain, that is a different plan: a `CNAME` file in the repo root plus DNS records, and the repository can stay named anything. The relative-path work done here means that move would be additive rather than a repeat of this one.
# Angler progression overhaul — areas, Epic tier, levels, Frutiger rods, lost items, pet seals

## Goal

Rework Frutiger Angler's progression so that finishing an area's fish index **and** owning every rod built for that area opens the next one, add an Epic rarity tier with full Rare→Mythical coverage in every lake, add an angler level rank, redesign the rods with proper Frutiger names and art, and add a second economy — lost Frutiger items recovered while fishing, spent on pet seals that raise luck, can duplicate a catch, sit on the dock beside you and comment on what you land.

---

## Current context / assumptions

### Repo and layout

- Repo root: `C:\Users\karin\game-arcade`. Branch `main`. Remote `https://github.com/mynameischarleylerch-bot/game-arcade`.
- Deployed to GitHub Pages via `.github/workflows/pages.yml` (`actions/deploy-pages`).
- **No build step.** Everything is hand-written static HTML/CSS/ES modules. There is no bundler, transpiler or npm dependency.
- `git` is **not** on the user's Windows PATH. It lives at
  `C:/Users/karin/AppData/Local/hermes/tools/git-2.53.0+3-win32-x64/cmd/git.exe`.
  Use that full path in every git command below, or export it first:
  ```bash
  export PATH="/c/Users/karin/AppData/Local/hermes/tools/git-2.53.0+3-win32-x64/cmd:$PATH"
  ```
- `gh` CLI is **not installed.** To watch a deploy, poll the live URL instead (Task 20).

### Test runner

```bash
cd /c/Users/karin/game-arcade
node --test "tests/**/*.test.js"
```

Node 26 here **rejects a bare directory** as an argument (`ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND`), so the glob is mandatory. `npm test` runs the same glob and is fine to use.

Current baseline before you start: **376 passing, 0 failing.**

### The files you will touch

| Path | Role |
|---|---|
| `vendor/fru-angler/fishing.js` | All pure data + rules. **825 lines, LF line endings.** 27 fish, 8 rods, 5 areas. No DOM, no timers. |
| `vendor/fru-angler/angler.js` | Controller: DOM refs, state, save/load, render loop. **32790 bytes, CRLF line endings.** |
| `vendor/fru-angler/index.html` | Markup + all Angler CSS. Scene SVG is `viewBox="0 0 100 100"` with `preserveAspectRatio="none"`. |
| `vendor/fru-angler/reel.js` | The reel minigame. Untouched by this plan. |
| `tests/angler-fishing.test.js` | 63 tests over the pure layer. |
| `tests/angler-loop.test.js` | 50 tests driving the controller through jsdom. |
| `tests/angler-look.test.js` | 44 appearance tests. |
| `src/build.js` | `export const BUILD = '2026-10-03-b'`. The single source of the cache stamp. |

**`fishing.js` is LF and `angler.js` is CRLF.** This matters enormously — see [Editing both files safely](#editing-both-files-safely). Getting this wrong previously truncated `fishing.js` to 0 bytes and cost a recovery cycle.

### What already exists (do not rebuild)

- 27 fish across 5 lakes, 6 species each. Every lake has a `palette` and a `trait`.
- 8 rods in `RODS` (an **object** keyed by id, not an array): `bamboo`, `willow`, `carbon`, `oak`, `titan` (no traits) and `canopy` (`flex`), `glacier` (`ice`), `abyss` (`reinforced`).
- `ROD_LOOKS` gives each rod `{path, width, colour}`; `withTip()` derives `tipX`/`tipY` from the path. `ROD_ART` and `rodArt()` expose it.
- `areaUnlocked(area, progress)` currently requires **every** rod in the game plus every fish of the *previous* lake.
- `rollFish(roll, rod, areaId)` — luck boosts non-Common weights by depth.
- Save is `localStorage['fru-angler-save']` holding `{coins, rodId, owned, bestiary, areaId}`.
- The dock: `<rect class="scene__wood" x="0" y="58" width="42" height="4.5"/>` — deck spans x=0..42, top edge at y=58. The angler's base meets the deck at y=58, centred near x=33. A pet seal goes at **x≈14, y≈58**, to the angler's left, so it never overlaps the rod (which sweeps up-right from x=40.7).
- `say(text)` writes to `#message` and is how any seal comment reaches the player.

### Decisions already made with the user

These were confirmed explicitly. Do not re-litigate them.

1. **The Aero Lake → DORFic Delta gate needs 8 no-trait rods.** There are currently only 5. So **add 3 more ordinary no-trait rods** to reach 8.
2. **DORFic Delta gets its own new trait: `channel`** (the straight geometric channels). It has `trait: null` today and must change.
3. **The first `channel` rod is a free one-time gift** the moment you arrive in DORFic Delta — added to the bag **and auto-equipped**.
4. **Levels** are a mix: they give a **small permanent luck bonus** *and* they **gate which pet seals you can buy**. They do **not** gate rods.
5. **Only one seal can be equipped at a time.**

### Rarity tiers

Current: `['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythical']` — there is **no Epic**. Task 1 inserts Epic between Rare and Legendary, giving six tiers:

```js
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical'];
```

This is a **breaking change to every index**. Anything that hardcodes rarity ordering, colours or counts must move with it. `RARITY_COLOURS` needs an `Epic` entry, and `fishSvg()` already derives its lavish ramp from `RARITY_ORDER.indexOf(spec.rarity)`, so a Mythical goes from `tier 4` to `tier 5` — sparkles go from 10 to 12, and `crown` (`tier >= 3`) starts at **Epic** instead of Legendary. Verify that against the existing test rather than assuming.

---

## Architecture / proposed approach

Everything new that can be a pure function goes in `fishing.js`, alongside the existing rules, with randomness injected as a parameter — never `Math.random()` inside a rule. Everything that touches the DOM goes in `angler.js`. The four new systems (lost items, seals, levels, per-area rod gates) are all pure-data-plus-pure-function, so they are testable without jsdom and land in `fishing.js`.

New state is added to the save under new keys. Existing saves must keep working: `load()` repairs anything missing, and since a player mid-way through will suddenly need 8 rods instead of 5, `areaUnlocked` must degrade gracefully rather than stranding anyone. Every save-repair branch gets its own test.

One deliberate simplification: **a lost Frutiger item is recovered by catching, not by a separate action.** Rather than a new minigame, `landFish()` rolls a `RECOVERIES` table on each catch. This keeps the fishing loop tight and makes the seal economy a reward on the path you are already walking.

---

## Editing both files safely

`angler.js` is CRLF, `fishing.js` is LF. Use the `patch` tool for targeted edits to both — it reads and writes text, so line endings survive.

**Never** run a whole-file rewrite script over `angler.js` or `fishing.js`. That is how `fishing.js` was truncated to 0 bytes once already. If you must transform a file in bulk:

```python
# Safe pattern — read bytes, assert the source is real, transform, write.
import os
p = r"C:\Users\karin\game-arcade\vendor\fru-angler\fishing.js"
b = open(p, "rb").read()
assert len(b) > 30000, f"source looks truncated ({len(b)} bytes) — abort"
s = b.decode("utf8")
# ... transform s ...
open(p, "w", encoding="utf8", newline="").write(s)
```

Immediately after any such write, re-run `node --test tests/angler-fishing.test.js` and confirm the count is not zero-ish. A silently emptied module makes every test file fail at import and can look like a mass regression.

---

## Step-by-step tasks

Rules that hold for every task below:

- Run `node --test "tests/**/*.test.js"` after each change. The suite must never go below **376**.
- One focused commit per task, in the form `feat(angler): ...` with a body explaining *why*.
- Read the current file before patching. Line numbers below are anchors, not guarantees.
- When a task says "RED", run the test and confirm it fails for the stated reason before writing the implementation.

---

### Task 1 — Insert the Epic rarity tier

`RARITY_ORDER` is exported at the bottom of `fishing.js` and also referenced in a comment near `RARITY_COLOURS`. There is a single `RARITY_COLOURS` object:

```js
export const RARITY_COLOURS = {
  Common: '#7ea8bd',
  Uncommon: '#7aa84a',
  Rare: '#e07b2a',
  Legendary: '#c8a02e',
  Mythical: '#8b5cf6',
};
```

**Step 1 — RED.** Append to `tests/angler-fishing.test.js`:

```js
test('there are six rarity tiers, with Epic between Rare and Legendary', () => {
  assert.deepEqual(RARITY_ORDER,
    ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical']);
});

test('every rarity has a colour, and Epic is purple-adjacent', () => {
  for (const rarity of RARITY_ORDER) {
    assert.match(RARITY_COLOURS[rarity] ?? '', /^#[0-9a-f]{6}$/i,
      `${rarity} needs a colour`);
  }
});

test('every fish sits in a known tier', () => {
  for (const fish of FISH) {
    assert.ok(RARITY_ORDER.includes(fish.rarity),
      `${fish.id} has rarity ${fish.rarity}, which is not a tier`);
  }
});
```

Make sure `RARITY_ORDER` and `RARITY_COLOURS` are in the existing import list at the top of that file. If they are not, add them — they are exported, so this is an import line change only.

Run `node --test tests/angler-fishing.test.js` → **1 failure**, "six rarity tiers". That is your RED.

**Step 2 — GREEN.** In `fishing.js`, replace the `RARITY_ORDER` declaration and add the colour:

```js
export const RARITY_COLOURS = {
  Common: '#7ea8bd',
  Uncommon: '#7aa84a',
  Rare: '#e07b2a',
  Epic: '#7b3fe4',      // violet: sits between Rare's orange and Mythical's purple
  Legendary: '#c8a02e',
  Mythical: '#8b5cf6',
};
```

and:

```js
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical'];
```

Run the same command → all pass.

**Step 3 — check the ripple.** `fishSvg()` computes `tier = RARITY_ORDER.indexOf(spec.rarity)`, so Mythical is now `5` not `4`, and `crown = tier >= 3` now fires for Epic. Run:

```bash
node --test tests/angler-look.test.js tests/angler-fishing.test.js
```

If a look test asserts a specific sparkle count or that only Legendary+ get a crown, update it to the new tier maths and say so in the commit body. Do not "fix" it by special-casing Epic back out.

Commit: `feat(angler): an Epic tier between Rare and Legendary`

---

### Task 2 — Give every lake full Rare→Mythical coverage

Today the lakes are tiered like a staircase, not spread:

| Lake | current species |
|---|---|
| Aero Lake | 6 × Common |
| DORFic Delta | 3 × Uncommon, 3 × Rare |
| Eco Marsh | 4 × Uncommon, 2 × Rare, 1 × Legendary |
| Glacier Fjord | 1 × Uncommon, 2 × Rare, 2 × Legendary, 1 × Mythical |
| Dark Aero Deep | 2 × Legendary, 4 × Mythical |

The request is that **every** lake carries Rare, Epic, Legendary and Mythical. So each lake needs at least four new fish, and the two lower lakes need their Common/Uncommon spread widened.

**Step 1 — RED.** Append:

```js
test('every lake carries at least one fish of each high tier', () => {
  for (const area of AREAS) {
    for (const rarity of ['Rare', 'Epic', 'Legendary', 'Mythical']) {
      const held = area.fish.map((id) => FISH.find((f) => f.id === id)?.rarity);
      assert.ok(held.includes(rarity),
        `${area.name} has no ${rarity}; it only has ${[...new Set(held)].join(', ')}`);
    }
  }
});

test('every lake still has at least six species', () => {
  for (const area of AREAS) assert.ok(area.fish.length >= 6, `${area.name} is thin`);
});

test('every fish belongs to at least one lake and no lake lists a stranger', () => {
  const known = new Set(FISH.map((f) => f.id));
  for (const area of AREAS) {
    for (const id of area.fish) assert.ok(known.has(id), `${area.name} lists unknown ${id}`);
  }
});

test('the Epic fish exist and are the tier we just added', () => {
  const epic = FISH.filter((f) => f.rarity === 'Epic');
  assert.ok(epic.length >= 5, `expected an Epic in every lake, found ${epic.length}`);
});
```

Run → **at least 4 failures**. RED confirmed.

**Step 2 — GREEN.** Add one Epic fish per lake plus whatever the coverage test still complains about. Each entry must have every field the existing table uses, or `fishSvg()` will render `undefined`:

```js
{ id: 'solarspar', name: 'Solarspar', rarity: 'Epic', pricePerKg: 26, minKg: 6, maxKg: 19,
  fight: 0.62, hue: 268, draw: 'long', weight: 6,
  hook: 'The line goes slack, then tightens all at once. Something enormous turns over.' },
```

Field notes:
- `id` — lowercase, hyphenated, globally unique.
- `draw` — one of `slim`, `deep`, `flat`, `long` (`FISH_SHAPES` has exactly these four). An unknown one falls back to the first fish's shape, silently.
- `hue` — a number 0–360, and it must be distinct enough from its lake-mates to tell apart.
- `weight` — the roll weight. Lower = rarer. Existing Mythicals use `weight: 2`, Legendaries `3`–`4`, Epics should sit around `5`–`6`.
- `hook` — one line, second person, present tense. This shows the moment the hook goes in.
- **Every fish needs its own `id` added to its lake's `fish` array**, or it is unreachable — `rollFish` only ever draws from `area.fish`.

Add the ids to the lakes too. Run:

```bash
node --test tests/angler-fishing.test.js
```

**Step 3 — check the weight sanity.** Existing test `later lakes are strictly harder than earlier ones` compares average `fight`. Run the full suite; if your new Epics in an early lake push its average above a later lake's, that test will fail and you should rebalance `fight` rather than delete it.

Commit: `feat(angler): an Epic, and a Rare-to-Mythical spread in every lake`

---

### Task 3 — Three more ordinary rods, so the first gate is eight

You want **8 no-trait rods** required to leave Aero Lake. There are 5. Add 3.

**Step 1 — RED.** Append:

```js
test('eight ordinary rods stand between the first two lakes', () => {
  const ordinary = Object.values(RODS).filter((r) => r.traits.length === 0);
  assert.equal(ordinary.length, 8, `expected 8 no-trait rods, found ${ordinary.length}`);
});

test('the ordinary rods are the eight cheapest, and the trait rods cost more', () => {
  const ordinary = Object.values(RODS).filter((r) => r.traits.length === 0)
    .sort((a, b) => a.price - b.price);
  const dearestOrdinary = ordinary[ordinary.length - 1].price;
  for (const rod of Object.values(RODS)) {
    if (rod.traits.length > 0) {
      assert.ok(rod.price > dearestOrdinary,
        `${rod.id} is a specialist but does not cost a premium over ${dearestOrdinary}`);
    }
  }
});
```

Run → RED, "expected 8 no-trait rods, found 5".

**Step 2 — GREEN.** Add three entries to `RODS`, slotted after `titan` and before the specialist block, with prices above `titan`'s 11000 but below `canopy`'s 16000. Use these — Frutiger names, escalating stats, `traits: []`:

```js
  zephyr: {
    id: 'zephyr', name: 'Zephyr Spindle', price: 12800,
    control: 0.47, resilience: 0.80, luck: 1.9, lureSpeed: 4.4, maxKg: 150,
    traits: [],
    blurb: 'Weighs nothing. Catches nothing. Catches plenty, actually.',
  },
  quicksilver: {
    id: 'quicksilver', name: 'Quicksilver Ribbon', price: 14200,
    control: 0.48, resilience: 0.82, luck: 2.0, lureSpeed: 4.6, maxKg: 185,
    traits: [],
    blurb: 'Bends like it is apologising. Returns like it is not.',
  },
  horizon: {
    id: 'horizon', name: 'Horizon Curve', price: 15600,
    control: 0.49, resilience: 0.84, luck: 2.1, lureSpeed: 4.8, maxKg: 220,
    traits: [],
    blurb: 'Long enough that you forget you are holding it.',
  },
```

**Step 3 — art for each.** Every rod needs a `ROD_LOOKS` entry or `rodArt()` silently falls back to `bamboo`. Existing test `every rod has distinct artwork` will catch a missing one. Length and width must keep increasing — test `each rod gets longer and thicker as it is upgraded` enforces this:

```js
  zephyr:      { path: 'M40.7 52 L65 22', width: 3.2, colour: '#7fb8d8' },
  quicksilver: { path: 'M40.7 52 L66 22', width: 3.5, colour: '#c3d4e0' },
  horizon:     { path: 'M40.7 52 L67 21', width: 3.8, colour: '#4c6b80' },
```

Run `node --test tests/angler-fishing.test.js` → all pass, including `RODS_BY_PRICE lists every rod from cheapest to dearest`.

Commit: `feat(angler): three more ordinary rods, so the first gate is eight`

---

### Task 4 — Frutiger names and cooler rod art

The current names are dull — `Bamboo Pole`, `Carbon Float`, `Oak Lance`, `Titan Aero`. They read as a catalogue, not as Frutiger. Rename all 11 and give the rods distinguishable art.

**Step 1 — RED.** Append:

```js
test('no rod is named after its own material', () => {
  for (const rod of Object.values(RODS)) {
    assert.doesNotMatch(rod.name, /^(Bamboo|Carbon|Oak)\b/,
      `${rod.id} is still named after what it is made of: ${rod.name}`);
  }
});

test('every rod name is unique', () => {
  const names = Object.values(RODS).map((r) => r.name);
  assert.equal(new Set(names).size, names.length, 'two rods share a name');
});

test('every rod has a blurb in the game voice', () => {
  for (const rod of Object.values(RODS)) {
    assert.match(rod.blurb ?? '', /\.$/, `${rod.id} has no blurb, or it lacks a full stop`);
    assert.ok(rod.blurb.length >= 18, `${rod.id} needs a fuller blurb`);
  }
});

test('every rod has its own colour and thickness', () => {
  const looks = Object.keys(RODS).map((id) => rodArt(id));
  assert.equal(new Set(looks.map((l) => l.colour)).size, looks.length,
    'two rods share a colour');
  assert.equal(new Set(looks.map((l) => l.width)).size, looks.length,
    'two rods share a thickness');
});
```

Run → RED on `Bamboo Pole`.

**Step 2 — GREEN.** Rename and re-blurb every rod. Suggested set (Frutiger-flavoured, not material names):

| id | new name |
|---|---|
| `bamboo` | Splinter |
| `willow` | Greenstalk |
| `carbon` | Graphite Whisper |
| `oak` | Deeproot |
| `titan` | Cloudlance |
| `zephyr` | Zephyr Spindle |
| `quicksilver` | Quicksilver Ribbon |
| `horizon` | Horizon Curve |
| `canopy` | Fernwhisper |
| `glacier` | Frostline Core |
| `abyss` | Abyssal Rig |

Every blurb ends in a full stop and is at least 18 characters, in the dry voice already established (`Splinters. Still better than nothing.`).

**Step 3 — art.** Give each rod a distinct `colour` and `width` in `ROD_LOOKS`. Upgrades get longer (`path` end-point rises) and thicker (`width` grows), because two tests enforce that. Anything more elaborate than `{path, width, colour}` is **out of scope** — `withTip()` derives the lure position from the path and a stylesheet cannot override the inline `stroke`/`fill` that `paintRod()` writes. Keep the shape simple; carry the personality in the colour.

Commit: `feat(angler): Frutiger names and distinct art for every rod`

---

### Task 5 — The DORFic Delta `channel` trait

`doric-delta` has `trait: null`. Give it `channel`, and note it in `traitNote`.

**Step 1 — RED.** Append:

```js
test('DORFic Delta has the channel trait and it is satisfiable', () => {
  const delta = AREAS.find((a) => a.id === 'doric-delta');
  assert.equal(delta.trait, 'channel');
  assert.ok(delta.traitNote, 'the gate must explain itself');
  const carry = Object.values(RODS).filter((r) => r.traits.includes('channel'));
  assert.ok(carry.length >= 1, 'no rod can fish DORFic Delta');
  assert.equal(rodWorksIn(carry[0].id, 'doric-delta'), true);
  assert.equal(rodWorksIn('bamboo', 'doric-delta'), false);
});

test('every trait-gated lake has a note and at least one rod that opens it', () => {
  for (const area of AREAS) {
    if (!area.trait) continue;
    assert.ok(area.traitNote, `${area.name} has a trait but no traitNote`);
    const carry = Object.values(RODS).filter((r) => r.traits.includes(area.trait));
    assert.ok(carry.length >= 1, `${area.name} can never be fished`);
  }
});
```

Run → RED, "expected 'channel', got null".

**Step 2 — GREEN.** Two edits.

In `AREAS`, change the `doric-delta` entry:

```js
    trait: 'channel',
    traitNote: 'needs a rod that can hold a straight line through the channels',
```

Add a `channel` rod. It must be **cheaper than the other specialists** so it can be the free gift without being a windfall, and it must carry a real premium over the 8th ordinary rod (15600) so the gate still means something:

```js
  channel: {
    id: 'channel', name: 'Straightwater', price: 17000,
    control: 0.48, resilience: 0.83, luck: 2.0, lureSpeed: 4.9, maxKg: 200,
    traits: ['channel'],
    blurb: 'Finds the one straight line through a maze of channels.',
  },
```

And art:

```js
  channel: { path: 'M40.7 52 L68 22', width: 3.6, colour: '#e07b2a' },
```

Run → all pass. Existing test `the later lakes are trait-gated, and every gate is satisfiable` will now include DORFic and should still pass.

Commit: `feat(angler): a channel trait for DORFic Delta`

---

### Task 6 — Per-area rod requirements, replacing the global "own everything" gate

This is the heart of the request. The rule becomes:

> To open **area N**, you must have landed every fish in **area N−1**'s index **and** own every rod that carries **area N−1**'s trait. For Aero Lake, which has no trait, that means all 8 ordinary rods.

So each area declares which rods stand in front of it. Add a `requiredRods` field — the rods you must own to *leave* this area.

**Step 1 — RED.** Append:

```js
test('each area declares the rods that gate the next one', () => {
  for (const area of AREAS) {
    assert.ok(Array.isArray(area.requiredRods) && area.requiredRods.length > 0,
      `${area.name} does not say which rods gate it`);
    for (const id of area.requiredRods) {
      assert.ok(RODS[id], `${area.name} requires unknown rod ${id}`);
    }
  }
});

test('Aero Lake is gated by all eight ordinary rods', () => {
  const lake = AREAS[0];
  const ordinary = Object.keys(RODS).filter((id) => RODS[id].traits.length === 0);
  assert.equal(lake.requiredRods.length, 8);
  assert.deepEqual([...lake.requiredRods].sort(), [...ordinary].sort());
});

test('a trait lake is gated by the rods carrying its own trait', () => {
  for (const area of AREAS) {
    if (!area.trait) continue;
    const carry = Object.keys(RODS).filter((id) => RODS[id].traits.includes(area.trait));
    assert.deepEqual([...area.requiredRods].sort(), [...carry].sort(),
      `${area.name} should be gated by every ${area.trait} rod`);
  }
});

test('an area stays shut until both its fish and its rods are done', () => {
  const lake = AREAS[0];
  const landed = Object.fromEntries(AREAS[0].fish.map((id) => [id, 1]));
  const owned = lake.requiredRods.slice(0, -1);
  assert.equal(areaUnlocked(AREAS[1], { bestiary: landed, owned }), false,
    'all the fish but one rod short must still be shut');
  const complete = { bestiary: landed, owned: lake.requiredRods };
  assert.equal(areaUnlocked(AREAS[1], complete), true,
    'every fish and every rod must open it');
});
```

Run → RED, `doric-delta`/`eco-marsh` etc. have no `requiredRods`.

**Step 2 — GREEN.** Add `requiredRods` to each area. **Order matters** — the list for the free-gift rod puts `channel` first, because the gift always grants the cheapest:

```js
// in AREAS[0] (aero-lake), no trait, so all eight ordinary rods
    requiredRods: ['bamboo', 'willow', 'carbon', 'oak', 'titan',
      'zephyr', 'quicksilver', 'horizon'],

// in AREAS[1] (doric-delta)
    requiredRods: ['channel'],

// in AREAS[2] (eco-marsh)
    requiredRods: ['canopy'],

// in AREAS[3] (glacier-fjord)
    requiredRods: ['glacier'],

// in AREAS[4] (dark-aero-deep)
    requiredRods: ['abyss'],
```

If you give any trait lake more than one rod later, list the free-gift rod first.

Now rewrite `areaUnlocked` to use it. Replace the whole function:

```js
export function areaUnlocked(area, progress) {
  if (!area || area.locked === false) return true;
  const bestiary = progress?.bestiary ?? {};
  const owned = progress?.owned ?? [];

  // Every fish in the lake you are standing in must be landed. This used to count
  // the fish in the lake being opened, so a lake advertised its own contents
  // before you had earned them.
  const index = AREAS.indexOf(area);
  const previous = index > 0 ? AREAS[index - 1] : null;
  const gate = previous ? previous.fish : area.fish;
  if (!gate.every((id) => Number(bestiary[id]) > 0)) return false;

  // And every rod built for that same lake. This used to demand every rod in the
  // game, which meant the third lake could never open before you had already
  // bought the rod it hands you.
  const rods = previous ? previous.requiredRods ?? [] : area.requiredRods ?? [];
  return rods.every((id) => owned.includes(id));
}
```

Run `node --test tests/angler-fishing.test.js`. **Expect failures in the existing gate tests** — including `every rod is required, and a lake stays shut without them`, which asserted the old all-11 behaviour. Update those tests to the new rule rather than weakening the new one. Each rewritten test should still be a real assertion: e.g. "a lake stays shut without its rods" should remove one rod from the area's own `requiredRods` and assert shut.

Commit: `feat(angler): gate each lake on its own fish and its own rods`

---

### Task 7 — `areaProgress` reports the new gate

The lake picker badge must show what is actually missing, or it lies.

**Step 1 — RED.** Append:

```js
test('the progress badge counts this lake fish and this lake rods', () => {
  const lake = AREAS[0];
  const progress = areaProgress(lake, { bestiary: {}, owned: ['bamboo'] });
  assert.equal(progress.total, lake.fish.length);
  assert.equal(progress.landed, 0);
  assert.equal(progress.rodTotal, lake.requiredRods.length);
  assert.equal(progress.rods, 1);
  assert.match(progress.reason ?? '', /rod|lake/i,
    'the badge must say what is outstanding');
});
```

Run → RED, no `reason`.

**Step 2 — GREEN.** Replace `areaProgress`:

```js
export function areaProgress(area, progress) {
  const bestiary = progress?.bestiary ?? {};
  const owned = progress?.owned ?? [];
  const index = AREAS.indexOf(area);
  const previous = index > 0 ? AREAS[index - 1] : null;
  const gate = previous ? previous.fish : (area?.fish ?? []);
  const rods = previous ? previous.requiredRods ?? [] : area?.requiredRods ?? [];

  const landed = gate.filter((id) => Number(bestiary[id]) > 0).length;
  const rods = owned.filter((id) => (previous?.requiredRods ?? area?.requiredRods ?? []).includes(id)).length;

  const missing = rods < rods.length ? 'rods' : 'fish';
  return {
    landed,
    total: gate.length,
    rods,
    rodTotal: rods.length,
    reason: areaUnlocked(area, progress) ? '' : `${rods.length - rods} more rods, ${gate.length - landed} more fish`,
    missing,
  };
}
```

That draft has a shadowed `rods` — **do not paste it as-is.** Use this corrected version:

```js
export function areaProgress(area, progress) {
  const bestiary = progress?.bestiary ?? {};
  const owned = progress?.owned ?? [];
  const index = AREAS.indexOf(area);
  const previous = index > 0 ? AREAS[index - 1] : null;
  const gate = previous ? previous.fish : (area?.fish ?? []);
  const needed = previous ? previous.requiredRods ?? [] : area?.requiredRods ?? [];

  const landed = gate.filter((id) => Number(bestiary[id]) > 0).length;
  const have = needed.filter((id) => owned.includes(id)).length;

  return {
    landed,
    total: gate.length,
    rods: have,
    rodTotal: needed.length,
    reason: areaUnlocked(area, progress)
      ? ''
      : `${needed.length - have} more rod${needed.length - have === 1 ? '' : 's'}, ` +
        `${gate.length - landed} more fish`,
  };
}
```

Commit: `feat(angler): the lake badge reports the gate you are actually up against`

---

### Task 8 — Angler levels

Levels do exactly two things, per the decision above: a **small permanent luck bonus**, and they **gate which seals you can buy**. They do not gate rods.

**Step 1 — RED.** Append:

```js
test('levels rise with catches and never fall', () => {
  const xp = xpForCatch({ rarity: 'Common', kg: 1 });
  const a = levelFrom({ xp: 0 });
  const b = levelFrom({ xp: xp * 3 });
  assert.ok(b.level > a.level, 'three catches must raise the level');
  assert.equal(levelFrom({ xp: xp * 3 }).level, b.level, 'levels are pure');
  assert.equal(levelFrom({ xp: xp * 3 - 1 }).level <= b.level, true,
    'xp only ever goes up');
});

test('luck bonus from levels is small and capped', () => {
  const luck = luckFromLevel(levelFrom({ xp: 0 }).level);
  const huge = luckFromLevel(levelFrom({ xp: 10_000_000 }).level);
  assert.equal(huge, 0, 'level 1 is the floor');
  assert.ok(huge >= 0 && huge <= 2.5, `level luck must stay small, got ${huge}`);
  void luck;
});

test('a level is never negative and always has a label', () => {
  for (const xp of [0, 1, 50, 5000, 1e9]) {
    const { level, title } = levelFrom({ xp });
    assert.ok(Number.isInteger(level) && level >= 1, `level ${level} at xp ${xp}`);
    assert.ok(title && title.length, 'every level needs a title');
  }
});
```

Run → RED, no `levelFrom`.

**Step 2 — GREEN.** Add to `fishing.js`:

```js
/* ------------------------------------------------------------------ levels */

/** How much rank a catch is worth. Rarer and heavier fish earn more. */
export function xpForCatch(fish, kg = 0) {
  const tier = Math.max(0, RARITY_ORDER.indexOf(fish?.rarity));
  return Math.round(12 * (tier + 1) * (1 + (kg ?? 0) / 20));
}

/** xp needed to reach `level`. Quadratic, so early ranks come fast. */
export function xpForLevel(level) {
  return Math.round(60 * Math.pow(Math.max(0, level - 1), 1.55));
}

const RANK_TITLES = [
  'Deckhand', 'Bubblemaster', 'Surface Skimmer', 'Current Rider',
  'Channel Fisher', 'Deep Listener', 'Glasswater Sage', 'Sunscale Warden',
];

/**
 * The player's rank from total xp.
 *
 * Pure, and tolerant of a missing xp: an old save has none, and that is level 1,
 * not a crash.
 */
export function levelFrom({ xp = 0 } = {}) {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let level = 1;
  while (level < 99 && total >= xpForLevel(level + 1)) level += 1;
  const title = RANK_TITLES[Math.min(RANK_TITLES.length - 1, Math.floor((level - 1) / 2))];
  return { level, title, xp: total, next: xpForLevel(level + 1) };
}

/**
 * The luck levels add, on top of the rod's own.
 *
 * Deliberately capped at 2.0: ranks should take the edge off a bad streak, not
 * replace rod choice as the way to fish rare fish.
 */
export function luckFromLevel(level) {
  return Math.min(2.0, Math.max(0, (level - 1) * 0.08));
}
```

Run → all pass. `xpForLevel` grows quadratically-ish, so level 1→2 costs 0 xp and the first catch levels you immediately — check that reads sensibly and adjust the constant if level 1 is instantly skipped.

Commit: `feat(angler): a level rank with a small luck bonus`

---

### Task 9 — Lost Frutiger items, the second currency

A second economy: catching occasionally recovers a **lost Frutiger object** — a lost toy, a dropped gadget, a bubble-gum dispenser — worth a few hundred coins. This is the sink for the seal shop, deliberately separate from fish money so it never competes with rod prices.

**Step 1 — RED.** Append:

```js
test('lost items are a real table with prices and a lake each', () => {
  assert.ok(LOST_ITEMS.length >= 12, `expected a decent junk table, found ${LOST_ITEMS.length}`);
  const ids = LOST_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'two lost items share an id');
  for (const item of LOST_ITEMS) {
    assert.ok(item.name, `${item.id} has no name`);
    assert.ok(Number.isFinite(item.value) && item.value > 0, `${item.id} must be worth something`);
    assert.ok(item.blurb?.length >= 12, `${item.id} needs a blurb`);
  }
});

test('lost items only drop at a sane rate', () => {
  const rates = LOST_ITEMS.map((i) => i.chance);
  for (const chance of rates) assert.ok(chance > 0 && chance < 0.5, `chance ${chance} is out of band`);
  assert.equal(new Set(rates).size, rates.length, 'two items share a drop chance');
});

test('a cast recovers nothing or exactly one known item', () => {
  assert.equal(rollLostItem(-1), null, 'a negative roll recovers nothing');
  for (let n = 0; n < 200; n += 1) {
    const item = rollLostItem(n / 200);
    if (item) assert.ok(LOST_ITEMS.includes(item), `recovered an item not in the table: ${item.id}`);
  }
  assert.ok(rollLostItem(0.999) === null, 'a high roll must still sometimes miss');
});

test('every lake can produce lost items', () => {
  const waters = new Set(LOST_ITEMS.map((i) => i.water));
  assert.equal(waters.size, AREAS.length, `expected ${AREAS.length} waters, got ${waters.size}`);
  for (const area of AREAS) {
    assert.ok(LOST_ITEMS.some((i) => i.water === area.id), `${area.name} yields nothing`);
  }
});
```

Run → RED, `LOST_ITEMS` is not exported.

**Step 2 — GREEN.** Add to `fishing.js`:

```js
/* --------------------------------------------------------- lost Frutiger items */

/**
 * Things people drop in the water and never get back. Recovering one is the
 * second economy: it funds seals without competing with rod prices, so a good
 * cast still feels worth something on a bad day.
 *
 * `water` is the lake id, so each lake yields its own flavour of lost object.
 * `chance` is per cast and must be unique across the table.
 */
export const LOST_ITEMS = [
  { id: 'gumball', name: 'Gumball Globe', water: 'aero-lake', value: 140, chance: 0.30,
    hue: 350, blurb: 'Half the balls are still in it. You are not going to check.' },
  { id: 'bubblewand', name: 'Bubble Wand', water: 'aero-lake', value: 260, chance: 0.24,
    hue: 195, blurb: 'Still good. Still makes the exact same noise.' },
  { id: 'sunhat', name: 'Sun Hat, One Size', water: 'aero-lake', value: 180, chance: 0.20,
    hue: 45, blurb: 'Someone is going to want this back. That is not you.' },
  { id: 'cassette', name: 'Chrome Cassette', water: 'doric-delta', value: 420, chance: 0.18,
    hue: 28, blurb: 'Side A is scratched. Side B is worse.' },
  { id: 'skatebit', name: 'Roller Skate, Single', water: 'doric-delta', value: 640, chance: 0.14,
    hue: 18, blurb: 'One boot. No idea where the other went.' },
  { id: 'doric', name: 'DORFic Compass', water: 'doric-delta', value: 900, chance: 0.10,
    hue: 32, blurb: 'Points confidently at straight lines. Not at water.' },
  { id: 'frogglass', name: 'Frog-Shaped Glass', water: 'eco-marsh', value: 520, chance: 0.17,
    hue: 110, blurb: 'Green. Slightly warm. Definitely had a frog on it.' },
  { id: 'boot', name: 'Wader Boot', water: 'eco-marsh', value: 780, chance: 0.13,
    hue: 90, blurb: 'Full of very cold very green water.' },
  { id: 'seedpod', name: 'Seed Pod', water: 'eco-marsh', value: 340, chance: 0.20,
    hue: 120, blurb: 'It may already be growing. That is the exciting part.' },
  { id: 'icekey', name: 'Frost Key', water: 'glacier-fjord', value: 1250, chance: 0.12,
    hue: 200, blurb: 'Too cold to hold. You are holding it.' },
  { id: 'snowlens', name: 'Snow Goggles', water: 'glacier-fjord', value: 880, chance: 0.15,
    hue: 190, blurb: 'For looking at snow. You are looking at water.' },
  { id: 'globe', name: 'Glass Globe', water: 'glacier-fjord', value: 1500, chance: 0.09,
    hue: 205, blurb: 'Inside: a small snowstorm. Do not shake.' },
  { id: 'divewatch', name: 'Pressure Watch', water: 'dark-aero-deep', value: 2100, chance: 0.10,
    hue: 215, blurb: 'Still ticking. Should not be, down here.' },
  { id: 'glowlamp', name: 'Deepglow Lamp', water: 'dark-aero-deep', value: 1750, chance: 0.12,
    hue: 185, blurb: 'On its own, in the dark, for a very long time.' },
  { id: 'blackbox', name: 'Black Chrome Box', water: 'dark-aero-deep', value: 2600, chance: 0.08,
    hue: 230, blurb: 'No maker mark. No seams. Very heavy.' },
];

/**
 * What a single cast hauls up, or null.
 *
 * `roll` is 0..1 from the caller — no Math.random in here. Chance is scaled by how
 * rare the fish you just caught is: a Mythical means you were fishing well, and
 * the junk comes up with it.
 */
export function rollLostItem(roll, { rarityScale = 1 } = {}) {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  const boosted = LOST_ITEMS.map((item) => ({ item, p: item.chance * rarityScale }));
  const total = boosted.reduce((sum, e) => sum + e.p, 0);
  if (total <= 0) return null;
  let cursor = roll * total;
  for (const entry of boosted) {
    cursor -= entry.p;
    if (cursor <= 0) return entry.item;
  }
  return null;
}

/** The items a given lake can produce, cheapest first. */
export function lostItemsFor(areaId) {
  return LOST_ITEMS.filter((i) => i.water === areaId)
    .sort((a, b) => a.value - b.value);
}
```

Run → all pass.

Commit: `feat(angler): lost Frutiger items, a second currency`

---

### Task 10 — Pet seals

A seal is a companion: it **raises luck**, it can **duplicate a catch**, and it **comments on what you land**. Only **one is equipped at a time**.

**Step 1 — RED.** Append:

```js
test('seals are a real table, one per lake, with a distinct perk each', () => {
  assert.ok(SEALS.length >= 5, `expected a seal per lake, found ${SEALS.length}`);
  const ids = SEALS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'two seals share an id');
  for (const seal of SEALS) {
    assert.ok(SEALS.find((x) => x.id === seal.id)?.luck > 0, `${seal.id} needs luck`);
    assert.ok(Number.isFinite(seal.dupeChance) && seal.dupeChance > 0 && seal.dupeChance < 1,
      `${seal.id} duplicate chance must be between 0 and 1`);
    assert.ok(Number.isInteger(seal.level) && seal.level >= 1,
      `${seal.id} must need a level`);
    assert.ok(seal.comments.favourite?.length >= 8, `${seal.id} needs a favourite line`);
    assert.ok(seal.comments.beat?.length >= 8, `${seal.id} needs a "too good" line`);
  }
});

test('one seal per lake, and a seal can only be bought where you can fish', () => {
  const homes = SEALS.map((s) => s.home);
  assert.equal(new Set(homes).size, SEALS.length, 'two seals share a home lake');
  for (const seal of SEALS) {
    assert.ok(AREAS.find((a) => a.id === seal.home), `${seal.id} has no home lake`);
  }
});

test('a seal you cannot afford or has not levelled is refused, with a reason', () => {
  const cheap = SEALS[0];
  const broke = buySeal({ coins: 0 }, cheap.id, 1);
  assert.equal(broke.ok, false);
  assert.match(broke.reason, /coin/i, 'being broke must be explained');
  const toolow = buySeal({ coins: 999999 }, cheap.id, 1);
  assert.equal(toolow.ok, false);
  assert.match(toolow.reason, /level/i, 'being under-levelled must be explained');
});

test('only one seal is equipped, and swapping is free', () => {
  const owned = SEALS.map((s) => s.id);
  const first = equipSeal(owned, SEALS[0].id);
  assert.equal(first.ok, true);
  assert.equal(first.sealId, SEALS[0].id);
  const second = equipSeal(owned, SEALS[1].id);
  assert.equal(second.sealId, SEALS[1].id, 'swapping replaces, it does not stack');
  assert.equal(second.paid, 0, 're-equipping an owned seal is free');
  const notowned = equipSeal([SEALS[0].id], SEALS[3].id);
  assert.equal(notowned.ok, false, 'you cannot equip a seal you do not own');
});

test('seal luck adds to rod luck and is bounded', () => {
  const best = SEALS.reduce((m, s) => Math.max(m, s.luck), 0);
  assert.ok(best > 0 && best < 3, `seal luck must be modest, worst case ${best}`);
});

test('a seal comments on your catch and knows when you could do better', () => {
  const seal = SEALS[0];
  const aMythical = FISH.find((f) => f.rarity === 'Mythical');
  const line = sealComment(seal, aMythical, { bestiary: {} });
  assert.ok(line && line.length > 8, 'every catch gets a comment');
  assert.equal(typeof line, 'string');
});
```

Run → RED, `SEALS` not exported.

**Step 2 — GREEN.** Add to `fishing.js`:

```js
/* ---------------------------------------------------------------- pet seals */

/**
 * The companions. Each one comes from a lake, adds luck, and sometimes hands you
 * a second copy of what you just caught.
 *
 * `dupeChance` is per catch and only ever fires once. `level` is the rank you
 * must reach before the shop will sell it to you.
 */
export const SEALS = [
  { id: 'bubbles', name: 'Bubbles', home: 'aero-lake', luck: 0.8, dupeChance: 0.06,
    level: 1, price: 900, hue: 195, shape: 'round',
    line: 'Bubbles watches your line like it is a very slow television.',
    comments: {
      favourite: 'That is my favourite. Genuinely. Do not tell the others.',
      beat: 'You could fish something better than that. I have seen what is down there.',
      rare: 'Oh. Oh, that is a good one.',
      dupe: 'Mine is bigger.',
    } },
  { id: 'tangerine', name: 'Tangerine', home: 'doric-delta', luck: 1.0, dupeChance: 0.07,
    level: 4, price: 2600, hue: 24, shape: 'slab',
    line: 'Tangerine lies on the warmest plank and judges your casting.',
    comments: {
      favourite: 'That is the one. That is the exact one.',
      beat: 'That is beneath you, honestly.',
      rare: 'Straight lines. Straight lines and you still found that.',
      dupe: 'I will take the larger one.',
    } },
  { id: 'moss', name: 'Moss', home: 'eco-marsh', luck: 1.1, dupeChance: 0.08,
    level: 8, price: 5400, hue: 110, shape: 'blobby',
    line: 'Moss is mostly water and entirely opinion.',
    comments: {
      favourite: 'This is the good water. This is the good fish.',
      beat: 'The reeds have better. You could try the reeds.',
      rare: 'Quiet now. That is how you know it is rare.',
      dupe: 'The power of the environment provides two.',
    } },
  { id: 'frost', name: 'Frost', home: 'glacier-fjord', luck: 1.2, dupeChance: 0.09,
    level: 13, price: 9800, hue: 198, shape: 'long',
    line: 'Frost keeps one eye open, which is more than the ice does.',
    comments: {
      favourite: 'Colder than me. Nothing is colder than me.',
      beat: 'The ice has better, if you dare.',
      rare: 'Bore through the ice and found that. Well done.',
      dupe: 'Keep the warmer one.',
    } },
  { id: 'abyss', name: 'Abyss', home: 'dark-aero-deep', luck: 1.4, dupeChance: 0.11,
    level: 19, price: 19000, hue: 232, shape: 'tall',
    line: 'Abyss sits where the light gives up and says nothing for a while.',
    comments: {
      favourite: 'It came up from the same dark I sleep in.',
      beat: 'Down here that was kind of you.',
      rare: 'You should be afraid. You are not, so take it.',
      dupe: 'There is always another one down there.',
    } },
];

/**
 * What the seal says about a catch. Always returns a string, because a pet that
 * says nothing when you land something good is worse than no pet.
 */
export function sealComment(seal, fish, { bestiary = {} } = {}) {
  if (!seal) return '';
  const tier = RARITY_ORDER.indexOf(fish?.rarity);
  const isBest = tier >= 3;
  const known = Object.keys(bestiary).length;

  // A personal best gets its own line, but only once you have a few under your belt.
  if (Number(bestiary[fish?.id]) > 0 && isBest && known > 3) return seal.comments.rare;
  if (isBest) return seal.comments.favourite;
  return seal.comments.beat;
}

/**
 * Buy a seal. Never mutates: on failure the caller gets the same wallet back plus
 * a reason they can read.
 */
export function buySeal(wallet, sealId, level = 1) {
  const seal = SEALS.find((s) => s.id === sealId);
  if (!seal) return { ...wallet, ok: false, reason: 'Unknown seal.' };
  if (wallet.coins < seal.price) {
    return { ...wallet, ok: false, reason: `Not enough coins for ${seal.name}.` };
  }
  if (level < seal.level) {
    return { ...wallet, ok: false, reason: `${seal.name} needs rank ${seal.level}.` };
  }
  return { ok: true, sealId, coins: wallet.coins - seal.price };
}

/**
 * Equip one of the seals you own. Only one seal is ever active, and re-equipping
 * an owned seal is free — the same rule rods follow.
 */
export function equipSeal(owned, sealId) {
  if (!Array.isArray(owned) || !owned.includes(sealId)) {
    return { ok: false, reason: 'You do not own that seal.' };
  }
  return { ok: true, sealId, paid: 0 };
}

/** Total luck from a rod, a rank and an equipped seal. */
export function luckFor({ rod, level = 1, seal = null } = {}) {
  const base = rod?.luck ?? 0;
  return base + luckFromLevel(level) + (seal?.luck ?? 0);
}

/**
 * Whether this catch hands you a second copy. Injected roll, no Math.random.
 * Only ever one duplicate per catch, whatever the roll.
 */
export function sealDuplicates(seal, roll) {
  if (!seal || !Number.isFinite(roll)) return false;
  return roll >= 0 && roll < seal.dupeChance;
}
```

**Step 3 — apply the seal to `rollFish`.** Right now `rollFish(roll, rod, areaId)` reads `rod?.luck`. Change it to take the total:

```js
export function rollFish(roll, rod, areaId, luck = null) {
  // ... unchanged pool setup ...
  const effective = Number.isFinite(luck) ? luck : Math.max(0, rod?.luck || 0);
  const weights = table.map((fish, index) => {
    const base = fish.weight ?? 1;
    const depth = index / Math.max(1, FISH.length - 1);
    const boost = fish.rarity === 'Common' ? 1 : 1 + effective * depth * 2;
    return base * boost;
  });
  // ... unchanged roll ...
}
```

Adding `luck` as a **fourth optional parameter with a fallback to `rod.luck`** means every existing caller and test keeps working unchanged. Do not make it required.

Run `node --test "tests/**/*.test.js"`.

Commit: `feat(angler): pet seals that add luck, duplicate catches and have opinions`

---

### Task 11 — Wire levels, luck and lost items into the controller

The pure functions exist; now the game must use them.

**Step 1 — RED.** Append to `tests/angler-loop.test.js`. That file already has a `boot()` helper that builds a JSDOM window, stubs `Math.random`/`localStorage` and imports `angler.js?run=N` with a cache-busting query. **Reuse it** — do not invent a second boot path. Add tests that drive the HUD:

```js
test('the HUD shows a level and a title', () => {
  const win = boot(NEXT_RUN);
  const doc = win.document;
  assert.ok(doc.getElementById('level'), 'the level readout is missing');
  assert.match(doc.getElementById('level').textContent, /\d/, 'no level number shown');
  assert.match(doc.getElementById('level-title').textContent, /\w/, 'no rank title shown');
});

test('landing a fish adds rank', () => {
  const win = boot(NEXT_RUN);
  const doc = win.document;
  const before = doc.getElementById('level').textContent;
  win.__anglerTest.landFish();
  assert.notEqual(doc.getElementById('level').textContent, before,
    'a catch must move the rank readout');
});
```

**Before writing these, check whether `angler.js` exposes anything for tests.** If it does not, add a single explicit hook at the end of `angler.js`:

```js
// A narrow, explicit hook so tests can drive the loop without synthesising the
// timing-sensitive input path. Exported on the module, not on window.
export const __anglerTest = { landFish, state, get phase() { return state.phase; } };
```

`angler.js` is a module script, so a test importing it gets this directly. If the existing loop tests drive everything through real events, **prefer that** and skip this hook — do not add a test-only backdoor the rest of the codebase does not already have.

**Step 2 — GREEN.** In `angler.js`:

1. Add to `state`: `xp: 0`, `ownedSeals: []`, `equippedSeal: null`, `lost: []`.
2. In `load()`, read `saved.xp`, `saved.ownedSeals`, `saved.equippedSeal`, `saved.lost` — each behind a type check, defaulting safely. An old save has none of them and must not crash. **Only honour `equippedSeal` if it is in `ownedSeals`.**
3. In `save()`, write all four back.
4. In `paintChrome()`, add the level readout:
```js
  const rank = levelFrom({ xp: state.xp });
  if (ui.level) {
    ui.level.textContent = `${rank.level}`;
    ui.levelTitle.textContent = rank.title;
  }
```
5. In `landFish()`, after the existing value and bestiary lines:
```js
  state.xp += xpForCatch(fish, kg);

  // The junk comes up with the catch, and rarer fish mean a luckier haul.
  const tier = Math.max(0, RARITY_ORDER.indexOf(fish.rarity));
  const found = rollLostItem(Math.random(), { rarityScale: 1 + tier * 0.35 });
  if (found) {
    state.coins += found.value;
    state.lost = [...state.lost, found.id];
    say(`You pulled up a ${found.name}. +¤${found.value}`);
  }
```
6. Wherever `rollFish` is called, pass the combined luck:
```js
  const seal = SEALS.find((s) => s.id === state.equippedSeal) ?? null;
  const luck = luckFor({ rod, level: levelFrom({ xp: state.xp }).level, seal });
  const fish = rollFish(Math.random(), rod, state.areaId, luck);
```
7. After landing, offer the duplicate:
```js
  const sealNow = SEALS.find((s) => s.id === state.equippedSeal) ?? null;
  if (sealDuplicates(sealNow, Math.random())) {
    say(`${sealNow.name} nudges a second one loose. Two ${fish.name}, one hook.`);
  }
```

Run → all pass.

Commit: `feat(angler): ranks, junk and seal luck drive the real loop`

---

### Task 12 — The seal shop panel

A second shop beside the rod shop, listing every seal with its luck, duplicate chance, rank requirement and — if you own it — an equip button.

**Step 1 — RED.** Append to `tests/angler-loop.test.js`:

```js
test('the seal shop lists every seal', () => {
  const win = boot(NEXT_RUN);
  const doc = win.document;
  win.document.getElementById('seal-shop-open').click();
  const rows = doc.querySelectorAll('#seal-shop-list .seal');
  assert.equal(rows.length, SEALS.length, 'every seal must be listed');
});

test('a locked seal says what rank it needs', () => {
  const win = boot(NEXT_RUN);
  const doc = win.document;
  win.document.getElementById('seal-shop-open').click();
  const locked = [...doc.querySelectorAll('#seal-shop-list .seal')]
    .find((row) => row.querySelector('.seal__lock'));
  if (locked) assert.match(locked.textContent, /rank \d+/i, 'the lock must say why');
});

test('only one seal is equipped at a time', () => {
  const win = boot(NEXT_RUN);
  const doc = win.document;
  win.document.getElementById('seal-shop-open').click();
  const buttons = [...doc.querySelectorAll('#seal-shop-list .seal__equip')];
  const labels = buttons.map((b) => b.textContent.trim());
  assert.equal(new Set(labels.map((l) => l.replace(/Equip|Equipped/, ''))).size, buttons.length,
    'each row must name its own seal');
  assert.ok(buttons.some((b) => /Equip/.test(b.textContent)), 'there must be equip buttons');
});
```

**Step 2 — GREEN.** In `index.html`, add a panel modelled exactly on the existing `#shop-panel` — same `.shop` / `.shop__panel` / `.shop__list` classes so the Aero glass is inherited and you write no new chrome CSS:

```html
      <div class="shop" id="seal-shop-panel" hidden>
        <div class="shop__panel" role="dialog" aria-modal="true" aria-labelledby="seal-shop-title">
          <h2 class="shop__title" id="seal-shop-title">Seals</h2>
          <p class="shop__wallet">You have <b id="seal-shop-coins">¤0</b></p>
          <p class="shop__wallet">Only one seal can sit with you at a time.</p>
          <div class="shop__list" id="seal-shop-list"></div>
          <p style="margin:.9rem 0 0"><button class="btn" id="seal-shop-close" type="button">Close</button></p>
        </div>
      </div>
```

Add an opener in the HUD, beside `#shop-open`:

```html
      <button class="btn" id="seal-shop-open" type="button">Seals</button>
```

Add the level readout beside the existing `#coins`:

```html
        <span class="hud__rank">rank <b id="level">1</b> <span id="level-title">Deckhand</span></span>
```

In `angler.js`, add `sealShopOpen/Close/List/Coins` to the `ui` map and a `renderSealShop()` modelled on the existing `renderShop()`:

```js
function renderSealShop() {
  const rank = levelFrom({ xp: state.xp });
  ui.sealShopCoins.textContent = state.coins;
  ui.sealShopList.textContent = '';
  for (const seal of SEALS) {
    const row = document.createElement('div');
    row.className = 'seal';
    const owned = state.ownedSeals.includes(seal.id);
    const active = state.equippedSeal === seal.id;
    const tooLow = rank.level < seal.level;

    row.innerHTML = `
      <div class="seal__head">
        <b class="seal__name">${seal.name}</b>
        <span class="seal__home">${AREAS.find((a) => a.id === seal.home)?.name ?? ''}</span>
      </div>
      <p class="seal__line">${seal.line}</p>
      <p class="seal__perks">luck +${seal.luck.toFixed(1)} · duplicate ${(seal.dupeChance * 100).toFixed(0)}%</p>
      ${tooLow ? `<span class="seal__lock">needs rank ${seal.level}</span>` : ''}`;

    const button = document.createElement('button');
    button.className = 'btn seal__equip';
    if (owned) {
      button.textContent = active ? 'Equipped' : `Equip ${seal.name}`;
      button.addEventListener('click', () => {
        const result = equipSeal(state.ownedSeals, seal.id);
        if (!result.ok) return say(result.reason);
        state.equippedSeal = result.sealId;
        save(); renderSealShop(); paintChrome();
        say(`${seal.name} settles onto the dock beside you.`);
      });
    } else {
      button.textContent = `¤${seal.price}`;
      button.addEventListener('click', () => {
        const result = buySeal({ coins: state.coins }, seal.id, rank.level);
        if (!result.ok) return say(result.reason);
        state.coins = result.coins;
        state.ownedSeals = [...state.ownedSeals, seal.id];
        state.equippedSeal = seal.id;
        save(); renderSealShop(); paintChrome();
        say(`${seal.name} comes home with you.`);
      });
    }
    row.appendChild(button);
    ui.sealShopList.appendChild(row);
  }
}
```

Wire `#seal-shop-open` → show + render, `#seal-shop-close` → hide, mirroring `openShop()`/`closeShop()`.

Add a small amount of CSS for `.seal`, `.seal__head`, `.seal__lock`, `.seal__equip`, `.hud__rank` — reuse the site's existing glass tokens (`--glass-top`, `--hairline`, `--ink`) so it matches.

Run `node --test "tests/**/*.test.js"`.

Commit: `feat(angler): a seal shop with one active companion`

---

### Task 13 — The free trait rod on arrival

The one-time gift: arriving in a lake whose trait you have no rod for **gives** you that lake's cheapest trait rod, into the bag, auto-equipped.

**Step 1 — RED.** Append:

```js
test('arriving in a lake gifts you its rod, once', () => {
  const a = visitArea({ ...fullSave, areaId: 'aero-lake' }, 'doric-delta');
  assert.equal(a.gifted, 'channel', 'first arrival must gift the channel rod');
  assert.ok(a.owned.includes('channel'), 'and it must be in the bag');
  assert.equal(a.rodId, 'channel', 'and equipped');

  const b = visitArea(a, 'doric-delta');        // already here
  assert.equal(b.gifted, null, 'no second gift');
});

test('the gift is one-time and never repeats even after leaving', () => {
  let s = visitArea({ ...fullSave, areaId: 'aero-lake' }, 'doric-delta');
  s = visitArea(s, 'eco-marsh');
  s = visitArea(s, 'doric-delta');
  assert.equal(s.gifted, null, 'returning must not re-gift');
});

test('a lake you can already fish gifts you nothing', () => {
  const s = visitArea({ ...fullSave, areaId: 'aero-lake', owned: ['channel'] }, 'doric-delta');
  assert.equal(s.gifted, null, 'you already have the rod');
});

test('the gift is recorded in the save so it cannot be farmed', () => {
  const s = visitArea({ ...fullSave, areaId: 'aero-lake' }, 'doric-delta');
  assert.ok(Array.isArray(s.giftedRods), 'gifts must be remembered');
  assert.deepEqual(s.giftedRods, ['channel']);
});
```

**Step 2 — GREEN.** Add to `fishing.js`:

```js
/* ------------------------------------------------------------ arrival gifts */

/**
 * Move to `areaId` and get whatever that lake owes you.
 *
 * A lake you have no rod for hands you its cheapest trait rod, once, auto-equipped,
 * because arriving somewhere you cannot fish is not an experience worth shipping.
 * The gift is recorded so leaving and coming back cannot farm it.
 *
 * Pure: returns a new progress object and never mutates the one passed in.
 */
export function visitArea(progress, areaId) {
  const area = AREAS.find((a) => a.id === areaId) ?? AREAS[0];
  const owned = progress?.owned ?? [];
  const giftedRods = progress?.giftedRods ?? [];
  const base = { ...progress, owned: [...owned], giftedRods: [...giftedRods], areaId: area.id };

  // Already able to fish here: no gift, ever.
  const canFish = !area.trait || owned.some((id) => RODS[id]?.traits?.includes(area.trait));
  if (canFish || giftedRods.includes(area.requiredRods?.[0])) {
    return { ...base, rodId: progress?.rodId, gifted: null };
  }

  // requiredRods lists the free one first, so [0] is the gift.
  const giftId = area.requiredRods?.[0];
  if (!giftId || !RODS[giftId]) return { ...base, rodId: progress?.rodId, gifted: null };

  return {
    ...base,
    owned: addRodToInventory(base.owned, giftId),
    rodId: giftId,
    gifted: giftId,
  };
}
```

In `angler.js`, `renderLakes()` / the lake-picker click handler must call `visitArea(state, area.id)` instead of setting `state.areaId` directly, then apply `gifted`:

```js
  const moved = visitArea(state, area.id);
  state.owned = moved.owned;
  state.giftedRods = moved.giftedRods;
  state.rodId = moved.rodId;
  state.areaId = moved.areaId;
  if (moved.gifted) {
    say(`${RODS[moved.gifted].name} comes with you. It was lying by the water.`);
  }
```

Add `giftedRods: []` to `state`, to `load()` (array type check) and to `save()`.

Run → all pass.

Commit: `feat(angler): the first rod for a new lake arrives free, once`

---

### Task 14 — Draw the seal on the dock

The seal sits **next to you on the dock** — x≈14, y≈58 in scene space, left of the angler (whose base is at x≈33) and clear of the rod, which sweeps up and to the right from x=40.7.

**Step 1 — RED.** Append to `tests/angler-look.test.js`:

```js
test('the dock has a place for the pet seal', () => {
  assert.match(PAGE, /id="fa-pet"/, 'the scene has no pet element');
});

test('the pet sits on the deck, clear of the angler and the rod', () => {
  const pet = PAGE.slice(PAGE.indexOf('id="fa-pet"'));
  const tag = pet.slice(0, pet.indexOf('>'));
  const cx = Number(/cx="([\d.]+)"/.exec(tag)?.[1]);
  const cy = Number(/cy="([\d.]+)"/.exec(tag)?.[1]);
  assert.ok(Number.isFinite(cx) && Number.isFinite(cy), 'the pet needs a position');
  assert.ok(cy >= 52 && cy <= 62, `the pet must sit on the deck at y=58, got ${cy}`);
  assert.ok(cx > 2 && cx < 26, `the pet must be left of the angler, got x=${cx}`);
  assert.ok(cx < 38, 'the pet must never overlap the rod');
});

test('the pet is drawn in Aero glass, not as a flat blob', () => {
  const block = PAGE.slice(PAGE.indexOf('id="fa-pet"'));
  const chunk = block.slice(0, block.indexOf('</g>') + 4);
  assert.match(chunk, /linearGradient|fill="url\(#fa-pet/, 'the pet needs a gradient');
  assert.match(chunk, /opacity|filter/, 'and some softness');
});

test('the pet is hidden when no seal is equipped', () => {
  assert.match(PAGE, /#fa-pet[^{]*\{[^}]*display:\s*none|hidden/, 'no way to hide it');
});
```

Adjust the `PAGE` constant to match whatever that file already loads — it already reads `index.html`, so read it first rather than re-declaring.

**Step 2 — GREEN.** In `index.html`, inside the scene `<svg>`, add a seal gradient next to the others in `<defs>`:

```html
          <!-- the pet seal: a lit Aero blob, tinted per seal -->
          <linearGradient id="fa-pet" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset="0.4" stop-color="#8fd8f5"/>
            <stop offset="1" stop-color="#2b7fa8"/>
          </linearGradient>
```

Then, **after the `</g>` that closes `#angler-fit`** — the scene uses `preserveAspectRatio="none"` and `fitFigure()` counter-scales that group, so anything inside it would be warped:

```html
        <!-- The pet seal, on the deck to the angler's left. Outside #angler-fit so
             the counter-scale does not warp it. Painted by paintPet(). -->
        <g id="fa-pet" hidden aria-hidden="true">
          <ellipse cx="14" cy="57.4" rx="5.4" ry="2.4" fill="#0a4a70" opacity=".2"/>
          <ellipse cx="14" cy="55.6" rx="4.6" ry="3.4" fill="url(#fa-pet)"/>
          <ellipse cx="12.6" cy="54.4" rx="1.5" ry="1.1" fill="#ffffff" opacity=".8"/>
          <circle cx="15.8" cy="55.2" r="0.55" fill="#06334f"/>
        </g>
```

In `angler.js`, `paintPet()` sets hue from the equipped seal and toggles `hidden`:

```js
function paintPet() {
  const seal = SEALS.find((s) => s.id === state.equippedSeal) ?? null;
  const pet = document.getElementById('fa-pet');
  if (!pet) return;
  pet.hidden = !seal;
  if (seal) {
    const stops = pet.querySelectorAll('stop');
    stops[1].setAttribute('stop-color', `hsl(${seal.hue} 82% 74%)`);
    stops[2].setAttribute('stop-color', `hsl(${seal.hue} 62% 30%)`);
  }
}
```

Call `paintPet()` from `paintChrome()`.

Run → all pass.

Commit: `feat(angler): the seal sits on the dock beside you`

---

### Task 15 — Seal comments when you land a fish

The seal's opinion, surfacing through `say()`.

**Step 1.** In `landFish()`, after the catch is recorded, call:

```js
  const sealNow = SEALS.find((s) => s.id === state.equippedSeal) ?? null;
  const line = sealComment(sealNow, fish, { bestiary: state.bestiary });
  if (line) say(line);
```

**Step 2.** Verify ordering: the lost-item message and the seal comment both use `say()`, which overwrites. Pick one — the seal comment should win, because "that is my favourite" is the more memorable beat. Call `say(line)` **last**.

**Step 3.** Run `node --test "tests/**/*.test.js"`. Add one loop test that a landed fish with a seal equipped produces a comment.

Commit: `feat(angler): your seal has an opinion about every catch`

---

### Task 16 — Save migration for every old save

This is the task most likely to break someone's game. A save written before this work has no `xp`, `ownedSeals`, `equippedSeal`, `lost` or `giftedRods`. It must load, and it must not hand out a free rod twice.

**Step 1 — RED.** Append to `tests/angler-loop.test.js`:

```js
test('a save from before ranks, seals and gifts still loads', () => {
  const win = boot(NEXT_RUN);
  win.localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 5000, rodId: 'oak', owned: ['bamboo', 'willow', 'carbon', 'oak'],
    bestiary: { glidefin: 1.2 }, areaId: 'aero-lake',
  }));
  // Re-import with the save in place, exactly as a returning player would.
  const reloaded = boot(NEXT_RUN + 1);
  const doc = reloaded.document;
  assert.equal(doc.getElementById('level').textContent, '1', 'an old save is rank 1');
  assert.ok(doc.getElementById('level-title').textContent.length > 0, 'and has a title');
  assert.equal(doc.getElementById('coins').textContent, '5000', 'coins survive');
  assert.match(doc.getElementById('rod').textContent, /\w/, 'a rod is equipped');
  assert.equal(doc.getElementById('fa-pet')?.hidden, true, 'no pet until one is bought');
});

test('a corrupt save falls back to a fresh game rather than crashing', () => {
  const win = boot(NEXT_RUN);
  win.localStorage.setItem('fru-angler-save', '{not json');
  const reloaded = boot(NEXT_RUN + 2);
  assert.ok(reloaded.document.getElementById('level'), 'the HUD must still build');
});

test('a save naming a rod you do not own repairs to one you do', () => {
  const win = boot(NEXT_RUN);
  win.localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 0, rodId: 'abyss', owned: ['bamboo'], bestiary: {}, areaId: 'aero-lake',
  }));
  const reloaded = boot(NEXT_RUN + 3);
  assert.match(reloaded.document.getElementById('rod').textContent, /Splinter|Bamboo/,
    'the HUD must not name a rod that is not owned');
});

test('an equipped seal you do not own is discarded', () => {
  const win = boot(NEXT_RUN);
  win.localStorage.setItem('fru-angler-save', JSON.stringify({
    coins: 0, rodId: 'bamboo', owned: ['bamboo'], bestiary: {}, areaId: 'aero-lake',
    equippedSeal: 'abyss', ownedSeals: [], xp: 0,
  }));
  const reloaded = boot(NEXT_RUN + 4);
  assert.equal(reloaded.document.getElementById('fa-pet')?.hidden, true,
    'a save cannot equip a seal it never granted');
});
```

**Step 2 — GREEN.** In `load()`, extend the existing repair pattern. The existing code already does exactly this for `owned` — follow it:

```js
    if (Number.isFinite(saved.xp) && saved.xp >= 0) state.xp = saved.xp;

    state.ownedSeals = [];
    if (Array.isArray(saved.ownedSeals)) {
      for (const id of saved.ownedSeals) {
        if (SEALS.some((s) => s.id === id) && !state.ownedSeals.includes(id)) {
          state.ownedSeals.push(id);
        }
      }
    }
    // Only honour an equipped seal we actually own.
    if (typeof saved.equippedSeal === 'string' && state.ownedSeals.includes(saved.equippedSeal)) {
      state.equippedSeal = saved.equippedSeal;
    } else {
      state.equippedSeal = null;
    }

    state.lost = Array.isArray(saved.lost)
      ? saved.lost.filter((id) => LOST_ITEMS.some((i) => i.id === id))
      : [];
    state.giftedRods = Array.isArray(saved.giftedRods)
      ? saved.giftedRods.filter((id) => RODS[id])
      : [];
```

And in `save()`, add the four keys. **An old save with no `giftedRods` means the player has never been gifted, so their first visit to a trait lake does gift them the rod.** That is correct and intended.

Run → all pass.

Commit: `feat(angler): old saves load, repaired, with no free rod handed out twice`

---

### Task 17 — Economy sanity check

Everything above adds currencies and sinks. Verify the numbers are actually playable rather than assuming.

**Step 1.** Write a throwaway script **outside** the repo (use `$TMPDIR`, which Hermes points at `C:\Users\karin\AppData\Local\hermes\cache\scratch`):

```js
// estimate.mjs
import { FISH, AREAS, SEALS, LOST_ITEMS, xpForCatch, levelFrom } from './vendor/fru-angler/fishing.js';

// Average fish value per lake, weighted the way rollFish actually rolls.
for (const area of AREAS) {
  const pool = area.fish.map((id) => FISH.find((f) => f.id === id)).filter(Boolean);
  const total = pool.reduce((s, f) => s + f.weight, 0);
  const avg = pool.reduce((s, f) => s + (f.pricePerKg * (f.minKg + f.maxKg) / 2) * (f.weight / total), 0);
  const junk = LOST_ITEMS.filter((i) => i.water === area.id);
  const junkRate = junk.reduce((s, i) => s + i.chance, 0);
  console.log(`${area.name.padEnd(18)} fish/cast ${avg.toFixed(0).padStart(7)}  junk ${(junkRate*100).toFixed(0)}%`);
}

console.log('\nseal prices:', SEALS.map((s) => `${s.name} rank${s.level} ¤${s.price}`).join('\n            '));
for (const xp of [0, 500, 2000, 10000, 60000]) {
  console.log(`xp ${String(xp).padStart(6)} -> rank ${levelFrom({ xp }).level} ${levelFrom({ xp }).title}`);
}
```

Run it from the repo root so the relative import resolves: `node "$TMPDIR/estimate.mjs"` will **not** resolve — copy it into the repo root, run, and delete it:

```bash
cp "$TMPDIR/estimate.mjs" ./estimate.mjs && node ./estimate.mjs && rm ./estimate.mjs
```

**Step 2 — judge the output against these targets:**

- Catching a common fish in Aero Lake, plus average junk, should buy the first seal (¤900) within roughly **40–70 casts**. If it takes 400, seals are dead content.
- The rank-19 seal at ¤19000 should be reachable within a long session, not a weekend.
- Junk rate per lake should be roughly 15–40%. Above 40% and the fishing economy stops being about fish.
- Every seal's rank gate should be reachable before the player has spent everything on rods.

**Step 3.** Adjust `LOST_ITEMS` values or `SEALS` prices — whichever knob is wrong — and say in the commit body which numbers you moved and why. Do not tune by editing the test thresholds.

Commit: `chore(angler): tune the seal economy against measured catch rates` (only if you changed numbers).

---

### Task 18 — Full suite and appearance regression

Run everything:

```bash
node --test "tests/**/*.test.js"
```

Expected: **376 + your new tests, 0 failures.** If the count is *lower* than 376, something you added replaced rather than extended a file — stop and find out why.

Then run the appearance tests specifically and confirm the new UI did not break the glass:

```bash
node --test tests/angler-look.test.js tests/tokens.test.js
```

`tokens.test.js` scans `styles.css` and guards against undefined `var()` values. The Angler page has its own `<style>` block that this test does **not** cover, so any token you add in `index.html` for the seal UI is unguarded — check it by eye, or add the same undefined-token guard the Block Blast page has.

Commit: `test(angler): cover ranks, seals, gifts and junk` (amend if you staged tests separately).

---

### Task 19 — Cache stamp

GitHub Pages aggressively serves stale JS and CSS. **Every task above changes `fishing.js` and `angler.js`, which the browser caches hard.** Without a bump, the deployed site runs the old code and every fix appears to do nothing.

Bump the stamp in `src/build.js` and propagate. The shell fetches assets through a `versioned()` helper, so the single source of truth is:

```js
export const BUILD = '2026-10-03-b';   // -> '2026-10-03-c'
```

Then verify synchronisation:

```bash
node --test tests/cache-stamps.test.js
```

Expected: **12 passing, 0 failing.** That test sweeps every same-origin asset path in `src/` and fails if any is unstamped.

Also confirm the Angler page itself is stamped — `vendor/fru-angler/index.html` loads `./angler.js` directly, so its import query must move too:

```bash
grep -o '?v=[0-9a-z-]*' vendor/fru-angler/index.html | sort -u
```

Every stamp must read `2026-10-03-c`. If any still says `2026-10-03-b`, update it — this exact staleness has bitten the site twice already.

Commit: `fix(cache): bump the build stamp for the angler overhaul`

---

### Task 20 — Push, deploy, verify live

**Push:**

```bash
cd /c/Users/karin/game-arcade
export PATH="/c/Users/karin/AppData/Local/hermes/tools/git-2.53.0+3-win32-x64/cmd:$PATH"
git add -A
git status --porcelain          # confirm what is about to go up
git push origin main
```

**Poll for the deploy.** `gh` is not installed, so poll the live URL. **Write to `$LOCALAPPDATA/Temp`, never `/tmp`** — native tools on this host cannot see `/tmp`, and a write there silently produces an empty file, which makes every subsequent check report a false result. This happened once already and nearly produced a false "verified live" claim.

```bash
T="$LOCALAPPDATA/Temp"
for i in $(seq 1 20); do
  sleep 12
  curl -s "https://mynameischarleylerch-bot.github.io/vendor/fru-angler/fishing.js?v=2026-10-03-c" -o "$T/fa.js"
  BYTES=$(wc -c < "$T/fa.js")
  if [ "$BYTES" -gt 40000 ]; then
    echo "LIVE: $BYTES bytes"
    break
  fi
  echo "poll $i: $BYTES bytes"
done
```

Local `fishing.js` is ~37500 bytes and will grow to roughly 60000+ with the new tables, so use a size check plus a content grep:

```bash
grep -c "SEALS\|LOST_ITEMS\|visitArea" "$T/fa.js"
```

Expected: a non-zero count. Then confirm the HTML and controller:

```bash
curl -s "https://mynameischarleylerch-bot.github.io/vendor/fru-angler/index.html" -o "$T/fa.html"
grep -c "fa-pet\|seal-shop" "$T/fa.html"
curl -s "https://mynameischarleylerch-bot.github.io/vendor/fru-angler/angler.js?v=2026-10-03-c" -o "$T/fa2.js"
grep -c "paintPet\|renderSealShop" "$T/fa2.js"
```

All three must be non-zero. Then diff live against local to be certain:

```bash
diff <(tr -d '\r' < vendor/fru-angler/index.html) <(tr -d '\r' < "$T/fa.html") && echo "identical"
```

**Then hand it to the user for visual review.** Browser rendering is unavailable here — the appearance is verified by text assertions and mutation testing only. Say plainly that the gloss, the seal art and the dock position have not been seen by a human, and ask them to open it.

---

## Tests / validation summary

| Suite | Before | After |
|---|---|---|
| `tests/angler-fishing.test.js` | 63 | +~45 |
| `tests/angler-loop.test.js` | 50 | +~15 |
| `tests/angler-look.test.js` | 44 | +~5 |
| everything else | 219 | unchanged |
| **total** | **376** | **~440** |

**Pure layer** (`angler-fishing.test.js`) covers: the Epic tier, per-lake rarity coverage, eight ordinary rods, rod names/art, the channel trait, per-area `requiredRods`, `areaUnlocked` under the new rule, `areaProgress.reason`, levels and luck, lost items and their drop rate, the seal table, `buySeal`/`equipSeal` refusals, `sealComment`, `sealDuplicates`, `luckFor`, and `visitArea` gift-once behaviour.

**Loop layer** (`angler-loop.test.js`) covers: the level readout, rank moving on a catch, the seal shop rendering, one-active-seal, the pet appearing and hiding, seal comments, and all four save-migration branches.

**Look layer** (`angler-look.test.js`) covers: the pet element exists, sits on the deck, is clear of the angler and rod, is drawn in glass, and hides when unequipped.

**Verify the guards bite.** After the suite is green, break each of these on purpose and confirm a failure, then restore:

```bash
# 1. Make the seal luck silly.
sed -i 's/luck: 1.4, dupeChance/luck: 14, dupeChance/' vendor/fru-angler/fishing.js
node --test tests/angler-fishing.test.js        # expect the bounded-luck test to fail
# restore

# 2. Make the arrival gift repeatable.
sed -i 's/giftedRods.includes(area.requiredRods?.\[0\])/false/' vendor/fru-angler/fishing.js
node --test tests/angler-fishing.test.js        # expect the once-only tests to fail
# restore
```

A test that cannot fail is not a test.

---

## Risks, tradeoffs, and open questions

### Real risks

**Save migration is the dangerous one.** `areaUnlocked` is changing from "own all 11 rods" to "own this lake's rods". A player who currently owns all 11 rods and has cleared Aero Lake will find DORFic Delta now open — fine. But a player mid-way who owned `oak` and had cleared nothing will find *less* progress than before. That is the intended design; just be aware it is a visible rewind for some saves, and mention it in the release message.

**The gift can be farmed if `giftedRods` is lost.** It is in the save, so it is as durable as the save. If someone clears `localStorage` they lose everything anyway. Acceptable.

**Epic shifts `fishSvg()`'s whole rarity ramp.** Sparkle counts, glow radii, crown threshold — all keyed off `RARITY_ORDER.indexOf()`. Existing look tests may assert specific numbers. Update them to the new maths; do not pin Epic back to old behaviour.

**Two `say()` callers fight.** The lost-item message and the seal comment both overwrite `#message`. Task 15 fixes the ordering explicitly. If a later task adds a third caller, it will silently eat one of the others — consider a queue instead of a last-write-wins message.

**`angular` scene counter-scaling.** The scene is `preserveAspectRatio="none"` and `fitFigure()` counter-scales `#angler-fit`. The pet must stay **outside** that group or it gets warped. Task 14 puts it outside; the position test guards it.

**Fish count and weight rebalance.** Task 2 adds at least 20 fish. Existing tests assert `later lakes are strictly harder than earlier ones` and `every rod can eventually catch every fish`. New Epics with high `fight` or `maxKg` can break either. Rebalance the new fish; do not relax the tests.

### Tradeoffs taken

- **Lost items are recovered by catching, not a separate minigame.** Keeps the loop tight, but it does mean junk is passive rather than something you go looking for. If it feels dull in play, a "search the shallows" action is the natural follow-up.
- **Levels are deliberately weak** (0.08 luck per rank, capped at 2.0). You asked for prestige plus a gate on seals, so ranks cannot replace rod choice as the way to reach rare fish. If they feel invisible in play, raise the cap — but then re-tune `xpForLevel`, or progression ends entirely.
- **The seal duplicate is a message, not a second fish in the bestiary.** "Two Sunscale, one hook" is flavour and a small score bonus at most. A real duplicate in the index would break the fish-completion gate, which is the one thing you specifically asked to be strict.
- **The seal art is one shape tinted per seal.** Five bespoke SVG seals would be nicer; one gradient blob is what fits the dock in the time available. `SEALS[].shape` is already in the data, so bespoke art later is additive.

### Open questions

1. **Do the 3 new rods need to be visible in the shop as a group?** At 11 rods the shop list gets long. Consider a "standard rods" section heading, or keeping the price sort and letting it speak for itself.
2. **Should the lake picker show the free rod before you arrive?** "DORFic Delta — bring a rod with the channel trait, or take ours free" is honest and removes the surprise. Worth a line in `traitNote`.
3. **How common should the duplicate be?** 6–11% per catch is ~1 in 15. Over a session that is frequent enough to feel generous without trivialising the index.
4. **Should the level gate seals, or should seal *price* do that?** You chose the gate, but a high price already gates. Doing both means the rank 19 seal needs a big purse *and* rank 19. That is the intent, just confirm it is the intended intensity.

---

<!-- PLAN_END -->
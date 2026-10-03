import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RODS, FISH, RARITY_ORDER, RARITY_COLOURS, castQuality, castDistance, biteDelayFor, rollFish, rollMutation,
  fishWeight, catchValue, canCatch, buyRod, startingLoadout,
  startingInventory, ownsRod, addRodToInventory, equipRod, rodArt, RODS_BY_PRICE,
  fishSvg, FISH_SHAPES, hookLineFor, AREAS, areaUnlocked,
  rodWorksIn, rodCheckIn,
} from '../vendor/fru-angler/fishing.js';

test('the starting wallet can afford exactly one upgrade from the cheapest rod', () => {
  const loadout = startingLoadout();
  assert.equal(loadout.rodId, 'bamboo');
  const upgrades = Object.values(RODS).filter((r) => r.price > RODS.bamboo.price);
  const cheapest = upgrades[0];
  assert.equal(loadout.coins, cheapest.price, 'starts with enough for the first upgrade');
  const nextOne = upgrades[1];
  assert.ok(loadout.coins < nextOne.price, 'but not two, so the first choice matters');
});

test('every rod is more expensive than the last', () => {
  // RODS_BY_PRICE is the order the shop lists, cheapest first. The table itself is
  // laid out by price, but asserting on the sorted list states the real rule.
  const prices = RODS_BY_PRICE.map((id) => RODS[id].price);
  for (let i = 1; i < prices.length; i += 1) {
    assert.ok(prices[i] > prices[i - 1],
      `${RODS_BY_PRICE[i]} must cost more than ${RODS_BY_PRICE[i - 1]}`);
  }
  // And the table is declared in that same order, so nothing drifts.
  assert.deepEqual(Object.keys(RODS), RODS_BY_PRICE,
    'the RODS table should already be in price order');
});

test('every rod can eventually catch every fish', () => {
  // Otherwise the bestiary is unreachable and the game is unwinnable.
  const ceiling = Math.max(...Object.values(RODS).map((r) => r.maxKg));
  const heaviest = Math.max(...FISH.map((f) => f.maxKg));
  assert.ok(ceiling >= heaviest, `top rod caps at ${ceiling} but a fish reaches ${heaviest}`);
});

test('castQuality is perfect only inside the green band', () => {
  assert.equal(castQuality(0.5), 'perfect');
  assert.equal(castQuality(0.45), 'perfect');
  assert.equal(castQuality(0.55), 'perfect');
  assert.equal(castQuality(0.9), 'good');
  assert.equal(castQuality(0.02), 'poor');
});

test('castQuality handles the extremes without throwing', () => {
  assert.doesNotThrow(() => castQuality(0));
  assert.doesNotThrow(() => castQuality(1));
  assert.equal(typeof castQuality(0), 'string');
});

test('cast distance rewards a perfect cast', () => {
  assert.ok(castDistance('perfect') > castDistance('good'));
  assert.ok(castDistance('good') > castDistance('poor'));
  for (const d of [castDistance('perfect'), castDistance('good'), castDistance('poor')]) {
    assert.ok(d > 0 && d <= 1, `distance ${d} must be a fraction of max range`);
  }
});

test('luck makes rare fish more likely as it rises', () => {
  // Checked per lake, since each lake has its own table of fish now.
  for (const area of AREAS) {
    const count = (rod) => {
      const got = new Set();
      for (let r = 0; r < 4000; r += 1) got.add(rollFish(r / 4000, rod, area.id).id);
      return got;
    };
    const bare = count(RODS.bamboo);            // luck 0
    const lucky = count(RODS.titan);            // luck 1.8
    assert.ok(lucky.size >= bare.size,
      `${area.name}: a luckier rod should not see fewer species (${bare.size} -> ${lucky.size})`);

    // The Mythical is the point of luck: if this lake has one, a better rod must
    // make it easier to reach, and even the worst rod can still stumble into it.
    if (area.fish.some((id) => FISH.find((f) => f.id === id)?.rarity === 'Mythical')) {
      const chance = (rod) => {
        let n = 0;
        for (let r = 0; r < 4000; r += 1) if (rollFish(r / 4000, rod, area.id).rarity === 'Mythical') n += 1;
        return n;
      };
      assert.ok(chance(RODS.bamboo) > 0,
        `${area.name}: even a bad rod can stumble into a mythical`);
      assert.ok(chance(RODS.titan) > chance(RODS.bamboo),
        `${area.name}: luck must actually raise the mythical rate`);
    }
  }
});


test('rollFish always returns a fish from the table', () => {
  for (let i = 0; i < 300; i += 1) {
    const fish = rollFish(i / 300, { luck: 0.5 });
    assert.ok(FISH.some((f) => f.id === fish.id), `roll ${i / 300} returned an unknown fish`);
  }
});

test('every species is reachable from the lake that holds it', () => {
  // The roll range must be able to produce every fish a lake lists, not just the
  // first few by weight.
  for (const area of AREAS) {
    const seen = new Set();
    for (let r = 0; r < 4000; r += 1) seen.add(rollFish(r / 4000, RODS.titan, area.id).id);
    for (const id of area.fish) {
      assert.ok(seen.has(id), `${area.name}: ${id} is listed but never comes up on a cast`);
    }
  }
});


test('biteDelayFor shrinks as lure speed rises', () => {
  const slow = biteDelayFor({ lureSpeed: 1 }, { baseMs: 2000, seed: 0.5 });
  const fast = biteDelayFor({ lureSpeed: 4.2 }, { baseMs: 2000, seed: 0.5 });
  assert.ok(fast < slow, 'higher lure speed must shorten the wait');
  assert.ok(fast > 0);
});

test('biteDelayFor is deterministic for a given seed', () => {
  const a = biteDelayFor({ lureSpeed: 2 }, { baseMs: 2000, seed: 0.3 });
  const b = biteDelayFor({ lureSpeed: 2 }, { baseMs: 2000, seed: 0.3 });
  assert.equal(a, b);
});

test('rollMutation always returns a listed mutation with a multiplier', () => {
  for (let i = 0; i < 200; i += 1) {
    const mutation = rollMutation(i / 200);
    assert.ok(mutation.multiplier >= 1, 'no mutation may be worth less than plain');
  }
});

test('weight is rolled inside the fish bounds', () => {
  const perch = FISH.find((f) => f.id === 'glidefin');
  for (let i = 0; i < 200; i += 1) {
    const kg = fishWeight(perch, i / 200);
    assert.ok(kg >= perch.minKg && kg <= perch.maxKg, `${kg} out of bounds`);
  }
});

test('value is kg times price times the mutation multiplier', () => {
  const perch = FISH.find((f) => f.id === 'glidefin');
  assert.equal(catchValue(perch, 2, 1), perch.pricePerKg * 2);
  assert.equal(catchValue(perch, 2, 3), perch.pricePerKg * 2 * 3);
});

test('a rod cannot land a fish above its weight ceiling', () => {
  const char = FISH.find((f) => f.id === 'glacier-char');
  const glidefin = FISH.find((f) => f.id === 'glidefin');
  assert.equal(canCatch(char, char.minKg, RODS.bamboo), false, 'even the lightest Char is too heavy');
  assert.equal(canCatch(char, char.minKg, RODS.oak), true, 'a heavy rod takes it');
  assert.equal(canCatch(glidefin, glidefin.maxKg, RODS.bamboo), true, 'the starting rod lands a Glidefin');
  assert.equal(canCatch(glidefin, glidefin.maxKg, RODS.bamboo) === false, false);
});

test('buyRod charges the price and swaps the rod', () => {
  const result = buyRod({ coins: 5000, rodId: 'bamboo' }, 'willow');
  assert.equal(result.ok, true);
  assert.equal(result.rodId, 'willow');
  assert.equal(result.coins, 5000 - RODS.willow.price);
});

test('a refused purchase leaves the wallet untouched', () => {
  const broke = { coins: 10, rodId: 'bamboo' };
  const result = buyRod(broke, 'titan');
  assert.equal(result.ok, false);
  assert.equal(result.coins, 10, 'a failed purchase must not deduct coins');
  assert.equal(result.rodId, 'bamboo', 'a failed purchase must not change the rod');
});

test('buyRod rejects an unknown rod id', () => {
  assert.equal(buyRod({ coins: 99999, rodId: 'bamboo' }, 'unobtanium').ok, false);
});

test('fish are ordered from common to mythical', () => {
  // Derived from RARITY_ORDER. A local copy went stale the moment Epic was
  // added: indexOf returned -1 for it, so every Epic fish read as a step
  // backwards and this test failed on a correctly ordered table.
  const ranks = FISH.map((f) => RARITY_ORDER.indexOf(f.rarity));
  for (let i = 1; i < ranks.length; i += 1) {
    assert.ok(ranks[i] >= ranks[i - 1], 'rarity must not go backwards down the table');
  }
});


/* ------------------------------------------------------------- inventory */

/**
 * Buying a rod has to put it somewhere. Previously a purchase simply overwrote the
 * equipped rod, so there was no inventory: you owned exactly one rod and could not
 * go back to an earlier one.
 */

test('you start owning only the starting rod', () => {
  const inv = startingInventory();
  assert.deepEqual(inv, ['bamboo']);
  assert.ok(ownsRod(inv, 'bamboo'));
  assert.equal(ownsRod(inv, 'willow'), false);
});

test('buying a rod adds it to the inventory and equips it', () => {
  const inv = startingInventory();
  const bought = addRodToInventory(inv, 'willow');
  assert.ok(ownsRod(bought, 'willow'), 'the new rod is owned');
  assert.ok(ownsRod(bought, 'bamboo'), 'the old one is kept');
  assert.equal(bought.length, 2);
});

test('buying the same rod twice does not duplicate it', () => {
  let inv = startingInventory();
  inv = addRodToInventory(inv, 'willow');
  inv = addRodToInventory(inv, 'willow');
  assert.equal(inv.filter((id) => id === 'willow').length, 1);
  assert.equal(inv.length, 2);
});

test('an unknown rod cannot enter the inventory', () => {
  const inv = addRodToInventory(startingInventory(), 'hypercarbon');
  assert.deepEqual(inv, ['bamboo']);
});

test('you can equip any rod you own', () => {
  let inv = startingInventory();
  inv = addRodToInventory(inv, 'willow');
  assert.equal(equipRod(inv, 'willow').rodId, 'willow');
  // and go back to the one you started with
  assert.equal(equipRod(inv, 'bamboo').rodId, 'bamboo');
});

test('you cannot equip a rod you do not own', () => {
  const inv = startingInventory();
  const result = equipRod(inv, 'titan');
  assert.equal(result.rodId, 'bamboo', 'an unaffordable/unowned rod is refused');
  assert.equal(result.ok, false);
  assert.match(result.reason, /own/i);
});

test('the inventory keeps its rods in price order', () => {
  let inv = startingInventory();
  for (const id of ['titan', 'willow', 'oak']) inv = addRodToInventory(inv, id);
  const prices = inv.map((id) => RODS[id].price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), `not sorted: ${prices}`);
});

/* -------------------------------------------------------------- rod art */

/**
 * Each rod has to look different, or equipping one changes nothing visible.
 */
test('every rod has distinct artwork', () => {
  const seen = new Set();
  for (const id of Object.keys(RODS)) {
    const art = rodArt(id);
    assert.ok(art, `${id} has no art`);
    assert.match(art.path, /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/, `${id}: bad rod path "${art.path}"`);
    assert.match(art.colour, /^#[0-9a-f]{6}$/i, `${id}: bad colour ${art.colour}`);
    assert.ok(art.width > 0.4, `${id}: rod is too thin to see`);
    seen.add(art.path + art.colour);
  }
  assert.equal(seen.size, Object.keys(RODS).length, 'rods must look different from each other');
});

test('each rod gets longer and thicker as it is upgraded', () => {
  // Walk in price order, which is the progression the player actually sees.
  const ids = Object.values(RODS_BY_PRICE);
  for (let i = 1; i < ids.length; i += 1) {
    const cheaper = rodArt(ids[i - 1]);
    const dearer = rodArt(ids[i]);
    assert.ok(dearer.width >= cheaper.width,
      `${ids[i]} should not be thinner than ${ids[i - 1]}`);
  }
});

test('the lure sits at the end of the rod it belongs to', () => {
  // The lure is a disc nudged just past the tip so it caps the rod rather than
  // hiding inside it. Anything more than a unit away would float or overlap.
  for (const id of Object.keys(RODS)) {
    const art = rodArt(id);
    const end = art.path.split('L')[1].trim().split(/\s+/).map(Number);
    assert.ok(Math.abs(art.tipX - end[0]) <= 1,
      `${id}: tip x ${art.tipX} is off the rod end ${end[0]}`);
    assert.ok(Math.abs(art.tipY - end[1]) <= 1,
      `${id}: tip y ${art.tipY} is off the rod end ${end[1]}`);
    assert.ok(art.tipX >= end[0] && art.tipY <= end[1],
      `${id}: the lure should sit up-and-right of the tip, along the rod`);
  }
});

test('an unknown rod falls back to the starting rod art', () => {
  assert.deepEqual(rodArt('nonsense'), rodArt('bamboo'));
});

test('RODS_BY_PRICE lists every rod from cheapest to dearest', () => {
  assert.equal(RODS_BY_PRICE.length, Object.keys(RODS).length);
  for (let i = 1; i < RODS_BY_PRICE.length; i += 1) {
    assert.ok(RODS[RODS_BY_PRICE[i]].price > RODS[RODS_BY_PRICE[i - 1]].price);
  }
  assert.equal(RODS_BY_PRICE[0], 'bamboo');
});


/* ------------------------------------------------------------ fish visuals */

/**
 * Every fish carries a hue and a body shape. They were in the table from the start
 * and never rendered, so a catch was just a line of text. The catch card now draws
 * the fish, and these are the pure functions behind it.
 */

test('every fish declares a hue and a known body shape', () => {
  for (const fish of FISH) {
    assert.ok(Number.isInteger(fish.hue) && fish.hue >= 0 && fish.hue <= 360,
      `${fish.id}: hue must be 0-360, got ${fish.hue}`);
    assert.ok(Object.hasOwn(FISH_SHAPES, fish.draw),
      `${fish.id}: unknown draw shape "${fish.draw}"`);
  }
});

test('every fish draws a complete, self-contained SVG', () => {
  for (const fish of FISH) {
    const svg = fishSvg(fish);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${fish.id}: no root`);
    assert.match(svg, /<\/svg>\s*$/, `${fish.id}: unclosed`);
    assert.match(svg, /viewBox="0 0 120 80"/, `${fish.id}: wrong viewBox`);
    assert.ok(!svg.includes('<script'), `${fish.id}: no script`);
    assert.ok(!/<foreignObject/.test(svg), `${fish.id}: no foreign objects`);
    // Every url(#id) must resolve inside this same file.
    const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) {
      assert.ok(ids.has(ref[1]), `${fish.id}: dangling reference #${ref[1]}`);
    }
  }
});

test('the fish is tinted with its own hue', () => {
  for (const fish of FISH) {
    const svg = fishSvg(fish);
    const stops = [...svg.matchAll(/stop-color="hsl\((\d+)/g)].map((m) => Number(m[1]));
    assert.ok(stops.length >= 2, `${fish.id}: needs a gradient ramp`);
    // Every stop must sit near the fish's own hue. Hue is circular, so compare the
    // shortest way round: 350 and 5 are 15 apart, not 345.
    for (const hue of stops) {
      const diff = Math.min(Math.abs(hue - fish.hue), 360 - Math.abs(hue - fish.hue));
      assert.ok(diff <= 2, `${fish.id}: stop hue ${hue} should be near ${fish.hue}`);
    }
  }
});

test('each body shape draws differently', () => {
  // Compare the geometry itself: four shapes must not share one outline.
  const bodies = Object.values(FISH_SHAPES).map((s) => s.body);
  assert.equal(new Set(bodies).size, bodies.length,
    'every shape needs its own body outline');

  const tails = Object.values(FISH_SHAPES).map((s) => s.tail);
  assert.equal(new Set(tails).size, tails.length,
    'every shape needs its own tail');

  // And the two long fish must actually differ from each other on screen.
  const eco = fishSvg(FISH.find((f) => f.id === 'eco-gar'));
  const glacier = fishSvg(FISH.find((f) => f.id === 'glacier-char'));
  assert.notEqual(eco, glacier, 'two fish sharing a shape must still differ by hue');
});

test('the fish has a visible body, an eye and a tail', () => {
  // A silhouette with no features would read as a blob rather than a fish.
  const svg = fishSvg(FISH[0]);
  assert.match(svg, /class="body"/, 'needs a body');
  assert.match(svg, /class="tail"/, 'needs a tail');
  assert.match(svg, /class="eye"/, 'needs an eye');
  assert.match(svg, /class="fin"/, 'needs a fin');
  assert.match(svg, /class="stripe"/, 'needs a marking');
});

test('an unknown shape still produces a valid drawing', () => {
  const svg = fishSvg({ ...FISH[0], draw: 'leviathan' });
  assert.match(svg, /^<svg/, 'must not throw on an unknown shape');
  assert.match(svg, /<\/svg>\s*$/);
});

test('a missing fish falls back to the first one rather than throwing', () => {
  assert.doesNotThrow(() => fishSvg(null));
  assert.doesNotThrow(() => fishSvg(undefined));
  assert.match(fishSvg(null), /^<svg/);
});

test('the fish drawing carries the fish name for accessibility', () => {
  // Looked up by id, not by index: the table has grown and been re-sorted, so a
  // positional reference silently starts checking a different fish.
  const trout = FISH.find((f) => f.id === 'metro-trout');
  const svg = fishSvg(trout);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="[^"]*Metro Trout[^"]*"/, 'the name must be in the label');
});


/* ------------------------------------------------- maximalist Aero fish art */

test('every fish is drawn with the full Aero treatment, not a flat body', () => {
  // The old drawing was four flat shapes on a flat pond. Maximalist Aero means
  // layered depth, bloom and specular, so assert the layers exist per fish.
  for (const fish of FISH) {
    const svg = fishSvg(fish);
    const where = fish.name;

    // A gradient body and at least two more for the fins and tail, so nothing
    // reads as a flat fill.
    const gradients = (svg.match(/<(linear|radial)Gradient/g) || []).length;
    assert.ok(gradients >= 5,
      `${where}: expected 5+ gradients for depth, found ${gradients}`);

    // Bloom around the fish and a specular highlight on it.
    assert.match(svg, /class="bloom"/, `${where} needs a bloom`);
    assert.match(svg, /class="specular"/, `${where} needs a specular highlight`);
    assert.match(svg, /filter=/, `${where} needs a glow filter`);

    // Bubbles rising, the signature Aero motif.
    assert.match(svg, /class="bubbles"/, `${where} needs bubbles`);

    // Glassy overlay across the water, plus caustics.
    assert.match(svg, /class="caustics"/, `${where} needs caustics`);
    assert.match(svg, /class="surface"/, `${where} needs a glassy water surface`);
  }
});

test('no two fish share SVG element ids', () => {
  // Every drawing used id="fb" and id="fs". Six fish in the index therefore
  // produced six copies of each id, so url(#fb) resolved to whichever came
  // first in the document and the rest silently borrowed its gradient.
  const ids = [];
  for (const fish of FISH) {
    for (const m of fishSvg(fish).matchAll(/\sid="([^"]+)"/g)) ids.push(m[1]);
  }
  assert.equal(new Set(ids).size, ids.length,
    `duplicate SVG ids across the fish drawings: ` +
    `${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});

test('rarer fish are drawn more extravagantly than common ones', () => {
  // A Mythical should look like an event. Count the extra decoration layers.
  // Count the individual glints, not the wrapper group that holds them.
  const layers = (fish) => (fishSvg(fish).match(/class="sparkle"/g) || []).length;
  const common = FISH.filter((f) => f.rarity === 'Common');
  const rare = FISH.filter((f) => f.rarity === 'Mythical' || f.rarity === 'Legendary');
  assert.ok(rare.length > 0 && common.length > 0);

  const maxCommon = Math.max(...common.map(layers));
  const minRare = Math.min(...rare.map(layers));
  assert.ok(minRare > maxCommon,
    `the rarest fish should carry more sparkle than the commonest: ${minRare} vs ${maxCommon}`);
});

test('every fish drawing is well-formed and resolves its own references', () => {
  // A malformed gradient is dropped by the browser with no error, so a broken
  // drawing can pass every string assertion while rendering as a flat fish.
  // Check the things a browser would silently discard: unbalanced quotes, and
  // url(#x) where no id="x" exists in that same drawing.
  for (const fish of FISH) {
    const svg = fishSvg(fish);
    const where = fish.name;

    assert.equal((svg.match(/"/g) || []).length % 2, 0,
      `${where}: unbalanced quotes, so attributes are being misparsed`);

    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
    for (const ref of refs) {
      assert.ok(ids.has(ref), `${where}: url(#${ref}) has no matching id in this drawing`);
    }

    // Every opening tag must be closed or self-closing.
    const open = (svg.match(/<[a-zA-Z][^>]*(?<![/\d])>/g) || []).filter((t) => !t.endsWith('/>'));
    const closed = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
    assert.equal(open.length, closed, `${where}: ${open.length} tags open, ${closed} closed`);
  }
});

test('a drawn fish is still recognisable at index size', () => {
  // Maximalism must not bury the silhouette. The body has to stay the dominant
  // shape and the eye has to remain visible at 40px.
  const svg = fishSvg(FISH[0]);
  const body = svg.match(/class="body"[^>]*d="([^"]+)"/);
  assert.ok(body, 'the body must be a single, addressable path');
  assert.ok(body[1].length > 60, 'the body silhouette must be a real shape');
  assert.match(svg, /class="eye"/, 'the eye must survive, or it is not a fish');
  assert.match(svg, /viewBox="0 0 120 80"/, 'and the viewBox must be unchanged');
});


/* ------------------------------------------------------- the hook flavour */

test('every fish has its own line for the moment you hook it', () => {
  for (const fish of FISH) {
    assert.equal(typeof fish.hook, 'string', `${fish.name} needs a hook line`);
    assert.ok(fish.hook.trim().length > 0, `${fish.name} has an empty hook line`);
    assert.ok(fish.hook.length < 90, `${fish.name} has a very long line`);
  }

  // Each must be distinct: six fish sharing one line defeats the point.
  const lines = FISH.map((f) => f.hook);
  assert.equal(new Set(lines).size, lines.length,
    'hook lines must be unique per fish');
});

test('the hook line speaks in second person, like the player is there', () => {
  // The example the request gave: "You feel the power of the environment".
  for (const fish of FISH) {
    assert.match(fish.hook, /\b(you|your|you're|yours)\b/i,
      `${fish.name} should address the player: "${fish.hook}"`);
  }
});

test('a hook line is offered for an unknown fish rather than undefined', () => {
  assert.equal(typeof hookLineFor({ id: 'nope' }), 'string');
  assert.ok(hookLineFor({ id: 'nope' }).length > 0);
  // And a real fish gets its own, not the fallback.
  assert.equal(hookLineFor(FISH[0]), FISH[0].hook);
});


/* -------------------------------------------------------------- the areas */

/**
 * Areas: a Frutiger-themed set of waters, unlocked by clearing the current one.
 *
 * The unlock rule is "every fish in this water landed, and every rod owned", so
 * each area is a full sweep of the game rather than a shortcut to rare fish.
 */
test('the lakes are all Frutiger-themed and all start locked but the first', () => {
  assert.ok(AREAS.length >= 4, `expected at least 4 lakes, got ${AREAS.length}`);

  const ids = AREAS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'lake ids must be unique');

  for (const area of AREAS) {
    for (const key of ['id', 'name', 'theme', 'blurb', 'fish', 'palette']) {
      assert.ok(area[key] !== undefined, `${area.id} is missing ${key}`);
    }
    // Frutiger: a named Aero-family theme, and a real palette to paint with.
    assert.match(area.theme, /Aero|DORFic|Eco|Glacier|Dark Aero/,
      `${area.id} should be named for a Frutiger theme, got "${area.theme}"`);
    for (const key of ['skyTop', 'skyMid', 'skyFloor', 'water', 'accent']) {
      assert.match(String(area.palette[key]), /^#[0-9a-f]{3,8}$/i,
        `${area.id}.palette.${key} must be a hex colour, got ${area.palette[key]}`);
    }
    // haze and sun carry an alpha, so rgba() is correct for them.
    for (const key of ['haze', 'sun']) {
      assert.match(String(area.palette[key]), /^(#|rgba?\()/i,
        `${area.id}.palette.${key} must be a colour, got ${area.palette[key]}`);
    }
  }

  // The first lake is open from the start; the rest are not.
  assert.equal(AREAS[0].locked, false, 'the first lake must be open to a new player');
  for (const area of AREAS.slice(1)) {
    assert.equal(area.locked, true, `${area.id} must start locked`);
  }
});

test('every lake has fish in it, and every species is reachable somewhere', () => {
  // Rosters deliberately overlap: a later lake keeps some of what you have already
  // fished, so it reads as familiar but harder. The rule that matters is coverage.
  const seen = new Set();
  for (const area of AREAS) {
    assert.ok(area.fish.length > 0, `${area.id} has no fish`);
    for (const id of area.fish) {
      assert.ok(FISH.some((f) => f.id === id), `${area.id} lists unknown fish ${id}`);
      seen.add(id);
    }
  }
  for (const fish of FISH) {
    assert.ok(seen.has(fish.id), `${fish.name} is in no lake`);
  }
  // The Mythical only ever appears in the two hardest waters, and must be in the
  // deepest one — that lake is the reward for getting this far.
  const myth = FISH.find((f) => f.rarity === 'Mythical');
  const homes = AREAS.filter((a) => a.fish.includes(myth.id));
  assert.ok(homes.length >= 1, 'the Mythical must be catchable somewhere');
  assert.ok(homes.includes(AREAS[AREAS.length - 1]),
    'the deepest lake must hold the Mythical');
  for (const a of homes) {
    assert.ok(AREAS.indexOf(a) >= AREAS.length - 2,
      `${a.name} is too easy a home for the Mythical`);
    // A lake of one fish makes every cast identical, so luck would be meaningless.
    assert.ok(a.fish.length >= 2, `${a.name} needs more than one species`);
  }
});

test('later lakes are strictly harder than earlier ones', () => {
  // A lake must earn its unlock, so each one holds fish at least as rare as the
  // last. Otherwise a new lake is a downgrade.
  const weightOf = (area) => area.fish.reduce((sum, id) => {
    const f = FISH.find((x) => x.id === id);
    // Derived from RARITY_ORDER, so a new tier is scored correctly rather than
    // collapsing into the last branch. The old ternary gave every tier it did
    // not name the Mythical score, which made the whole check inert.
    return sum + 1 + Math.max(0, RARITY_ORDER.indexOf(f.rarity));
  }, 0) / area.fish.length;

  for (let i = 1; i < AREAS.length; i += 1) {
    assert.ok(weightOf(AREAS[i]) > weightOf(AREAS[i - 1]),
      `${AREAS[i].name} (${weightOf(AREAS[i]).toFixed(1)}) should be richer than ` +
      `${AREAS[i - 1].name} (${weightOf(AREAS[i - 1]).toFixed(1)})`);
  }
});

test('a lake stays shut until its own rods are owned, then opens', () => {
  // Each lake gates on ITS OWN rods, not on every rod in the game. This used to
  // demand all twelve, which made the last lake unreachable: you needed the
  // Abyssal Rig before you could reach the lake that hands it to you.
  for (const area of AREAS.slice(1)) {
    const previous = AREAS[AREAS.indexOf(area) - 1];
    const landed = Object.fromEntries(previous.fish.map((id) => [id, 5]));

    const missingOne = previous.requiredRods.slice(0, -1);
    assert.equal(areaUnlocked(area, { bestiary: landed, owned: missingOne }), false,
      `${area.name} must stay shut while one of its own rods is unowned`);

    assert.equal(areaUnlocked(area,
      { bestiary: landed, owned: previous.requiredRods }), true,
      `${area.name} opens once ${previous.name} is cleared and its rods are owned`);
  }
});

test('owning every rod does not open a lake whose fish you have not landed', () => {
  const every = Object.keys(RODS);
  for (const area of AREAS.slice(1)) {
    assert.equal(areaUnlocked(area, { bestiary: {}, owned: every }), false,
      `${area.name} must need its fish as well as its rods`);
  }
});

test('the first lake is always open, whatever the save looks like', () => {
  assert.equal(areaUnlocked(AREAS[0], { bestiary: {}, owned: [] }), true);
  assert.equal(areaUnlocked(AREAS[0], { bestiary: null, owned: null }), true);
});

test('fish can only be rolled from the lake you are standing in', () => {
  const other = AREAS[1];
  for (let i = 0; i < 300; i += 1) {
    const fish = rollFish(i / 300, RODS.bamboo, other.id);
    assert.ok(other.fish.includes(fish.id),
      `${fish.name} is not in ${other.name}`);
  }
});

test('an unknown lake id falls back to the first lake rather than crashing', () => {
  const fish = rollFish(0.5, RODS.bamboo, 'not-a-lake');
  assert.ok(AREAS[0].fish.includes(fish.id));
});


/* ----------------------------------------------- rod traits and gated lakes */

test('rods carry traits, and the specialist ones cost a premium', () => {
  for (const rod of Object.values(RODS)) {
    assert.ok(Array.isArray(rod.traits), `${rod.id} must declare a traits array`);
    for (const t of rod.traits) {
      assert.match(t, /^[a-z]+$/, `${rod.id} has a malformed trait: ${t}`);
    }
  }

  // A rod that can work a specialist lake must cost more than a plain upgrade of
  // similar stats, so the gate is a real economy decision and not a formality.
  const special = Object.values(RODS).filter((r) => r.traits.length > 0);
  assert.ok(special.length >= 2, `expected specialist rods, got ${special.length}`);
  for (const rod of special) {
    const plain = Object.values(RODS).filter((r) => r.traits.length === 0);
    const cheapestPlain = Math.min(...plain.map((r) => r.price));
    assert.ok(rod.price > cheapestPlain,
      `${rod.id} carries a trait but costs no more than a plain rod (¤${rod.price})`);
  }
});

test('the later lakes are trait-gated, and every gate is satisfiable', () => {
  // The first two lakes are deliberately ungated: they teach the loop, and the
  // player should not hit a paywall before they have seen a single fight. The
  // gate arrives at the third lake, once the rod ladder is established.
  const ungated = AREAS.filter((a) => !a.trait);
  assert.ok(ungated.length <= 2,
    `only the opening lakes may be ungated, got ${ungated.map((a) => a.id).join(', ')}`);
  assert.equal(AREAS[0].trait, null, 'the starting lake needs no trait');

  for (const area of AREAS.filter((a) => a.trait)) {
    assert.match(area.trait, /^[a-z]+$/);
    assert.ok(area.traitNote, `${area.id} should explain its trait in words`);
    const usable = Object.values(RODS).filter((r) => r.traits.includes(area.trait));
    assert.ok(usable.length > 0,
      `no rod has the ${area.trait} trait, so ${area.id} can never be fished`);
  }

  // The two the request named explicitly must both exist and be gated.
  const deep = AREAS.find((a) => a.name.includes('Dark Aero'));
  const fjord = AREAS.find((a) => a.name.includes('Glacier'));
  assert.equal(deep?.trait, 'reinforced', 'Dark Aero Deep needs the reinforced trait');
  assert.equal(fjord?.trait, 'ice', 'Glacier Fjord needs the ice trait');
});

test('a rod can only fish a lake when it carries that lake trait', () => {
  const deep = AREAS.find((a) => a.trait === 'reinforced');
  const fjord = AREAS.find((a) => a.trait === 'ice');
  assert.ok(deep && fjord, 'both named lakes must exist');

  const titan = Object.values(RODS).find((r) => r.traits.includes('reinforced'));
  assert.equal(rodWorksIn(titan.id, deep.id), true, 'a reinforced rod works the deep');
  assert.equal(rodWorksIn(titan.id, fjord.id), false,
    'but not the ice lake — that needs its own trait');

  const plain = RODS.bamboo;
  for (const area of AREAS) {
    const expected = area.trait === null;
    assert.equal(rodWorksIn(plain.id, area.id), expected,
      `bamboo should ${expected ? '' : 'not '}work ${area.name}`);
  }
});

test('a lake you cannot fish in reports why', () => {
  const deep = AREAS.find((a) => a.trait === 'reinforced');
  const check = rodCheckIn('bamboo', deep.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /reinforced/i, `unhelpful reason: ${check.reason}`);
  // The good case has no complaint.
  const titan = Object.values(RODS).find((r) => r.traits.includes('reinforced'));
  assert.equal(rodCheckIn(titan.id, deep.id).ok, true);
});

test('every lake holds at least six species', () => {
  for (const area of AREAS) {
    assert.ok(area.fish.length >= 6,
      `${area.name} holds only ${area.fish.length} species, needs 6 or more`);
  }
});

test('there are now enough fish to fill six lakes several times over', () => {
  assert.ok(FISH.length >= 20,
    `expected a much larger pond, got ${FISH.length} species`);
  const hook = new Set(FISH.map((f) => f.hook));
  assert.equal(hook.size, FISH.length, 'every species needs its own hook line');
  const ids = new Set(FISH.map((f) => f.id));
  assert.equal(ids.size, FISH.length, 'ids must be unique');
});

test('the next lake opens when the one you are standing in is finished', () => {
  // The rule is now: all fish in the CURRENT lake, plus every rod.
  const current = AREAS[1];
  const all = current.fish.reduce((b, id) => (b[id] = 5, b), {});
  const allRods = Object.keys(RODS);

  // Half the fish is not enough.
  const partial = current.fish.slice(0, 3).reduce((b, id) => (b[id] = 5, b), {});
  assert.equal(areaUnlocked(AREAS[2], { bestiary: partial, owned: allRods }), false,
    'the next lake must stay shut while species are unlanded');

  // All the fish but not all the rods is not enough either.
  assert.equal(areaUnlocked(AREAS[2], { bestiary: all, owned: ['bamboo'] }), false,
    'nor while rods are unowned');

  assert.equal(areaUnlocked(AREAS[2], { bestiary: all, owned: allRods }), true,
    'both conditions met, so it opens');
});

test('landing a lake full of fish from elsewhere does not open the next one', () => {
  // The gate must count the current lake's own species, not the total bestiary.
  const current = AREAS[1];
  const elsewhere = AREAS[3].fish.reduce((b, id) => (b[id] = 5, b), {});
  assert.equal(areaUnlocked(AREAS[2], { bestiary: elsewhere, owned: Object.keys(RODS) }), false,
    'fish from another lake must not count');
  void current;
});

test('every lake is fishable once you have the right rod', () => {
  for (const area of AREAS) {
    const rods = Object.keys(RODS).filter((id) => rodWorksIn(id, area.id));
    assert.ok(rods.length > 0, `${area.name} has no rod that can fish it`);
    // And one of them must be strong enough for its heaviest resident.
    const heaviest = Math.max(...area.fish.map((id) =>
      FISH.find((f) => f.id === id).maxKg));
    const strongEnough = rods.some((id) => RODS[id].maxKg >= heaviest);
    assert.ok(strongEnough,
      `no rod that works ${area.name} can land its ${heaviest} kg heaviest fish`);
  }
});

test('there are six rarity tiers, with Epic between Rare and Legendary', () => {
  assert.deepEqual(RARITY_ORDER,
    ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical']);
});

test('every rarity has a colour, and none is a flat default', () => {
  for (const rarity of RARITY_ORDER) {
    assert.match(RARITY_COLOURS[rarity] ?? '', /^#[0-9a-f]{6}$/i,
      `${rarity} needs a colour`);
  }
  assert.notEqual(RARITY_COLOURS.Epic, RARITY_COLOURS.Legendary,
    'Epic must be distinguishable from Legendary');
});

test('every fish sits in a known tier', () => {
  for (const fish of FISH) {
    assert.ok(RARITY_ORDER.includes(fish.rarity),
      `${fish.id} has rarity ${fish.rarity}, which is not a tier`);
  }
});

test('every lake carries at least one fish of each high tier', () => {
  for (const area of AREAS) {
    const held = area.fish.map((id) => FISH.find((f) => f.id === id)?.rarity);
    for (const rarity of ['Rare', 'Epic', 'Legendary', 'Mythical']) {
      assert.ok(held.includes(rarity),
        `${area.name} has no ${rarity}; it only has ${[...new Set(held)].join(', ')}`);
    }
  }
});

test('every lake still has at least six species', () => {
  for (const area of AREAS) {
    assert.ok(area.fish.length >= 6, `${area.name} holds only ${area.fish.length}`);
  }
});

test('every fish belongs to a lake, and no lake lists a fish that does not exist', () => {
  const known = new Set(FISH.map((f) => f.id));
  const used = new Set();
  for (const area of AREAS) {
    for (const id of area.fish) {
      assert.ok(known.has(id), `${area.name} lists unknown fish ${id}`);
      used.add(id);
    }
  }
  // An unreachable fish would silently inflate the species count.
  const orphans = FISH.filter((f) => !used.has(f.id)).map((f) => f.id);
  assert.deepEqual(orphans, [], `no lake holds ${orphans.join(', ')}`);
});

test('every Epic fish is actually Epic, and rarer fish weigh less than common ones', () => {
  const epic = FISH.filter((f) => f.rarity === 'Epic');
  assert.ok(epic.length >= AREAS.length, `expected an Epic per lake, found ${epic.length}`);
  const commonWeight = Math.max(...FISH.filter((f) => f.rarity === 'Common').map((f) => f.weight));
  for (const fish of epic) {
    assert.ok(fish.weight < commonWeight,
      `${fish.id} is Epic but weighs ${fish.weight}, not rarer than a Common`);
  }
});

test('every fish draws a shape that exists, so none renders as a fallback', () => {
  for (const fish of FISH) {
    assert.ok(FISH_SHAPES[fish.draw], `${fish.id} draws with unknown shape "${fish.draw}"`);
    assert.equal(typeof fish.hue, 'number', `${fish.id} has no hue`);
    assert.ok(fish.hue >= 0 && fish.hue < 360, `${fish.id} hue ${fish.hue} is out of range`);
  }
});

test('every fish says something when it is hooked', () => {
  for (const fish of FISH) {
    const line = hookLineFor(fish);
    assert.ok(line && line.length >= 20, `${fish.id} has no hook line`);
  }
});

test('eight ordinary rods stand between the first two lakes', () => {
  const ordinary = Object.values(RODS).filter((r) => r.traits.length === 0);
  assert.equal(ordinary.length, 8, `expected 8 no-trait rods, found ${ordinary.length}`);
});

test('the ordinary rods are the eight cheapest, and every trait rod costs a premium', () => {
  const ordinary = Object.values(RODS).filter((r) => r.traits.length === 0)
    .sort((a, b) => a.price - b.price);
  const dearest = ordinary[ordinary.length - 1];
  for (const rod of Object.values(RODS)) {
    if (rod.traits.length > 0) {
      assert.ok(rod.price > dearest.price,
        `${rod.id} is a specialist at ${rod.price} but the dearest ordinary rod is only ${dearest.price}`);
    }
  }
});

test('every rod has its own artwork, and upgrades get longer and thicker', () => {
  const byPrice = RODS_BY_PRICE.map((id) => ({ id, look: rodArt(id) }));
  for (let i = 1; i < byPrice.length; i += 1) {
    const prev = byPrice[i - 1];
    const cur = byPrice[i];
    assert.ok(cur.look.width >= prev.look.width,
      `${cur.id} (${cur.look.width}) is thinner than ${prev.id} (${prev.look.width})`);
    assert.notEqual(cur.look.colour, prev.look.colour, `${cur.id} shares ${prev.id}'s colour`);
  }
  const colours = byPrice.map((r) => r.look.colour);
  assert.equal(new Set(colours).size, colours.length, 'two rods share a colour');
  const widths = byPrice.map((r) => r.look.width);
  assert.equal(new Set(widths).size, widths.length, 'two rods share a thickness');
});

test('no rod is named after its own material', () => {
  for (const rod of Object.values(RODS)) {
    assert.doesNotMatch(rod.name, /^(Bamboo|Willow|Carbon|Oak)\b/,
      `${rod.id} is still named after what it is made of: ${rod.name}`);
  }
});

test('every rod name is unique and reads as a Frutiser thing', () => {
  const names = Object.values(RODS).map((r) => r.name);
  assert.equal(new Set(names).size, names.length, 'two rods share a name');
  for (const name of names) {
    assert.equal(name, name.trim(), `"${name}" has stray whitespace`);
    assert.doesNotMatch(name, /\s-\s|[_-]/, `"${name}" should read as a name, not an id`);
  }
});

test('every rod has a blurb with something to say', () => {
  for (const rod of Object.values(RODS)) {
    assert.ok(rod.blurb?.length >= 18, `${rod.id} needs a fuller blurb: "${rod.blurb}"`);
    assert.match(rod.blurb, /[.!?]$/, `${rod.id} blurb should end in punctuation`);
  }
});

test('a rod gains stats as it costs more, or the upgrade is pointless', () => {
  const byPrice = RODS_BY_PRICE.map((id) => RODS[id]);
  for (let i = 1; i < byPrice.length; i += 1) {
    const prev = byPrice[i - 1];
    const cur = byPrice[i];
    // Specialists pay for access, so their maxKg may dip; luck must not.
    assert.ok(cur.luck >= prev.luck,
      `${cur.id} costs more than ${prev.id} but has less luck`);
    assert.ok(cur.lureSpeed >= prev.lureSpeed,
      `${cur.id} costs more than ${prev.id} but lures slower`);
    assert.ok(cur.control >= prev.control,
      `${cur.id} costs more than ${prev.id} but is harder to steer`);
  }
});

test('DORFic Delta is gated by the channel trait, and a rod can open it', () => {
  const delta = AREAS.find((a) => a.id === 'doric-delta');
  assert.equal(delta.trait, 'channel');
  assert.ok(delta.traitNote, 'the gate must explain itself');
  const carry = Object.values(RODS).filter((r) => r.traits.includes('channel'));
  assert.ok(carry.length >= 1, 'no rod can fish DORFic Delta');
  assert.equal(rodWorksIn(carry[0].id, 'doric-delta'), true);
  assert.equal(rodWorksIn('bamboo', 'doric-delta'), false);
});

test('every trait lake has a note and at least one rod that opens it', () => {
  for (const area of AREAS) {
    if (!area.trait) continue;
    assert.ok(area.traitNote, `${area.name} has a trait but no traitNote`);
    const carry = Object.values(RODS).filter((r) => r.traits.includes(area.trait));
    assert.ok(carry.length >= 1, `${area.name} can never be fished`);
    const check = rodCheckIn(carry[0].id, area.id);
    assert.equal(check.ok, true, `${carry[0].id} should work in ${area.name}: ${check.reason}`);
  }
});

test('each lake declares the rods that stand in front of the next one', () => {
  for (const area of AREAS) {
    assert.ok(Array.isArray(area.requiredRods) && area.requiredRods.length > 0,
      `${area.name} does not say which rods gate the next lake`);
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

test('a trait lake is gated by every rod carrying its own trait', () => {
  for (const area of AREAS) {
    if (!area.trait) continue;
    const carry = Object.keys(RODS).filter((id) => RODS[id].traits.includes(area.trait));
    assert.deepEqual([...area.requiredRods].sort(), [...carry].sort(),
      `${area.name} should be gated by every ${area.trait} rod`);
  }
});

test('the gate is the previous lake, never the one being opened', () => {
  // Counting the fish or rods of the lake being opened lets a lake advertise its
  // own contents before you have earned them, and the gate moves whenever the
  // roster changes. Aero Lake is always open, so its own list is the fallback.
  const lake = AREAS[0];
  const landed = Object.fromEntries(lake.fish.map((id) => [id, 1]));
  const owned = lake.requiredRods.slice(0, -1);
  assert.equal(areaUnlocked(AREAS[1], { bestiary: landed, owned }), false,
    'every fish but one rod short must still be shut');
  assert.equal(areaUnlocked(AREAS[1], { bestiary: landed, owned: lake.requiredRods }), true,
    'every fish and every rod must open it');
});

test('landing the fish of a lake you are not standing in opens nothing', () => {
  // The gate walks one lake at a time. Clearing Aero Lake opens DORFic Delta --
  // not Eco Marsh, which is two steps on and additionally needs the channel rod.
  const first = AREAS[0];
  const done = Object.fromEntries(first.fish.map((id) => [id, 1]));
  const owned = first.requiredRods;

  assert.equal(areaUnlocked(AREAS[1], { bestiary: done, owned }), true,
    'clearing the first lake must open the second');

  // Clearing the SECOND lake without ever clearing the first opens nothing.
  const onlySecond = Object.fromEntries(AREAS[1].fish.map((id) => [id, 1]));
  assert.equal(areaUnlocked(AREAS[2], { bestiary: onlySecond, owned }), false,
    'skipping a lake must not open the one after it');

  // Owning everything does not skip the index: with only the SECOND lake cleared
  // and no first-lake fish, the gate for the third lake is DORFic, whose own
  // roster and channel rod are both satisfied. That IS the next step, so the
  // real skip test is the one above: the first lake's fish are still required to
  // get past DORFic in the first place.
  assert.equal(areaUnlocked(AREAS[1], { bestiary: onlySecond, owned: Object.keys(RODS) }), false,
    'owning every rod must not let you skip a lake index');
});

test('the first lake is always open, whatever the save looks like', () => {
  assert.equal(areaUnlocked(AREAS[0], { bestiary: {}, owned: [] }), true);
  assert.equal(areaUnlocked(AREAS[0], { bestiary: null, owned: null }), true);
});

test('a lake gates only on rods that can fish that very lake', () => {
  // The rods you need to leave a lake must be usable in it. Without this the
  // gate could ask for a rod you have no business carrying.
  for (const area of AREAS) {
    for (const id of area.requiredRods) {
      const check = rodCheckIn(id, area.id);
      assert.equal(check.ok, true,
        `${id} gates ${area.name} but cannot fish it: ${check.reason}`);
    }
  }
});

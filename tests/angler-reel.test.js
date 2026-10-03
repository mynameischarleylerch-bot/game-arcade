import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reelConfig, stepReel, isContained, containedFraction,
  reelOutcomeFor, reelOutcome, isCaught, lineSnapped,
} from '../vendor/fru-angler/reel.js';
import { RODS, FISH, RARITY_ORDER } from '../vendor/fru-angler/fishing.js';

const CFG = reelConfig({ fight: 0.6, control: 0.24, resilience: 0.7 });

test('a common fish is easier than a mythical one', () => {
  const easy = reelConfig({ fight: 0.35, control: 0.24, resilience: 0.7 });
  const hard = reelConfig({ fight: 1.0, control: 0.24, resilience: 0.7 });
  assert.ok(easy.fishSpeed < hard.fishSpeed, 'harder fish move faster');
  assert.ok(easy.jitter < hard.jitter, 'harder fish wander more');
});

test('more control means a wider player bar', () => {
  const weak = reelConfig({ fight: 0.6, control: 0.2, resilience: 0.7 });
  const strong = reelConfig({ fight: 0.6, control: 0.36, resilience: 0.7 });
  assert.ok(strong.playerWidth > weak.playerWidth);
});

test('more resilience calms the fish', () => {
  const brittle = reelConfig({ fight: 0.6, control: 0.24, resilience: 0.3 });
  const tough = reelConfig({ fight: 0.6, control: 0.24, resilience: 0.9 });
  assert.ok(tough.fishSpeed < brittle.fishSpeed);
  assert.ok(tough.jitter < brittle.jitter);
});

test('the fish stays inside the bar for any seed', () => {
  const cfg = reelConfig({ fight: 1.0, control: 0.24, resilience: 0.1 });
  for (let i = 0; i < 2000; i += 1) {
    const state = stepReel(cfg, { fishX: 0.5, playerX: 0.5, progress: 0, holding: true }, 1 / 60, i / 2000);
    assert.ok(state.fishX >= 0 && state.fishX <= 1, `fishX ${state.fishX} left the bar at frame ${i}`);
  }
});

test('the player bar stays inside the bar however long it runs', () => {
  const cfg = reelConfig({ fight: 0.5, control: 0.24, resilience: 0.5 });
  let playerX = 0.5;
  for (let i = 0; i < 2000; i += 1) {
    playerX = stepReel(cfg, { fishX: 0.5, playerX, progress: 0.5, holding: false }, 1 / 60, i / 2000).playerX;
    assert.ok(playerX >= 0 && playerX <= 1, `playerX ${playerX} left the bar at frame ${i}`);
  }
});

test('holding pushes the player right and releasing drifts them left', () => {
  const cfg = reelConfig({ fight: 0.2, control: 0.3, resilience: 0.5 });
  const held = stepReel(cfg, { fishX: 0.5, playerX: 0.5, progress: 0, holding: true }, 1 / 60, 0.5);
  const idle = stepReel(cfg, { fishX: 0.5, playerX: 0.5, progress: 0, holding: false }, 1 / 60, 0.5);
  assert.ok(held.playerX > 0.5, 'holding should push right');
  assert.ok(idle.playerX < 0.5, 'not holding should drift left');
});

test('containing the fish fills progress and losing it drains progress', () => {
  const cfg = reelConfig({ fight: 0.2, control: 0.4, resilience: 0.9 });
  const inside = stepReel(cfg, { fishX: 0.5, playerX: 0.5, progress: 0.5, holding: true }, 1 / 60, 0.5);
  const outside = stepReel(cfg, { fishX: 0.05, playerX: 0.9, progress: 0.5, holding: false }, 1 / 60, 0.5);
  assert.ok(inside.progress > 0.5);
  assert.ok(outside.progress < 0.5);
});

test('progress is clamped to 0..1 and reaches exactly 1 when full', () => {
  const cfg = reelConfig({ fight: 0.2, control: 0.4, resilience: 0.9 });
  // A perfect player tracks the fish exactly, so containment is never lost.
  let state = { fishX: 0.5, playerX: 0.5, progress: 0.99, holding: true };
  for (let i = 0; i < 500; i += 1) {
    const next = stepReel(cfg, state, 1 / 60, 0.5);
    state = { ...next, playerX: next.fishX };
    assert.ok(state.progress <= 1 && state.progress >= 0, `progress ${state.progress} out of range`);
  }
  assert.equal(state.progress, 1, 'a contained fish must reach exactly 1');

  // And an abandoned one must land on exactly 0, never below.
  let doomed = { fishX: 0.02, playerX: 0.95, progress: 0.05, holding: false };
  for (let i = 0; i < 500; i += 1) {
    doomed = stepReel(cfg, doomed, 1 / 60, 0.5);
    assert.ok(doomed.progress >= 0, `progress ${doomed.progress} went negative`);
  }
  assert.equal(doomed.progress, 0);
});

test('the outcome resolves as caught at full progress and snapped at zero', () => {
  assert.equal(reelOutcomeFor(1), isCaught);
  assert.equal(reelOutcomeFor(0), lineSnapped);
  assert.equal(reelOutcomeFor(0.5), reelOutcome.inProgress);
});

test('containment is 1 inside and 0 outside', () => {
  const cfg = reelConfig({ fight: 0.5, control: 0.3, resilience: 0.5 });
  assert.equal(containedFraction(cfg, 0.5, 0.5), 1);
  assert.equal(isContained(cfg, 0.5, 0.5), true);
  assert.equal(containedFraction(cfg, 0.0, 1.0), 0);
  assert.equal(isContained(cfg, 0.0, 1.0), false);
});

test('a hard fish takes longer to land than a docile one', () => {
  // Simulate a player holding perfectly, and count frames to a full bar.
  const framesToFill = (cfg) => {
    let state = { fishX: 0.5, playerX: 0.5, progress: 0, holding: true };
    for (let i = 0; i < 20000; i += 1) {
      // Track the fish exactly: a perfect player never loses containment.
      const next = stepReel(cfg, state, 1 / 60, (i % 977) / 977);
      state = { ...next, playerX: next.fishX, progress: next.progress };
      if (state.progress >= 1) return i;
    }
    return Infinity;
  };
  const easy = framesToFill(reelConfig({ fight: 0.2, control: 0.3, resilience: 0.8 }));
  const hard = framesToFill(reelConfig({ fight: 1.0, control: 0.3, resilience: 0.2 }));
  assert.ok(easy < hard, `easy ${easy} frames must beat hard ${hard} frames`);
});

test('reelConfig is sane for every combination of its inputs', () => {
  for (const fight of [0, 0.5, 1]) {
    for (const control of [0.05, 0.36, 2]) {
      for (const resilience of [0, 0.5, 1]) {
        const cfg = reelConfig({ fight, control, resilience });
        assert.ok(cfg.fishSpeed > 0, 'the fish must always move');
        assert.ok(cfg.playerWidth > 0 && cfg.playerWidth < 1, `playerWidth ${cfg.playerWidth}`);
        assert.ok(cfg.jitter >= 0);
      }
    }
  }
});

test('a zero-resistance rod is handled without dividing by zero', () => {
  assert.doesNotThrow(() => stepReel(
    reelConfig({ fight: 0.5, control: 0.24, resilience: 0 }),
    { fishX: 0.5, playerX: 0.5, progress: 0.5, holding: true },
    1 / 60,
  ));
});


test('no fish can outrun the player, gust included, so every fish is winnable', () => {
  // The fish's top speed is fishSpeed * MAX_GUST. If that ever reaches playerSpeed
  // the fish is mathematically unwinnable, however good the player is — which is
  // what the old one-way drift and the old jitter multiplier both risked.
  for (const fight of [0, 0.35, 0.6, 0.88, 1]) {
    for (const resilience of [0, 0.3, 0.85]) {
      const cfg = reelConfig({ fight, control: 0.2, resilience });
      assert.ok(cfg.fishSpeed * 1.25 < cfg.playerSpeed,
        `fight ${fight} / resilience ${resilience}: fish peaks at ` +
        `${(cfg.fishSpeed * 1.25).toFixed(3)} but the player only reaches ${cfg.playerSpeed}`);
    }
  }
});

test('a Mythical on the starter rod is still beatable by a tracking player', () => {
  const cfg = reelConfig({ fight: 1, control: 0.2, resilience: 0.3 });
  let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true };
  let landed = false;
  for (let i = 0; i < 60 * 120; i += 1) {
    const next = stepReel(cfg, state, 1 / 60, ((i * 7919) % 1000) / 1000);
    // Chase the fish, clamping to the bar like the UI does.
    state = { ...next, playerX: Math.min(1, Math.max(0, next.fishX)), holding: next.fishX < 1 };
    if (state.progress >= 1) { landed = true; break; }
    assert.ok(state.progress > 0, `a tracking player lost containment at frame ${i}`);
  }
  assert.ok(landed, 'the worst fish in the game must still be landable');
});


test('the player bar travels left at nearly the speed it travels right', () => {
  // Asymmetric control is the subtlest way to make a fishing minigame unfair: the
  // bar is pushed one way by the key and drifts the other, and if the drift is
  // much slower a fish swimming that way can never be followed.
  for (const resilience of [0, 0.3, 0.85]) {
    const cfg = reelConfig({ fight: 0.6, control: 0.24, resilience });
    assert.ok(cfg.idleDrift >= cfg.playerSpeed * 0.6,
      `drift ${cfg.idleDrift} is far slower than push ${cfg.playerSpeed}`);
    assert.ok(cfg.idleDrift <= cfg.playerSpeed,
      'drift should not outpace the push, or releasing is the fast way to move');
  }
});

test('a left-swimming fish can be followed with the available controls', () => {
  const cfg = reelConfig({ fight: 0.88, control: 0.24, resilience: 0.4 });
  // Force the fish hard left every frame: the player must be able to keep up.
  let state = { fishX: 0.9, playerX: 0.9, progress: 0.34, holding: true };
  for (let i = 0; i < 240; i += 1) {
    const next = stepReel(cfg, state, 1 / 60, 0);
    state = { ...next, playerX: next.fishX, holding: next.fishX > cfg.playerWidth / 2 };
    assert.ok(state.playerX >= 0 && state.playerX <= 1);
  }
  assert.ok(state.progress > 0.34, 'progress held while following the fish left');
});


/* ------------------------------------------------ direction and craziness */

/**
 * The fish used to drift right with only its speed wobbling, so it never really
 * went left. Movement must be genuinely bidirectional, and the wilder a fish
 * moves the rarer it is — that is the whole difficulty curve of the minigame.
 */
const track = (cfg, FRAMES = 2400, startX = 0.5) => {
  let state = { fishX: startX, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
  const dirs = new Set();
  let left = 0, right = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const next = stepReel(cfg, state, 1 / 60, (i * 7919 % 1000) / 1000);
    dirs.add(next.dir);
    if (next.fishX > state.fishX) right += 1;
    else if (next.fishX < state.fishX) left += 1;
    state = next;
  }
  return { dirs, left, right, state };
};

test('the fish moves left as well as right', () => {
  for (const fight of [0.35, 0.6, 0.88, 1.0]) {
    const { left, right } = track(reelConfig({ fight, control: 0.3, resilience: 0.5 }));
    assert.ok(left > 60, `fight ${fight}: moved left on only ${left} of 2400 frames`);
    assert.ok(right > 60, `fight ${fight}: moved right on only ${right} of 2400 frames`);
  }
});

test('a rarer fish changes direction more often than a common one', () => {
  const countTurns = (fight) => {
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
    let turns = 0, last = state.dir;
    for (let i = 0; i < 3000; i += 1) {
      const next = stepReel(reelConfig({ fight, control: 0.3, resilience: 0.5 }),
        state, 1 / 60, (i * 7919 % 1000) / 1000);
      if (next.dir !== last) turns += 1;
      last = next.dir;
      state = next;
    }
    return turns;
  };
  const common = countTurns(0.35);
  const rare = countTurns(1.0);
  assert.ok(rare > common * 1.4,
    `mythical (${rare} turns) should thrash far more than common (${common})`);
});

test('a common fish still settles into long runs rather than buzzing constantly', () => {
  // A Mythical buzzing every frame is unreadable and unplayable; the point is a
  // spread of behaviour, not maximum chaos at both ends.
  const avgRun = (fight) => {
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
    let run = 0, last = 1, runs = [];
    for (let i = 0; i < 3000; i += 1) {
      const next = stepReel(reelConfig({ fight, control: 0.3, resilience: 0.5 }),
        state, 1 / 60, (i * 7919 % 1000) / 1000);
      if (next.dir !== last) { runs.push(run); run = 0; last = next.dir; }
      run += 1;
      state = next;
    }
    return runs.reduce((a, b) => a + b, 0) / Math.max(1, runs.length);
  };
  assert.ok(avgRun(0.35) > 6, `a common fish should hold a heading for a while, got ${avgRun(0.35).toFixed(1)} frames`);
});

test('resilience calms the movement, not just the speed', () => {
  const turns = (resilience) => {
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
    let n = 0, last = 1;
    for (let i = 0; i < 3000; i += 1) {
      const next = stepReel(reelConfig({ fight: 1, control: 0.3, resilience }),
        state, 1 / 60, (i * 7919 % 1000) / 1000);
      if (next.dir !== last) n += 1;
      last = next.dir;
      state = next;
    }
    return n;
  };
  assert.ok(turns(0.85) < turns(0), 'a tougher rod should steady the fish');
});

test('movement direction is reproducible for a given seed', () => {
  const runOnce = () => {
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
    const path = [];
    for (let i = 0; i < 200; i += 1) {
      const next = stepReel(reelConfig({ fight: 1, control: 0.3, resilience: 0.3 }),
        state, 1 / 60, (i * 7919 % 1000) / 1000);
      path.push(next.fishX.toFixed(6));
      state = next;
    }
    return path.join(',');
  };
  assert.equal(runOnce(), runOnce(), 'the same seed must give the same path');
});

test('the fish never leaves the bar, whatever it does', () => {
  for (const fight of [0.35, 0.88, 1.0]) {
    const cfg = reelConfig({ fight, control: 0.3, resilience: 0 });
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: false, dir: 1 };
    for (let i = 0; i < 4000; i += 1) {
      state = stepReel(cfg, state, 1 / 60, (i * 7919 % 1000) / 1000);
      assert.ok(state.fishX >= 0 && state.fishX <= 1,
        `fight ${fight}: fishX ${state.fishX} escaped at frame ${i}`);
    }
  }
});

test('a tough fish still never outruns the player', () => {
  // Direction changes must not let the fish exceed the player's top speed, or a
  // Mythical becomes unwinnable no matter how good the player is.
  for (const fight of [0.35, 0.6, 0.88, 1.0]) {
    const cfg = reelConfig({ fight, control: 0.2, resilience: 0 });
    const state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true, dir: 1 };
    let maxStep = 0;
    for (const seed of [0, 0.13, 0.5, 0.87, 0.999]) {
      const next = stepReel(cfg, state, 1 / 60, seed);
      maxStep = Math.max(maxStep, Math.abs(next.fishX - state.fishX));
    }
    assert.ok(maxStep < cfg.playerSpeed / 60,
      `fight ${fight}: step ${maxStep.toFixed(4)} exceeds player speed`);
  }
});



/* ---------------------------------------------------------- difficulty */

/**
 * A simulated player, used to measure how hard the minigame actually is.
 *
 * The control is one-axis: holding pushes the bar right, releasing lets it drift
 * left. `lag` is how many frames the player reacts late, and `error` is how far
 * off they think the fish is. That combination is what makes it a stand-in for a
 * person rather than a perfect tracker, which always wins.
 *
 * It drives the module's own `seed` parameter, so it needs no global patching and
 * every run is reproducible from its seed alone.
 */
function simulate(cfg, seed, { lag = 4, error = 0.08, frames = 60 * 90 } = {}) {
  let prng = ((seed * 2654435761) % 2147483647) || 1;
  const rnd = () => (prng = (prng * 48271) % 2147483647) / 2147483647;

  let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true, dir: 1 };
  // Seed the queue with "holding", or the player starts by only ever drifting left.
  const queue = [true];

  for (let i = 0; i < frames; i += 1) {
    const perceived = state.fishX + (rnd() * 2 - 1) * error;
    const wantHold = perceived > state.playerX + cfg.playerWidth / 4;
    if (lag === 0) state.holding = wantHold;
    else { queue.push(wantHold); state.holding = queue.shift(); }

    state = stepReel(cfg, state, 1 / 60, rnd());
    const outcome = reelOutcomeFor(state.progress);
    if (outcome === isCaught) return true;
    if (outcome === lineSnapped) return false;
  }
  return false;
}

/** Win rate for a simulated player, for readability in the tests. */
function winRate(cfg, { lag, error, runs = 200 } = {}) {
  let wins = 0;
  for (let seed = 1; seed <= runs; seed += 1) {
    if (simulate(cfg, seed, { lag, error, frames: 60 * 60 })) wins += 1;
  }
  return wins / runs;
}

/* ------------------------------------------------------------- difficulty */

/**
 * Measured with a simulated player at three skill levels (see the comment on
 * playerModel below). On the old tuning a beginner lost the Legendary 72% of the
 * time and the Mythical 99% — the wall was not skill, it was Control. The gap
 * between the cheapest and the first upgrade was a cliff, not a curve.
 */

test('the starting rod can land every fish, including the Mythical', () => {
  const cfg = reelConfig({ fight: 1.0, control: RODS.bamboo.control, resilience: RODS.bamboo.resilience });

  // A weak player, simulated with the module's own seed parameter.
  let wins = 0;
  const runs = 200;
  for (let seed = 1; seed <= runs; seed += 1) {
    if (simulate(cfg, seed, { lag: 7, error: 0.14 })) wins += 1;
  }
  assert.ok(wins / runs >= 0.6,
    `a weak player should land a Mythical on the starting rod at least 60% of the ` +
    `time, got ${Math.round((wins / runs) * 100)}%`);
});

test('rarity still costs a weak player something', () => {
  // The claim is about RARITY, so measure it per rarity band rather than per
  // table row. Comparing adjacent rows tested two other things by accident: the
  // order of the FISH table, and 200-run sampling noise, which reaches +-0.03
  // here — larger than the old 0.02 tolerance. A band mean averages that out.
  //
  // More runs also costs less than it sounds: the simulation is pure, so this is
  // arithmetic, not wall-clock waiting.
  const weak = { lag: 7, error: 0.14 };
  const rateFor = (fight) => winRate(
    reelConfig({ fight, control: RODS.bamboo.control, resilience: RODS.bamboo.resilience }),
    { ...weak, runs: 600 },
  );

  const byRarity = RARITY_ORDER.map((rarity) => {
    const fish = FISH.filter((f) => f.rarity === rarity);
    const rates = fish.map((f) => rateFor(f.fight));
    return { rarity, n: fish.length, mean: rates.reduce((s, v) => s + v, 0) / rates.length };
  });

  for (let i = 1; i < byRarity.length; i += 1) {
    assert.ok(byRarity[i].mean <= byRarity[i - 1].mean + 0.01,
      `${byRarity[i].rarity} should not be easier than ${byRarity[i - 1].rarity}: ` +
      `${byRarity[i - 1].mean.toFixed(3)} -> ${byRarity[i].mean.toFixed(3)}`);
  }

  // And a Mythical must be measurably harder than a Common.
  const spread = byRarity[0].mean - byRarity[byRarity.length - 1].mean;
  assert.ok(spread >= 0.05,
    `the Common-to-Mythical gap should be visible to a weak player, got ${Math.round(spread * 100)}%`);
});

test('upgrading a rod makes a clear, steady difference', () => {
  // No cliff between the cheapest rod and the first upgrade: both should be
  // landable, and the better one should be easier.
  const myth = 1.0;
  const at = (id) => reelConfig({
    fight: myth, control: RODS[id].control, resilience: RODS[id].resilience,
  });
  const rate = (cfg) => {
    let w = 0;
    for (let seed = 1; seed <= 200; seed += 1) if (simulate(cfg, seed, { lag: 7, error: 0.14 })) w += 1;
    return w / 200;
  };
  const cheap = rate(at('bamboo'));
  const upgrade = rate(at('willow'));
  assert.ok(cheap >= 0.6 && upgrade >= 0.6,
    `both the cheapest rod and the first upgrade should work: ${cheap}, ${upgrade}`);
  assert.ok(upgrade >= cheap,
    `an upgrade must not make things harder: ${cheap} -> ${upgrade}`);
});

test('a fight lasts long enough to feel like a fight, and longer for rarer fish', () => {
  // Measure the fight a player actually experiences: an average one, start to
  // finish. Seconds of perfect containment is a different and much smaller number.
  const played = (fight, id = 'bamboo') => {
    const cfg = reelConfig({ fight, control: RODS[id].control, resilience: RODS[id].resilience });
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      let prng = (seed * 2654435761) % 2147483647 || 1;
      const rnd = () => (prng = (prng * 48271) % 2147483647) / 2147483647;
      let st = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true, dir: 1 };
      const q = [true];
      for (let i = 0; i < 60 * 90; i += 1) {
        const perceived = st.fishX + (rnd() * 2 - 1) * 0.08;
        const wantHold = perceived > st.playerX + cfg.playerWidth / 4;
        q.push(wantHold);
        st.holding = q.shift();
        st = stepReel(cfg, st, 1 / 60, rnd());
        const outcome = reelOutcomeFor(st.progress);
        if (outcome === isCaught) { sum += i / 60; n += 1; break; }
        if (outcome === lineSnapped) break;
      }
    }
    return n ? sum / n : 0;
  };

  const common = played(0.35);
  const mythical = played(1.0);
  assert.ok(common >= 2, `a Common fight should run a couple of seconds, got ${common.toFixed(1)}s`);
  assert.ok(mythical >= 4, `a Mythical should take real work, got ${mythical.toFixed(1)}s`);
  assert.ok(mythical <= 20, `a Mythical must not drag on, got ${mythical.toFixed(1)}s`);
  assert.ok(mythical > common, `rarity should lengthen the fight: ${common.toFixed(1)}s vs ${mythical.toFixed(1)}s`);
});

test('a brief slip is survivable, a long one is not', () => {
  // Drain is the cost of a mistake. The point of this is that losing the fish for
  // a moment should cost progress but let the player continue — otherwise one slip
  // was fatal, which is what the old tuning did.
  for (const fight of [0.35, 0.6, 1.0]) {
    const cfg = reelConfig({ fight, control: RODS.bamboo.control, resilience: RODS.bamboo.resilience });

    // A slip of a quarter second must not snap the line.
    const slip = { ...stepReel(cfg, { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true, dir: 1 },
                              0.25, 0.5) };
    assert.notEqual(reelOutcomeFor(slip.progress), lineSnapped,
      `fight ${fight}: a quarter-second slip should not snap the line`);

    // Losing the fish for good, though, must still end the fight.
    let state = { fishX: 0.5, playerX: 0.5, progress: 0.34, holding: true, dir: 1 };
    for (let i = 0; i < 60 * 30 && reelOutcomeFor(state.progress) === reelOutcome.inProgress; i += 1) {
      // Drive the bar to the far end so containment never happens.
      state = stepReel(cfg, { ...state, playerX: 1, holding: false }, 1 / 60, 0.5);
      state = { ...state, playerX: 0 };            // pin it away from the fish
    }
    assert.equal(reelOutcomeFor(state.progress), lineSnapped,
      `fight ${fight}: ignoring the fish should eventually snap the line`);
  }
});

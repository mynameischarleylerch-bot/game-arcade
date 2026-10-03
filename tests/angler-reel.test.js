import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reelConfig, stepReel, isContained, containedFraction,
  reelOutcomeFor, reelOutcome, isCaught, lineSnapped,
} from '../vendor/fru-angler/reel.js';

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

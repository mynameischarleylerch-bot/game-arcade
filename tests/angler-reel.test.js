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

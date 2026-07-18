"use strict";

// Aggressive variant of "scroll" — same up/down swipe pattern, but shorter
// swipe duration (higher fling velocity) and near-zero pause between swipes,
// so the list rarely settles before the next input lands. Meant to surface
// jank that a gentler scroll pace hides. Same edge-safe y bounds as scroll.js
// (never closer than 25% to the top/bottom) so this doesn't reintroduce the
// gesture-nav/notification-shade interception bug.
module.exports = {
  id: "scroll-aggressive",
  description: "Rapid, back-to-back swipe up/down with minimal settle time (harsher jank test)",

  async promptConfig({ prompt }) {
    const cycles = await prompt.askNumber("Number of scroll cycles (one cycle = up + down)", 10);
    const swipesPerDirection = await prompt.askNumber(
      "Consecutive swipes per direction before reversing (higher = scrolls farther down before returning)",
      12
    );
    const swipeDurationMs = await prompt.askNumber(
      "Swipe duration (ms) — lower = faster fling velocity",
      120
    );
    const pauseMs = await prompt.askNumber(
      "Pause between swipes (ms) — lower = less time for the list to settle",
      50
    );
    return { cycles, swipesPerDirection, swipeDurationMs, pauseMs };
  },

  async run({ adb, config, log }) {
    const { width, height } = await adb.getScreenSize();
    const x = Math.round(width / 2);
    const yBottom = Math.round(height * 0.75);
    const yTop = Math.round(height * 0.25);
    const swipesPerDirection = config.swipesPerDirection || 1;

    for (let i = 1; i <= config.cycles; i++) {
      for (let s = 1; s <= swipesPerDirection; s++) {
        log(`scroll-aggressive cycle ${i}/${config.cycles}: swipe up (${s}/${swipesPerDirection})`);
        await adb.swipe(x, yBottom, x, yTop, config.swipeDurationMs);
        await adb.sleep(config.pauseMs);
      }

      for (let s = 1; s <= swipesPerDirection; s++) {
        log(`scroll-aggressive cycle ${i}/${config.cycles}: swipe down (${s}/${swipesPerDirection})`);
        await adb.swipe(x, yTop, x, yBottom, config.swipeDurationMs);
        await adb.sleep(config.pauseMs);
      }
    }
  },
};

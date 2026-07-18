"use strict";

// Generic scroll interaction — swipe up through the content, then back down,
// repeated N times. No app-specific coordinates: derived from the device's
// own screen size at run time, so this works on any device/app.
module.exports = {
  id: "scroll",
  description: "Repeated swipe up/down through a scrollable list",

  async promptConfig({ prompt }) {
    const cycles = await prompt.askNumber("Number of scroll cycles (one cycle = up + down)", 6);
    const swipesPerDirection = await prompt.askNumber(
      "Consecutive swipes per direction before reversing (higher = scrolls farther down before returning)",
      8
    );
    const swipeDurationMs = await prompt.askNumber("Swipe duration (ms)", 300);
    const pauseMs = await prompt.askNumber("Pause between swipes (ms)", 400);
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
        log(`scroll cycle ${i}/${config.cycles}: swipe up (${s}/${swipesPerDirection})`);
        await adb.swipe(x, yBottom, x, yTop, config.swipeDurationMs);
        await adb.sleep(config.pauseMs);
      }

      for (let s = 1; s <= swipesPerDirection; s++) {
        log(`scroll cycle ${i}/${config.cycles}: swipe down (${s}/${swipesPerDirection})`);
        await adb.swipe(x, yTop, x, yBottom, config.swipeDurationMs);
        await adb.sleep(config.pauseMs);
      }
    }
  },
};

"use strict";

// Generic scroll interaction — swipe up through the content, then back down,
// repeated N times. No app-specific coordinates: derived from the device's
// own screen size at run time, so this works on any device/app.
module.exports = {
  id: "scroll",
  description: "Repeated swipe up/down through a scrollable list",

  async promptConfig({ prompt }) {
    const cycles = await prompt.askNumber("Number of scroll cycles (one cycle = up + down)", 6);
    const swipeDurationMs = await prompt.askNumber("Swipe duration (ms)", 300);
    const pauseMs = await prompt.askNumber("Pause between swipes (ms)", 400);
    return { cycles, swipeDurationMs, pauseMs };
  },

  async run({ adb, config, log }) {
    const { width, height } = await adb.getScreenSize();
    const x = Math.round(width / 2);
    const yBottom = Math.round(height * 0.8);
    const yTop = Math.round(height * 0.3);

    for (let i = 1; i <= config.cycles; i++) {
      log(`scroll cycle ${i}/${config.cycles}: swipe up`);
      await adb.swipe(x, yBottom, x, yTop, config.swipeDurationMs);
      await adb.sleep(config.pauseMs);

      log(`scroll cycle ${i}/${config.cycles}: swipe down`);
      await adb.swipe(x, yTop, x, yBottom, config.swipeDurationMs);
      await adb.sleep(config.pauseMs);
    }
  },
};

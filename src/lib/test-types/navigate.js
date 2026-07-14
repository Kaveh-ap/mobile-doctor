"use strict";

// Tap a point, then press Back — the interaction memory measurements care
// about most (enter a screen, let it allocate, back out, see what's left).
// Coordinates default to screen center but are always prompted, since "the
// screen to open" is inherently app-specific.
module.exports = {
  id: "navigate",
  description: "Tap a point, then press Back (screen enter/exit memory churn)",

  async promptConfig({ prompt, adb }) {
    const { width, height } = await adb.getScreenSize();
    const defaultX = Math.round(width / 2);
    const defaultY = Math.round(height / 2);

    const x = await prompt.askNumber("Tap X coordinate", defaultX);
    const y = await prompt.askNumber("Tap Y coordinate", defaultY);
    const waitBeforeBackMs = await prompt.askNumber("Wait before pressing Back (ms)", 3000);
    const waitAfterBackMs = await prompt.askNumber("Wait after pressing Back (ms)", 3000);
    return { x, y, waitBeforeBackMs, waitAfterBackMs };
  },

  async run({ adb, config, log }) {
    log(`tap at (${config.x}, ${config.y})`);
    await adb.tap(config.x, config.y);
    await adb.sleep(config.waitBeforeBackMs);

    log("pressing back");
    await adb.pressBack();
    await adb.sleep(config.waitAfterBackMs);
  },
};

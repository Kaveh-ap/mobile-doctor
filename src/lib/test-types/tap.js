"use strict";

// Generic repeated-tap interaction — useful for measuring jank around a
// tap-triggered animation (e.g. a loading spinner, an add-to-cart bounce)
// rather than scroll jank. Coordinates default to screen center but are
// always prompted, since "the button to tap" is inherently app-specific.
module.exports = {
  id: "tap",
  description: "Repeated tap at a fixed point (interaction jank, not scroll)",

  async promptConfig({ prompt, adb }) {
    const { width, height } = await adb.getScreenSize();
    const defaultX = Math.round(width / 2);
    const defaultY = Math.round(height / 2);

    const x = await prompt.askNumber("Tap X coordinate", defaultX);
    const y = await prompt.askNumber("Tap Y coordinate", defaultY);
    const taps = await prompt.askNumber("Number of taps", 10);
    const intervalMs = await prompt.askNumber("Interval between taps (ms)", 600);
    return { x, y, taps, intervalMs };
  },

  async run({ adb, config, log }) {
    for (let i = 1; i <= config.taps; i++) {
      log(`tap ${i}/${config.taps} at (${config.x}, ${config.y})`);
      await adb.tap(config.x, config.y);
      await adb.sleep(config.intervalMs);
    }
  },
};

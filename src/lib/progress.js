"use strict";

const { getClack } = require("./clack");

/**
 * A @clack/prompts progress bar for iteration loops (gfx/memory runs), so
 * "N of M" doesn't scroll past as a wall of console.log lines.
 * @param {number} total
 * @returns {Promise<{ advance(step: number, message?: string): void, stop(message?: string): void }>}
 */
async function createProgress(total) {
  const p = await getClack();
  const bar = p.progress({ max: total, style: "block" });
  bar.start("Starting...");
  return {
    advance: (step, message) => bar.advance(step, message),
    stop: (message) => bar.stop(message),
  };
}

module.exports = { createProgress };

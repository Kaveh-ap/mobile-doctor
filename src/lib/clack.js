"use strict";

// @clack/prompts ships ESM-only, while the rest of mobile-doctor is
// CommonJS. A cached dynamic import lets every other module keep using
// plain `require` — the import only happens once, on first use.
let modulePromise;

function getClack() {
  if (!modulePromise) modulePromise = import("@clack/prompts");
  return modulePromise;
}

module.exports = { getClack };

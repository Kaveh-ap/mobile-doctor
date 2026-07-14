#!/usr/bin/env node
"use strict";

/**
 * mobile-doctor — device-driven diagnostics for mobile apps.
 *
 * Categories live under src/<category>/index.js and are auto-discovered —
 * adding a new one means dropping in a new folder, nothing to wire up here.
 * Test types (the interaction driving each iteration — scroll, tap,
 * navigate, ...) are shared across categories via src/lib/test-types/ and
 * are auto-discovered the same way.
 *
 * Usage:
 *   mobile-doctor                       # prompts for a category
 *   mobile-doctor gfx                   # skip the category prompt
 *   mobile-doctor gfx --results-dir /path/to/results
 */

const fs = require("fs");
const path = require("path");

const adb = require("../src/lib/adb");
const prompt = require("../src/lib/prompt");
const { getClack } = require("../src/lib/clack");
const { makeConfigStore } = require("../src/lib/config-store");
const { version } = require("../package.json");

const ROOT = path.join(__dirname, "..");

function loadCategories() {
  const srcDir = path.join(ROOT, "src");
  return fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "lib")
    .map((entry) => require(path.join(srcDir, entry.name, "index.js")));
}

function resolveResultsRoot() {
  const flagIndex = process.argv.indexOf("--results-dir");
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.argv[flagIndex + 1]);
  }
  if (process.env.MOBILE_DOCTOR_RESULTS_DIR) {
    return path.resolve(process.env.MOBILE_DOCTOR_RESULTS_DIR);
  }
  return path.join(process.cwd(), "results");
}

async function main() {
  const p = await getClack();
  const log = (message) => p.log.step(message);

  p.intro(`🩺 mobile-doctor v${version}`);

  const categories = loadCategories();
  const requestedId =
    process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;

  let category = categories.find((c) => c.id === requestedId);
  if (!category) {
    const chosenId = await prompt.askChoice(
      "Select a category:",
      categories.map((c) => ({ id: c.id, description: c.description }))
    );
    category = categories.find((c) => c.id === chosenId);
  }

  const resultsRoot = resolveResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  const configStore = makeConfigStore(path.join(ROOT, ".mobile-doctor-config.json"));

  try {
    await category.run({ adb, prompt, resultsRoot, configStore, log });
  } catch (error) {
    p.log.error(error.message);
    p.outro("Failed.");
    process.exit(1);
  }

  p.outro("Done.");
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});

# mobile-doctor

[![npm version](https://img.shields.io/npm/v/mobile-doctor.svg)](https://www.npmjs.com/package/mobile-doctor)

Device-driven diagnostics for mobile apps. GFX/jank benchmarking
(`adb shell dumpsys gfxinfo`-based scroll/tap tests) and device
lifecycle (boot an iOS Simulator/Android emulator) today, more categories
over time — no project-specific package name, coordinates, or paths are
hardcoded anywhere in here.

## Setup

```bash
npm install -g mobile-doctor
```

`mobile-doctor` is then available from any directory, in any project.

### Developing locally

```bash
yarn install       # no runtime dependencies today, but keeps this a real project
yarn link          # exposes the `mobile-doctor` command globally, pointing at this clone
```

## Usage

```bash
mobile-doctor              # prompts for a category, then walks you through it
mobile-doctor gfx          # skip straight to the gfx category
mobile-doctor devices      # skip straight to the device-boot category
mobile-doctor gfx --results-dir /path/to/results   # or set MOBILE_DOCTOR_RESULTS_DIR

# equivalent shortcuts, from within a clone of this repo:
yarn gfx
yarn devices
```

You'll be prompted for:

1. **Category** — `gfx` or `devices` today. Each category lives in
   `src/<category>/index.js` and is auto-discovered — see "Adding a new
   category" below.
2. Within `gfx`: **test type** (`scroll` or `tap` today, also
   auto-discovered from `src/gfx/test-types/`), **package name**
   (remembered between runs), **run name**, and **iterations**.
3. Within `devices`: platform (iOS/Android), then which simulator/emulator
   to boot — an interactive arrow-key picker, not a numbered prompt.

Each `gfx` run automates the full `adb shell dumpsys gfxinfo <pkg> reset` →
device interaction → `dumpsys gfxinfo` / `framestats` dump cycle — no manual
scrolling or manually typing `dumpsys` commands.

## Output

```
results/
  gfx/
    <run-name>/
      summary.csv           # one row per iteration
      gfxinfo-raw-1.txt      # raw `dumpsys gfxinfo <pkg>` text, per iteration
      framestats-raw-1.txt   # raw `dumpsys gfxinfo <pkg> framestats` text, per iteration
      meta.json              # test type, config used, timestamps
```

If a run name already exists, the next free `name-1`, `name-2`, ... is used
automatically — nothing gets overwritten. Point two runs' `summary.csv` at
your own diffing/charting of choice to compare them (e.g. a compound-vs-flat
comparison, or before/after a fix).

## Adding a new test type (within an existing category)

Create `src/gfx/test-types/<name>.js` exporting:

```js
module.exports = {
  id: "my-test",
  description: "One line shown in the test-type picker",
  async promptConfig({ prompt, adb }) {
    return { /* config object, passed to run() */ };
  },
  async run({ adb, config, log }) {
    // drive the device via `adb` (see src/lib/adb.js), call log(message)
    // for progress output
  },
};
```

It shows up in the picker automatically.

## Adding a new category

Create `src/<category>/index.js` exporting:

```js
module.exports = {
  id: "memory",
  description: "One line shown in the category picker",
  async run({ adb, prompt, resultsRoot, configStore, log }) {
    // own interactive flow, own result folder under resultsRoot/<category>/
  },
};
```

It shows up in the picker automatically — nothing else to wire up. Shared
helpers (`adb`, `prompt`, `unique-name`, `config-store`) live in `src/lib/`
and are meant to be reused across every category.

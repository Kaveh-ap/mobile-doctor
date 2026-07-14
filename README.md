# mobile-doctor

[![npm version](https://img.shields.io/npm/v/mobile-doctor.svg)](https://www.npmjs.com/package/mobile-doctor)

Device-driven diagnostics for mobile apps — GFX/jank benchmarking, memory
benchmarking, HTML comparison reports, and device lifecycle management
today, more categories over time. No project-specific package name,
coordinates, or paths are hardcoded anywhere in here.

The CLI itself is built on [`@clack/prompts`](https://github.com/bombshell-dev/clack) —
arrow-key select menus, spinners, and progress bars instead of typed-number
menus and scrolling log spam.

## Table of contents

- [Setup](#setup)
- [Usage](#usage)
- [Commands](#commands)
  - [`devices`](#devices)
  - [`gfx`](#gfx)
  - [`memory`](#memory)
  - [`report`](#report)
- [Adding a new test type or category](#adding-a-new-test-type-or-category)
- [Developing locally](#developing-locally)

## Setup

| | |
|---|---|
| **npm** | `npm install -g mobile-doctor` |
| **yarn** | `yarn global add mobile-doctor` |

Either one puts the `mobile-doctor` command on your `PATH`, usable from any
directory, in any project.

## Usage

```bash
mobile-doctor                # prompts for a command, then walks you through it
mobile-doctor gfx            # skip straight to a command
mobile-doctor gfx --results-dir /path/to/results   # or set MOBILE_DOCTOR_RESULTS_DIR
```

From within a clone of this repo, the same commands are also available as
yarn/npm scripts:

| yarn | npm | equivalent to |
|---|---|---|
| `yarn devices` | `npm run devices` | `mobile-doctor devices` |
| `yarn gfx` | `npm run gfx` | `mobile-doctor gfx` |
| `yarn memory` | `npm run memory` | `mobile-doctor memory` |
| `yarn report` | `npm run report` | `mobile-doctor report` |

## Commands

Every command lives in `src/<command>/index.js` and is auto-discovered — the
picker you see when running `mobile-doctor` with no arguments always
reflects what's actually in `src/`.

| Command | What it does |
|---|---|
| [`devices`](#devices) | Boot an iOS Simulator or Android emulator |
| [`gfx`](#gfx) | Run a GFX/jank benchmark and record the results |
| [`memory`](#memory) | Run a memory benchmark and record the results |
| [`report`](#report) | Turn one or more `gfx`/`memory` runs into a shareable HTML report |

### `devices`

An interactive, arrow-key device picker — no project-specific coordinates or
package names involved:

1. Select **iOS** (Simulators, via `xcrun simctl`) or **Android**
   (Emulators, via `$ANDROID_HOME/emulator`).
2. Select which simulator/emulator to boot from the ones currently
   available on your machine.

```bash
mobile-doctor devices
```

### `gfx`

Automates the whole Android jank-measurement cycle so you never have to
manually type `adb shell dumpsys gfxinfo` or scroll a screen by hand:

```
reset gfxinfo (adb ... reset) → drive the device → dump gfxinfo/framestats → parse → repeat
```

You'll be prompted for:

| Prompt | Notes |
|---|---|
| **Test type** | `scroll` (repeated swipe up/down), `tap` (repeated tap at a point), or `navigate` (tap then Back), auto-discovered from `src/lib/test-types/` — shared with `memory` |
| **Package name** | The app under test; remembered between runs |
| **Run name** | Folder name under `results/gfx/`; auto-suffixed (`-1`, `-2`, ...) if it already exists |
| **Iterations** | How many reset → interact → dump cycles to run |
| *(test-type specific)* | e.g. scroll cycle count/duration for `scroll`, tap coordinates/count for `tap` |

Each iteration: resets the app's on-device gfxinfo counters, runs the
interaction (scroll/tap), waits briefly for the counters to settle, then
dumps and parses `dumpsys gfxinfo` and `dumpsys gfxinfo ... framestats`.
The parsed metrics — jank %, frame percentiles, GPU percentiles, missed
vsync, and more (see `src/gfx/lib/gfxinfo-parser.js` for the full list) —
are appended as one row per iteration to `summary.csv`.

```bash
mobile-doctor gfx
```

#### Output

```
results/
  gfx/
    <run-name>/
      summary.csv          # one row per iteration — feed this into `report`
      meta.json             # test type, config used, timestamps
      raw/
        gfxinfo-raw-1.txt    # raw `dumpsys gfxinfo <pkg>` text, per iteration
        framestats-raw-1.txt # raw `dumpsys gfxinfo <pkg> framestats` text, per iteration
```

The raw dumps are kept in their own `raw/` subfolder since `summary.csv`
already has everything parsed out — they're there for the rare case you need
to double check a number against the original `dumpsys` output.

### `memory`

Automates repeated `adb shell dumpsys meminfo` sampling around an
interaction, so you can watch PSS/heap/view-count trend across iterations
instead of eyeballing one-off `dumpsys` dumps:

```
drive the device (navigate/scroll/tap) → dump meminfo → parse → repeat
```

You'll be prompted for:

| Prompt | Notes |
|---|---|
| **Test type** | `navigate` (tap then Back — the default for memory churn), `scroll`, or `tap`, auto-discovered from `src/lib/test-types/` — shared with `gfx` |
| **Package name** | The app under test; remembered between runs |
| **Run name** | Folder name under `results/memory/`; auto-suffixed (`-1`, `-2`, ...) if it already exists |
| **Iterations** | How many interact → dump cycles to run |
| *(test-type specific)* | e.g. tap coordinates and Back-wait durations for `navigate` |

Each iteration: runs the interaction, then dumps and parses
`dumpsys meminfo <package>`. The parsed metrics — total PSS, total RSS,
native heap, Dalvik heap, view count, activities, and app contexts (see
`src/memory/lib/meminfo-parser.js` for the full list) — are appended as one
row per iteration to `summary.csv`.

```bash
mobile-doctor memory
```

#### Output

```
results/
  memory/
    <run-name>/
      summary.csv          # one row per iteration — feed this into `report`
      meta.json             # test type, config used, timestamps
      raw/
        meminfo-raw-1.txt    # raw `dumpsys meminfo <pkg>` text, per iteration
```

### `report`

Turns one or more `gfx` or `memory` runs' `summary.csv` files into a single
self-contained HTML report — useful for comparing a before/after fix, or a
compound-vs-flat layout, without eyeballing raw CSVs side by side.

```bash
mobile-doctor report
```

If both categories have runs on disk, you'll first be asked which one to
report on. Then you'll get a checkbox list to pick which run(s) to include
(all selected by default — space to toggle, enter to confirm) and a name
for the report file. It's written to `results/<category>/reports/<name>.html`
and opened in your default browser automatically. The report includes:

- A **final-metrics table** comparing the last iteration of every selected
  run, with a % change column between the first and last run picked.
- **Charts** tailored to the category — jank % over time, frame
  accumulation, and P95/P99 frame percentiles for `gfx`; PSS, native/Dalvik
  heap, and view count over time for `memory` — one line per run.

## Adding a new test type or category

Only necessary if the existing `scroll`/`tap`/`navigate` test types (or
`devices`/`gfx`/`memory`/`report` commands) don't cover what you need — most
day-to-day usage is just running the commands above.

**A new test type** (shared by `gfx` and `memory`) — create
`src/lib/test-types/<name>.js`:

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

**A new top-level command** — create `src/<command>/index.js`:

```js
module.exports = {
  id: "battery",
  description: "One line shown in the command picker",
  async run({ adb, prompt, resultsRoot, configStore, log }) {
    // own interactive flow, own result folder under resultsRoot/<command>/
  },
};
```

Either one shows up in its picker automatically — nothing else to wire up.
Shared helpers (`adb`, `prompt`, `unique-name`, `config-store`) live in
`src/lib/` and are meant to be reused across every command.

## Developing locally

Working on `mobile-doctor` itself? Link it instead of installing it:

```bash
git clone https://github.com/Kaveh-ap/mobile-doctor.git
cd mobile-doctor
yarn install       # installs @clack/prompts, the only runtime dependency
yarn link          # exposes `mobile-doctor` globally, pointing at this clone
```

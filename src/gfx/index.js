"use strict";

const fs = require("fs");
const path = require("path");

const gfxinfoParser = require("./lib/gfxinfo-parser");
const { resolveUniqueName } = require("../lib/unique-name");
const { getClack } = require("../lib/clack");
const { createProgress } = require("../lib/progress");

function loadTestTypes() {
  const dir = path.join(__dirname, "..", "lib", "test-types");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => require(path.join(dir, f)));
}

module.exports = {
  id: "gfx",
  description: "GFX/jank benchmarking via adb dumpsys gfxinfo (scroll, tap, ...)",

  async run({ adb, prompt, resultsRoot, configStore, log }) {
    const p = await getClack();

    const deviceCheck = p.spinner();
    deviceCheck.start("Checking adb & connected device");
    await adb.checkAvailable();
    if (!(await adb.hasConnectedDevice())) {
      deviceCheck.error("No connected device/emulator found");
      throw new Error("No connected device/emulator found (check `adb devices`).");
    }
    deviceCheck.stop("adb ready, device connected");

    const testTypes = loadTestTypes();
    const last = configStore.get("gfx");

    const testTypeId = await prompt.askChoice(
      "Select test type:",
      testTypes.map((t) => ({ id: t.id, description: t.description }))
    );
    const testType = testTypes.find((t) => t.id === testTypeId);

    const packageName = await prompt.askText("Package name", last.packageName);
    if (!packageName) throw new Error("A package name is required.");

    const runName = await prompt.askText("Run name", last.runName || "gfx-run");
    const iterations = await prompt.askNumber("Number of iterations", 1);

    // Nested under resultsRoot/gfx/ so multiple categories stay organized
    // side by side as more get added (e.g. resultsRoot/memory/...).
    const categoryResultsDir = path.join(resultsRoot, "gfx");
    fs.mkdirSync(categoryResultsDir, { recursive: true });
    const uniqueName = resolveUniqueName(categoryResultsDir, runName);
    const runDir = path.join(categoryResultsDir, uniqueName);
    fs.mkdirSync(runDir, { recursive: true });

    p.note(`Test type: ${testType.id}\nPackage:   ${packageName}\nRun dir:   ${runDir}`, "gfx run");

    const testConfig = await testType.promptConfig({ prompt, adb });

    // Raw dumps are per-iteration and rarely opened directly (summary.csv
    // already has the parsed numbers) — keep them out of the way in their
    // own subfolder rather than cluttering the run directory.
    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    const progress = await createProgress(iterations);
    for (let i = 1; i <= iterations; i++) {
      progress.advance(0, `iteration ${i}/${iterations}: resetting gfxinfo`);
      await adb.resetGfxInfo(packageName);

      await testType.run({ adb, config: testConfig, log });

      progress.advance(0, `iteration ${i}/${iterations}: settling before dump`);
      await adb.sleep(1000);

      const rawGfxInfo = await adb.dumpGfxInfo(packageName);
      const rawFrameStats = await adb.dumpFrameStats(packageName);

      fs.writeFileSync(path.join(rawDir, `gfxinfo-raw-${i}.txt`), rawGfxInfo);
      fs.writeFileSync(path.join(rawDir, `framestats-raw-${i}.txt`), rawFrameStats);

      const parsed = gfxinfoParser.parseGfxInfo(rawGfxInfo, {
        timestamp: new Date().toISOString(),
        packageName,
      });

      const isNewCsv = !fs.existsSync(csvPath);
      fs.appendFileSync(
        csvPath,
        (isNewCsv ? gfxinfoParser.csvHeaderRow().join(",") + "\n" : "") +
          gfxinfoParser.csvDataRow(parsed) +
          "\n"
      );

      progress.advance(
        1,
        `iteration ${i}/${iterations}: janky=${parsed.jankyPercent ?? "N/A"}% p90=${parsed.p90 ?? "N/A"}ms p95=${parsed.p95 ?? "N/A"}ms`
      );
    }
    progress.stop(`Collected ${iterations} iteration${iterations === 1 ? "" : "s"}.`);

    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          testType: testType.id,
          package: packageName,
          iterations,
          config: testConfig,
        },
        null,
        2
      )
    );

    configStore.save("gfx", { packageName, runName });

    p.log.success(
      `Results saved to: ${runDir}\n(summary.csv, meta.json, raw/gfxinfo-raw-*.txt, raw/framestats-raw-*.txt)`
    );
  },
};

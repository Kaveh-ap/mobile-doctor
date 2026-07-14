"use strict";

const fs = require("fs");
const path = require("path");

const gfxinfoParser = require("./lib/gfxinfo-parser");
const { resolveUniqueName } = require("../lib/unique-name");

function loadTestTypes() {
  const dir = path.join(__dirname, "test-types");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => require(path.join(dir, f)));
}

module.exports = {
  id: "gfx",
  description: "GFX/jank benchmarking via adb dumpsys gfxinfo (scroll, tap, ...)",

  async run({ adb, prompt, resultsRoot, configStore, log }) {
    await adb.checkAvailable();
    if (!(await adb.hasConnectedDevice())) {
      throw new Error("No connected device/emulator found (check `adb devices`).");
    }

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

    console.log(`\nTest type: ${testType.id}`);
    console.log(`Package:   ${packageName}`);
    console.log(`Run dir:   ${runDir}\n`);

    const testConfig = await testType.promptConfig({ prompt, adb });

    const csvPath = path.join(runDir, "summary.csv");

    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- Iteration ${i}/${iterations} ---`);

      log(`resetting gfxinfo for ${packageName}`);
      await adb.resetGfxInfo(packageName);

      await testType.run({ adb, config: testConfig, log });

      log("settling before dump...");
      await adb.sleep(1000);

      const rawGfxInfo = await adb.dumpGfxInfo(packageName);
      const rawFrameStats = await adb.dumpFrameStats(packageName);

      fs.writeFileSync(path.join(runDir, `gfxinfo-raw-${i}.txt`), rawGfxInfo);
      fs.writeFileSync(path.join(runDir, `framestats-raw-${i}.txt`), rawFrameStats);

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

      console.log(
        `  frames=${parsed.totalFrames ?? "N/A"} janky=${parsed.jankyFrames ?? "N/A"} ` +
          `(${parsed.jankyPercent ?? "N/A"}%) p90=${parsed.p90 ?? "N/A"}ms p95=${parsed.p95 ?? "N/A"}ms`
      );
    }

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

    console.log(`\nDone. Results saved to: ${runDir}`);
    console.log(`  summary.csv, gfxinfo-raw-*.txt, framestats-raw-*.txt, meta.json`);
  },
};

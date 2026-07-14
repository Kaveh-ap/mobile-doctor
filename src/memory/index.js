"use strict";

const fs = require("fs");
const path = require("path");

const meminfoParser = require("./lib/meminfo-parser");
const { resolveUniqueName } = require("../lib/unique-name");

function loadTestTypes() {
  const dir = path.join(__dirname, "..", "lib", "test-types");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => require(path.join(dir, f)));
}

module.exports = {
  id: "memory",
  description: "Memory benchmarking via adb dumpsys meminfo (navigate, scroll, tap, ...)",

  async run({ adb, prompt, resultsRoot, configStore, log }) {
    await adb.checkAvailable();
    if (!(await adb.hasConnectedDevice())) {
      throw new Error("No connected device/emulator found (check `adb devices`).");
    }

    const testTypes = loadTestTypes();
    const last = configStore.get("memory");

    const testTypeId = await prompt.askChoice(
      "Select test type:",
      testTypes.map((t) => ({ id: t.id, description: t.description }))
    );
    const testType = testTypes.find((t) => t.id === testTypeId);

    const packageName = await prompt.askText("Package name", last.packageName);
    if (!packageName) throw new Error("A package name is required.");

    const runName = await prompt.askText("Run name", last.runName || "memory-run");
    const iterations = await prompt.askNumber("Number of iterations", 10);

    // Nested under resultsRoot/memory/ so it stays organized side by side
    // with other categories (e.g. resultsRoot/gfx/...).
    const categoryResultsDir = path.join(resultsRoot, "memory");
    fs.mkdirSync(categoryResultsDir, { recursive: true });
    const uniqueName = resolveUniqueName(categoryResultsDir, runName);
    const runDir = path.join(categoryResultsDir, uniqueName);
    fs.mkdirSync(runDir, { recursive: true });

    console.log(`\nTest type: ${testType.id}`);
    console.log(`Package:   ${packageName}`);
    console.log(`Run dir:   ${runDir}\n`);

    const testConfig = await testType.promptConfig({ prompt, adb });

    // Raw dumps are per-iteration and rarely opened directly (summary.csv
    // already has the parsed numbers) — keep them out of the way in their
    // own subfolder rather than cluttering the run directory.
    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- Iteration ${i}/${iterations} ---`);

      await testType.run({ adb, config: testConfig, log });

      const rawMemInfo = await adb.dumpMemInfo(packageName);
      fs.writeFileSync(path.join(rawDir, `meminfo-raw-${i}.txt`), rawMemInfo);

      const parsed = meminfoParser.parseMemInfo(rawMemInfo, {
        timestamp: new Date().toISOString(),
        packageName,
      });

      const isNewCsv = !fs.existsSync(csvPath);
      fs.appendFileSync(
        csvPath,
        (isNewCsv ? meminfoParser.csvHeaderRow().join(",") + "\n" : "") +
          meminfoParser.csvDataRow(parsed) +
          "\n"
      );

      console.log(
        `  pss=${parsed.pss ?? "N/A"}KB nativeHeap=${parsed.nativeHeap ?? "N/A"}KB ` +
          `dalvikHeap=${parsed.dalvikHeap ?? "N/A"}KB views=${parsed.views ?? "N/A"}`
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

    configStore.save("memory", { packageName, runName });

    console.log(`\nDone. Results saved to: ${runDir}`);
    console.log(`  summary.csv, meta.json, raw/meminfo-raw-*.txt`);
  },
};

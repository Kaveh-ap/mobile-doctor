"use strict";

const fs = require("fs");
const path = require("path");

const meminfoParser = require("./lib/meminfo-parser");
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
  id: "memory",
  description: "Memory benchmarking via adb dumpsys meminfo (navigate, scroll, tap, ...)",

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

    p.note(`Test type: ${testType.id}\nPackage:   ${packageName}\nRun dir:   ${runDir}`, "memory run");

    const testConfig = await testType.promptConfig({ prompt, adb });

    // Raw dumps are per-iteration and rarely opened directly (summary.csv
    // already has the parsed numbers) — keep them out of the way in their
    // own subfolder rather than cluttering the run directory.
    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    const progress = await createProgress(iterations);
    for (let i = 1; i <= iterations; i++) {
      progress.advance(0, `iteration ${i}/${iterations}: running interaction`);
      await testType.run({ adb, config: testConfig, log });

      progress.advance(0, `iteration ${i}/${iterations}: dumping meminfo`);
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

      progress.advance(
        1,
        `iteration ${i}/${iterations}: pss=${parsed.pss ?? "N/A"}KB nativeHeap=${parsed.nativeHeap ?? "N/A"}KB views=${parsed.views ?? "N/A"}`
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

    configStore.save("memory", { packageName, runName });

    p.log.success(`Results saved to: ${runDir}\n(summary.csv, meta.json, raw/meminfo-raw-*.txt)`);
  },
};

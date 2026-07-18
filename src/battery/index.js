"use strict";

const fs = require("fs");
const path = require("path");

const batteryParser = require("./lib/battery-parser");
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
  id: "battery",
  description: "Battery level/temperature trend via adb dumpsys battery (scroll, tap, navigate, ...)",

  async run({ adb, prompt, resultsRoot, configStore }) {
    const p = await getClack();

    const deviceCheck = p.spinner();
    deviceCheck.start("Checking adb & connected device");
    await adb.checkAvailable();
    if (!(await adb.hasConnectedDevice())) {
      deviceCheck.error("No connected device/emulator found");
      throw new Error("No connected device/emulator found (check `adb devices`).");
    }
    deviceCheck.stop("adb ready, device connected");

    p.note(
      "Battery level moves slowly and charging power skews the numbers — unplug the device (adb over Wi-Fi works fine) for a meaningful drain trend. Temperature is useful either way.",
      "Before you start"
    );

    const testTypes = loadTestTypes();
    const last = configStore.get("battery");

    const testTypeId = await prompt.askChoice(
      "Select test type:",
      testTypes.map((t) => ({ id: t.id, description: t.description }))
    );
    const testType = testTypes.find((t) => t.id === testTypeId);

    const packageName = await prompt.askText("Package name", last.packageName);
    if (!packageName) throw new Error("A package name is required.");

    const runName = await prompt.askText("Run name", last.runName || "battery-run");
    const iterations = await prompt.askNumber("Number of iterations", 10);

    // Nested under resultsRoot/battery/ so it stays organized side by side
    // with other categories (e.g. resultsRoot/gfx/..., resultsRoot/cpu/...).
    const categoryResultsDir = path.join(resultsRoot, "battery");
    fs.mkdirSync(categoryResultsDir, { recursive: true });
    const uniqueName = resolveUniqueName(categoryResultsDir, runName);
    const runDir = path.join(categoryResultsDir, uniqueName);
    fs.mkdirSync(runDir, { recursive: true });

    p.note(
      `Test type: ${testType.id}\nPackage:   ${packageName}\nRun dir:   ${runDir}`,
      "battery run"
    );

    const testConfig = await testType.promptConfig({ prompt, adb });

    // Best-effort — gives a clean slate for the full batterystats dump
    // saved alongside the per-iteration level/temp samples below.
    await adb.resetBatteryStats();

    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    const progress = await createProgress(iterations);
    const stepLog = (message) => progress.advance(0, message);
    let lastParsed = null;
    for (let i = 1; i <= iterations; i++) {
      progress.advance(0, `iteration ${i}/${iterations}: running interaction`);
      await testType.run({ adb, config: testConfig, log: stepLog });

      progress.advance(0, `iteration ${i}/${iterations}: sampling battery`);
      const rawBattery = await adb.dumpBattery();
      fs.writeFileSync(path.join(rawDir, `battery-raw-${i}.txt`), rawBattery);

      const parsed = batteryParser.parseBattery(rawBattery, {
        timestamp: new Date().toISOString(),
      });
      lastParsed = parsed;

      const isNewCsv = !fs.existsSync(csvPath);
      fs.appendFileSync(
        csvPath,
        (isNewCsv ? batteryParser.csvHeaderRow().join(",") + "\n" : "") +
          batteryParser.csvDataRow(parsed) +
          "\n"
      );

      progress.advance(
        1,
        `iteration ${i}/${iterations}: level=${parsed.level ?? "N/A"}% temp=${parsed.temperature ?? "N/A"}C`
      );
    }
    progress.stop(`Collected ${iterations} iteration${iterations === 1 ? "" : "s"}.`);

    // Deeper per-UID attribution, if you need to dig further than the
    // level/temperature trend above — format varies by Android version so
    // it's saved raw rather than parsed.
    const rawBatteryStats = await adb.dumpBatteryStats(packageName);
    fs.writeFileSync(path.join(rawDir, "batterystats-raw.txt"), rawBatteryStats);

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

    configStore.save("battery", { packageName, runName });

    if (lastParsed && (lastParsed.acPowered || lastParsed.usbPowered)) {
      p.log.warn(
        "Device was charging during this run — level/drain numbers aren't meaningful while plugged in."
      );
    }

    p.log.success(
      `Results saved to: ${runDir}\n(summary.csv, meta.json, raw/battery-raw-*.txt, raw/batterystats-raw.txt)`
    );
  },
};

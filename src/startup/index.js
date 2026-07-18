"use strict";

const fs = require("fs");
const path = require("path");

const amStartParser = require("./lib/am-start-parser");
const { resolveUniqueName } = require("../lib/unique-name");
const { getClack } = require("../lib/clack");
const { createProgress } = require("../lib/progress");

module.exports = {
  id: "startup",
  description: "App launch time via adb shell am start -W (cold/warm start)",

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

    const last = configStore.get("startup");

    const packageName = await prompt.askText("Package name", last.packageName);
    if (!packageName) throw new Error("A package name is required.");

    const resolveSpinner = p.spinner();
    resolveSpinner.start("Resolving launcher activity");
    const component = await adb.resolveLauncherActivity(packageName);
    if (!component) {
      resolveSpinner.error("Could not resolve a launcher activity for this package");
      throw new Error(
        `Could not resolve a launcher activity for ${packageName}. Is it installed and does it declare a LAUNCHER activity?`
      );
    }
    resolveSpinner.stop(`Launch target: ${component}`);

    const startType = await prompt.askChoice("Start type:", [
      {
        id: "cold",
        description: "Force-stop the app before every launch (worst case, fresh process)",
      },
      {
        id: "warm",
        description: "Send the app to background (home) before every launch (process stays alive)",
      },
    ]);

    const runName = await prompt.askText("Run name", last.runName || `startup-${startType}`);
    const iterations = await prompt.askNumber("Number of iterations", 10);
    const settleMs = await prompt.askNumber("Settle time between iterations (ms)", 1500);

    // Nested under resultsRoot/startup/ so it stays organized side by side
    // with other categories (e.g. resultsRoot/gfx/..., resultsRoot/memory/...).
    const categoryResultsDir = path.join(resultsRoot, "startup");
    fs.mkdirSync(categoryResultsDir, { recursive: true });
    const uniqueName = resolveUniqueName(categoryResultsDir, runName);
    const runDir = path.join(categoryResultsDir, uniqueName);
    fs.mkdirSync(runDir, { recursive: true });

    p.note(
      `Package:  ${packageName}\nActivity: ${component}\nType:     ${startType} start\nRun dir:  ${runDir}`,
      "startup run"
    );

    // Raw `am start -W` output is per-iteration and rarely opened directly
    // (summary.csv already has the parsed numbers) — keep it out of the way
    // in its own subfolder, same convention as gfx/memory.
    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    const progress = await createProgress(iterations);
    for (let i = 1; i <= iterations; i++) {
      if (startType === "cold") {
        progress.advance(0, `iteration ${i}/${iterations}: force-stopping`);
        await adb.forceStop(packageName);
      } else {
        progress.advance(0, `iteration ${i}/${iterations}: backgrounding`);
        await adb.pressHome();
      }
      await adb.sleep(500);

      progress.advance(0, `iteration ${i}/${iterations}: launching`);
      const rawStart = await adb.startActivityTimed(component);
      fs.writeFileSync(path.join(rawDir, `am-start-raw-${i}.txt`), rawStart);

      const parsed = amStartParser.parseAmStart(rawStart, {
        timestamp: new Date().toISOString(),
        packageName,
      });

      const isNewCsv = !fs.existsSync(csvPath);
      fs.appendFileSync(
        csvPath,
        (isNewCsv ? amStartParser.csvHeaderRow().join(",") + "\n" : "") +
          amStartParser.csvDataRow(parsed) +
          "\n"
      );

      progress.advance(
        1,
        `iteration ${i}/${iterations}: ${parsed.launchState ?? "?"} totalTime=${parsed.totalTime ?? "N/A"}ms`
      );

      await adb.sleep(settleMs);
    }
    progress.stop(`Collected ${iterations} iteration${iterations === 1 ? "" : "s"}.`);

    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          startType,
          package: packageName,
          activity: component,
          iterations,
        },
        null,
        2
      )
    );

    configStore.save("startup", { packageName, runName });

    p.log.success(
      `Results saved to: ${runDir}\n(summary.csv, meta.json, raw/am-start-raw-*.txt)`
    );
  },
};

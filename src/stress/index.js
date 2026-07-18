"use strict";

const fs = require("fs");
const path = require("path");

const monkeyParser = require("./lib/monkey-parser");
const { resolveUniqueName } = require("../lib/unique-name");
const { getClack } = require("../lib/clack");
const { createProgress } = require("../lib/progress");

module.exports = {
  id: "stress",
  description: "Stress/crash testing via adb shell monkey (random input fuzzing)",

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

    const last = configStore.get("stress");

    const packageName = await prompt.askText("Package name", last.packageName);
    if (!packageName) throw new Error("A package name is required.");

    const runName = await prompt.askText("Run name", last.runName || "stress-run");
    const sessions = await prompt.askNumber("Number of monkey sessions to run", 5);
    const eventsPerSession = await prompt.askNumber("Random events per session", 500);
    const throttleMs = await prompt.askNumber("Delay between events (ms)", 50);

    // Nested under resultsRoot/stress/ so it stays organized side by side
    // with other categories (e.g. resultsRoot/gfx/..., resultsRoot/cpu/...).
    const categoryResultsDir = path.join(resultsRoot, "stress");
    fs.mkdirSync(categoryResultsDir, { recursive: true });
    const uniqueName = resolveUniqueName(categoryResultsDir, runName);
    const runDir = path.join(categoryResultsDir, uniqueName);
    fs.mkdirSync(runDir, { recursive: true });

    p.note(
      `Package:  ${packageName}\nSessions: ${sessions} x ${eventsPerSession} events\nRun dir:  ${runDir}`,
      "stress run"
    );

    // Raw monkey logs are per-session and rarely opened directly unless a
    // session crashed/ANR'd (the stack trace lives there) — keep them out
    // of the way in their own subfolder, same convention as gfx/memory.
    const rawDir = path.join(runDir, "raw");
    fs.mkdirSync(rawDir, { recursive: true });

    const csvPath = path.join(runDir, "summary.csv");

    let crashCount = 0;
    let anrCount = 0;

    const progress = await createProgress(sessions);
    for (let i = 1; i <= sessions; i++) {
      progress.advance(0, `session ${i}/${sessions}: force-stopping`);
      await adb.forceStop(packageName);
      await adb.sleep(500);

      progress.advance(0, `session ${i}/${sessions}: fuzzing (${eventsPerSession} events)`);
      const rawMonkey = await adb.runMonkey(packageName, {
        count: eventsPerSession,
        throttleMs,
      });
      fs.writeFileSync(path.join(rawDir, `monkey-raw-${i}.txt`), rawMonkey);

      const parsed = monkeyParser.parseMonkeyOutput(rawMonkey, {
        timestamp: new Date().toISOString(),
        packageName,
        requestedEvents: eventsPerSession,
      });
      if (parsed.crashed) crashCount += 1;
      if (parsed.anr) anrCount += 1;

      const isNewCsv = !fs.existsSync(csvPath);
      fs.appendFileSync(
        csvPath,
        (isNewCsv ? monkeyParser.csvHeaderRow().join(",") + "\n" : "") +
          monkeyParser.csvDataRow(parsed) +
          "\n"
      );

      const outcome = parsed.crashed ? "CRASHED" : parsed.anr ? "ANR" : "ok";
      progress.advance(
        1,
        `session ${i}/${sessions}: ${outcome} (${parsed.eventsInjected ?? "?"}/${eventsPerSession} events)`
      );
    }
    progress.stop(
      `Ran ${sessions} session${sessions === 1 ? "" : "s"}: ${crashCount} crash${
        crashCount === 1 ? "" : "es"
      }, ${anrCount} ANR${anrCount === 1 ? "" : "s"}.`
    );

    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          package: packageName,
          sessions,
          eventsPerSession,
          throttleMs,
          crashCount,
          anrCount,
        },
        null,
        2
      )
    );

    configStore.save("stress", { packageName, runName });

    if (crashCount > 0 || anrCount > 0) {
      p.log.warn(
        `${crashCount} crash(es) and ${anrCount} ANR(s) across ${sessions} sessions — check raw/monkey-raw-*.txt for stack traces.`
      );
    }

    p.log.success(`Results saved to: ${runDir}\n(summary.csv, meta.json, raw/monkey-raw-*.txt)`);
  },
};

"use strict";

// Boots an iOS Simulator or Android emulator by name — a device-lifecycle
// helper, not a diagnostic run, so it deliberately ignores the
// resultsRoot/configStore context every other category gets (nothing to
// save here). Ported from a project-specific script into a generic category
// so any project using mobile-doctor gets "start a device" for free.

const { execFile, spawn } = require("child_process");
const util = require("util");

const { getClack } = require("../lib/clack");

const execFileAsync = util.promisify(execFile);

// Execute a command and return stdout (trimmed). Returns null on failure.
async function execCommand(command, args = [], options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
    return String(stdout ?? "").trim();
  } catch {
    return null;
  }
}

async function getIOSSimulators(p) {
  try {
    const output = await execCommand("xcrun", ["simctl", "list", "devices", "--json"]);
    if (!output) return [];

    const data = JSON.parse(output);
    const simulators = [];

    for (const [runtime, devices] of Object.entries(data.devices)) {
      if (runtime.includes("iOS")) {
        for (const device of devices) {
          if (device.isAvailable) {
            simulators.push({
              name: device.name,
              udid: device.udid,
              runtime: runtime.replace("com.apple.CoreSimulator.SimRuntime.", "").replace(/-/g, " "),
              platform: "ios",
            });
          }
        }
      }
    }

    return simulators;
  } catch {
    p.log.warn("Could not fetch iOS simulators. Make sure Xcode is installed.");
    return [];
  }
}

async function getAndroidEmulators(p) {
  try {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!androidHome) {
      p.log.warn("ANDROID_HOME or ANDROID_SDK_ROOT not set.");
      return [];
    }

    const output = await execCommand(`${androidHome}/emulator/emulator`, ["-list-avds"]);
    if (!output) return [];

    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((name) => ({ name: name.trim(), platform: "android" }));
  } catch {
    p.log.warn("Could not fetch Android emulators. Make sure Android SDK is installed.");
    return [];
  }
}

async function startDevice(p, device) {
  const boot = p.spinner();
  boot.start(`Starting ${device.name}`);

  try {
    if (device.platform === "ios") {
      await execCommand("xcrun", ["simctl", "boot", device.udid]);
      await execCommand("open", ["-a", "Simulator"]);
      boot.stop(`iOS Simulator "${device.name}" started.`);
    } else if (device.platform === "android") {
      const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (!androidHome) {
        boot.error("ANDROID_HOME or ANDROID_SDK_ROOT not set.");
        throw new Error("ANDROID_HOME or ANDROID_SDK_ROOT not set.");
      }

      const emulatorProcess = spawn(
        `${androidHome}/emulator/emulator`,
        ["-avd", device.name, "-netdelay", "none", "-netspeed", "full"],
        { detached: true, stdio: "ignore" }
      );
      emulatorProcess.unref();

      boot.stop(`Android Emulator "${device.name}" is starting in the background.`);
      p.log.info("You can safely close this terminal — the emulator will keep running.");
    }
  } catch (error) {
    boot.error(`Failed to start device: ${error.message}`);
    throw error;
  }
}

module.exports = {
  id: "devices",
  description: "Boot an iOS Simulator or Android emulator (interactive picker)",

  async run({ prompt }) {
    const p = await getClack();

    const platform = await prompt.askChoice("Select platform:", [
      { id: "ios", description: "Simulators (via xcrun simctl)" },
      { id: "android", description: "Emulators (via $ANDROID_HOME/emulator)" },
    ]);

    const search = p.spinner();
    search.start(`Searching for available ${platform} devices`);
    const devices = platform === "ios" ? await getIOSSimulators(p) : await getAndroidEmulators(p);

    if (devices.length === 0) {
      const sdkName = platform === "ios" ? "Xcode" : "Android SDK";
      search.error(`No ${platform} devices found`);
      throw new Error(`No ${platform} devices found. Please install ${sdkName}.`);
    }
    search.stop(`Found ${devices.length} ${platform} device${devices.length === 1 ? "" : "s"}.`);

    // iOS simulators can share a name across runtimes (e.g. "iPhone 15" on
    // two SDKs) — key on udid there so the selection is unambiguous; Android
    // AVD names are already unique.
    const deviceId = await prompt.askChoice(
      "Select device:",
      devices.map((device) => ({
        id: device.udid || device.name,
        label: device.name,
        description: device.platform === "ios" ? device.runtime : undefined,
      }))
    );
    const selectedDevice = devices.find((device) => (device.udid || device.name) === deviceId);

    await startDevice(p, selectedDevice);
  },
};

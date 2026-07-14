"use strict";

// Boots an iOS Simulator or Android emulator by name — a device-lifecycle
// helper, not a diagnostic run, so it deliberately ignores the
// resultsRoot/configStore/log context every other category gets (nothing to
// save here). Ported from a project-specific script into a generic category
// so any project using mobile-doctor gets "start a device" for free.

const { execFile, spawn } = require("child_process");
const util = require("util");

const execFileAsync = util.promisify(execFile);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Execute a command and return stdout (trimmed). Returns null on failure.
async function execCommand(command, args = [], options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
    return String(stdout ?? "").trim();
  } catch (error) {
    console.log(error);
    return null;
  }
}

async function getIOSSimulators() {
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
    console.log(`${colors.yellow}Warning: Could not fetch iOS simulators. Make sure Xcode is installed.${colors.reset}`);
    return [];
  }
}

async function getAndroidEmulators() {
  try {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!androidHome) {
      console.log(`${colors.yellow}Warning: ANDROID_HOME or ANDROID_SDK_ROOT not set.${colors.reset}`);
      return [];
    }

    const output = await execCommand(`${androidHome}/emulator/emulator`, ["-list-avds"]);
    if (!output) return [];

    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((name) => ({ name: name.trim(), platform: "android" }));
  } catch {
    console.log(`${colors.yellow}Warning: Could not fetch Android emulators. Make sure Android SDK is installed.${colors.reset}`);
    return [];
  }
}

const platformOptions = [
  `${colors.blue}📱 iOS${colors.reset} (Simulators)`,
  `${colors.green}🤖 Android${colors.reset} (Emulators)`,
];

// Interactive arrow-key selection (raw stdin mode) — deliberately not using
// src/lib/prompt.js's line-based askChoice, since this needs live
// highlighting as the user moves the selection, not a numbered list.
function createInteractiveSelection(options, title) {
  return new Promise((resolve) => {
    let selectedIndex = 0;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function render() {
      process.stdout.write("\x1B[2J\x1B[0f");

      console.log(`${colors.bright}${colors.cyan}mobile-doctor — Device Manager${colors.reset}\n`);
      console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}\n`);

      options.forEach((option, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${colors.bright}${colors.green}▶ ` : `  `;
        const suffix = isSelected ? colors.reset : "";
        const bgColor = isSelected ? "\x1b[100m" : "";

        if (typeof option !== "string" && option.platform) {
          const displayText = option.platform === "ios" ? `${option.name} (${option.runtime})` : option.name;
          console.log(`${prefix}${bgColor}${displayText}${suffix}${colors.reset}`);
        } else {
          console.log(`${prefix}${bgColor}${String(option)}${suffix}${colors.reset}`);
        }
      });

      console.log(`\n${colors.yellow}Use ↑↓ arrow keys to navigate, Enter to select, ESC or 'q' to quit${colors.reset}`);
    }

    function onKeyPress(key) {
      switch (key) {
        case "[A":
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
          render();
          break;

        case "[B":
          selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
          render();
          break;

        case "\r":
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onKeyPress);
          resolve(selectedIndex);
          break;

        case "":
        case "q":
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onKeyPress);
          console.log(`\n${colors.yellow}Goodbye! 👋${colors.reset}`);
          process.exit(0);
      }
    }

    process.stdin.on("data", onKeyPress);
    render();
  });
}

async function startDevice(device) {
  console.log(`\n${colors.bright}${colors.magenta}🚀 Starting ${device.name}...${colors.reset}`);

  try {
    if (device.platform === "ios") {
      await execCommand("xcrun", ["simctl", "boot", device.udid]);
      await execCommand("open", ["-a", "Simulator"]);
      console.log(`${colors.green}✅ iOS Simulator "${device.name}" started successfully!${colors.reset}`);
    } else if (device.platform === "android") {
      const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (!androidHome) {
        console.log(`${colors.yellow}Warning: ANDROID_HOME or ANDROID_SDK_ROOT not set.${colors.reset}`);
        process.exit(1);
      }

      const emulatorProcess = spawn(
        `${androidHome}/emulator/emulator`,
        ["-avd", device.name, "-netdelay", "none", "-netspeed", "full"],
        { detached: true, stdio: "ignore" }
      );
      emulatorProcess.unref();

      console.log(`${colors.green}✅ Android Emulator "${device.name}" is starting in background...${colors.reset}`);
      console.log(`${colors.cyan}💡 You can now safely close this terminal - the emulator will continue running.${colors.reset}`);
    }
  } catch (error) {
    console.error(`${colors.red}❌ Failed to start device: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function runDeviceManager() {
  const platformIndex = await createInteractiveSelection(platformOptions, "📱 Select Platform");
  const selectedPlatform = platformIndex === 0 ? "ios" : "android";

  process.stdout.write("\x1B[2J\x1B[0f");
  console.log(`${colors.bright}${colors.cyan}mobile-doctor — Device Manager${colors.reset}\n`);
  console.log(`${colors.yellow}Searching for available ${selectedPlatform.toUpperCase()} devices...${colors.reset}`);

  const devices = selectedPlatform === "ios" ? await getIOSSimulators() : await getAndroidEmulators();

  if (devices.length === 0) {
    const sdkName = selectedPlatform === "ios" ? "Xcode" : "Android SDK";
    console.log(`${colors.red}No ${selectedPlatform} devices found. Please install ${sdkName}.${colors.reset}`);
    process.exit(1);
  }

  const platformName = selectedPlatform === "ios" ? "iOS Simulators" : "Android Emulators";
  const platformIcon = selectedPlatform === "ios" ? "📱" : "🤖";

  const deviceIndex = await createInteractiveSelection(devices, `${platformIcon} Select ${platformName}`);
  const selectedDevice = devices[deviceIndex];

  process.stdout.write("\x1B[2J\x1B[0f");
  await startDevice(selectedDevice);
}

module.exports = {
  id: "devices",
  description: "Boot an iOS Simulator or Android emulator (interactive picker)",
  run: runDeviceManager,
};

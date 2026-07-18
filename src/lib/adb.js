"use strict";

// Thin adb wrapper, shared across every diagnostic category. No
// project-specific assumptions — package name and device interaction
// points are always passed in by the caller.

const { execFile } = require("child_process");
const util = require("util");

const execFileP = util.promisify(execFile);
const MAX_BUFFER = 1024 * 1024 * 20;

async function checkAvailable() {
  try {
    await execFileP("adb", ["version"]);
  } catch {
    throw new Error(
      "adb not found. Install Android platform-tools and ensure adb is on PATH."
    );
  }
}

async function hasConnectedDevice() {
  const { stdout } = await execFileP("adb", ["devices"]);
  return stdout
    .split("\n")
    .slice(1)
    .some((line) => /\tdevice$/.test(line.trim()));
}

async function getScreenSize() {
  const { stdout } = await execFileP("adb", ["shell", "wm", "size"]);
  const match = stdout.match(/(\d+)x(\d+)/);
  if (!match) throw new Error(`Could not parse screen size from: ${stdout}`);
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

async function shell(args) {
  const { stdout } = await execFileP("adb", ["shell", ...args], {
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

async function resetGfxInfo(pkg) {
  await execFileP("adb", ["shell", "dumpsys", "gfxinfo", pkg, "reset"]);
}

async function dumpGfxInfo(pkg) {
  return shell(["dumpsys", "gfxinfo", pkg]);
}

async function dumpFrameStats(pkg) {
  return shell(["dumpsys", "gfxinfo", pkg, "framestats"]);
}

async function dumpMemInfo(pkg) {
  return shell(["dumpsys", "meminfo", pkg]);
}

async function forceStop(pkg) {
  await execFileP("adb", ["shell", "am", "force-stop", pkg]);
}

async function pressHome() {
  await execFileP("adb", ["shell", "input", "keyevent", "KEYCODE_HOME"]);
}

// Resolves a package's launcher activity to a "pkg/.Activity" component,
// since `am start -W` needs an explicit component rather than just a
// package name.
async function resolveLauncherActivity(pkg) {
  const { stdout } = await execFileP("adb", [
    "shell",
    "cmd",
    "package",
    "resolve-activity",
    "--brief",
    pkg,
  ]);
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line && line.includes("/") ? line : null;
}

async function startActivityTimed(component) {
  return shell(["am", "start", "-W", "-n", component]);
}

async function dumpCpuInfo() {
  return shell(["dumpsys", "cpuinfo"]);
}

async function dumpBattery() {
  return shell(["dumpsys", "battery"]);
}

async function resetBatteryStats() {
  await execFileP("adb", ["shell", "dumpsys", "batterystats", "--reset"]);
}

async function dumpBatteryStats(pkg) {
  return shell(["dumpsys", "batterystats", "--charged", pkg]);
}

// Fuzzes the app with random input events via monkey. Monkey exits non-zero
// on a crash/ANR, but the useful diagnostic output (stack trace, "// CRASH")
// is still on stdout/stderr — promisified execFile attaches both to the
// rejection, so a non-zero exit isn't treated as "no output to parse".
async function runMonkey(pkg, { count = 500, throttleMs = 50, seed } = {}) {
  const args = ["shell", "monkey", "-p", pkg, "--throttle", String(throttleMs), "-v"];
  if (seed !== undefined && seed !== null && seed !== "") {
    args.push("-s", String(seed));
  }
  args.push(String(count));

  try {
    const { stdout, stderr } = await execFileP("adb", args, { maxBuffer: MAX_BUFFER });
    return `${stdout}\n${stderr}`;
  } catch (error) {
    return `${error.stdout || ""}\n${error.stderr || ""}`;
  }
}

async function swipe(x1, y1, x2, y2, durationMs) {
  await execFileP("adb", [
    "shell",
    "input",
    "swipe",
    String(x1),
    String(y1),
    String(x2),
    String(y2),
    String(durationMs),
  ]);
}

async function tap(x, y) {
  await execFileP("adb", ["shell", "input", "tap", String(x), String(y)]);
}

async function pressBack() {
  await execFileP("adb", ["shell", "input", "keyevent", "KEYCODE_BACK"]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  checkAvailable,
  hasConnectedDevice,
  getScreenSize,
  shell,
  resetGfxInfo,
  dumpGfxInfo,
  dumpFrameStats,
  dumpMemInfo,
  forceStop,
  pressHome,
  resolveLauncherActivity,
  startActivityTimed,
  dumpCpuInfo,
  dumpBattery,
  resetBatteryStats,
  dumpBatteryStats,
  runMonkey,
  swipe,
  tap,
  pressBack,
  sleep,
};

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
  swipe,
  tap,
  sleep,
};

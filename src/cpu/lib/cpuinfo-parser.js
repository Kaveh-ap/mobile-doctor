"use strict";

// `dumpsys cpuinfo` lines look like:
//   9.7% 1234/com.example.app: 5.6% user + 4.1% kernel
//   53% TOTAL: 30% user + 20% kernel + 3% iowait
// The window is a trailing few seconds ending "now" — sampling right after
// an interaction gives a reasonable read on that interaction's CPU cost,
// same approximation gfxinfo/meminfo already rely on.
function buildAppCpuRegex(pkg) {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*([\\d.]+)%\\s+\\d+/${escaped}:`, "m");
}

const TOTAL_REGEX = /^\s*([\d.]+)%\s+TOTAL:/m;

function parseCpuInfo(rawOutput, { timestamp, packageName }) {
  const appMatch = rawOutput.match(buildAppCpuRegex(packageName));
  const totalMatch = rawOutput.match(TOTAL_REGEX);
  return {
    timestamp,
    package: packageName,
    appCpuPercent: appMatch ? parseFloat(appMatch[1]) : null,
    totalCpuPercent: totalMatch ? parseFloat(totalMatch[1]) : null,
  };
}

function csvHeaderRow() {
  return ["Timestamp", "App CPU %", "Total CPU %"];
}

function escapeCSVField(field) {
  if (typeof field === "string" && /[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvDataRow(data) {
  const row = [data.timestamp, data.appCpuPercent ?? "", data.totalCpuPercent ?? ""];
  return row.map(escapeCSVField).join(",");
}

module.exports = { parseCpuInfo, csvHeaderRow, csvDataRow };

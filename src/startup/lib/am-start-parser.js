"use strict";

const METRICS = [
  { key: "thisTime", label: "This Time (ms)", regex: /ThisTime:\s*(\d+)/ },
  { key: "totalTime", label: "Total Time (ms)", regex: /TotalTime:\s*(\d+)/ },
  { key: "waitTime", label: "Wait Time (ms)", regex: /WaitTime:\s*(\d+)/ },
];

function parseAmStart(rawOutput, { timestamp, packageName }) {
  const result = { timestamp, package: packageName };
  METRICS.forEach((metric) => {
    const match = rawOutput.match(metric.regex);
    result[metric.key] = match ? parseInt(match[1], 10) : null;
  });
  const launchStateMatch = rawOutput.match(/LaunchState:\s*(\S+)/);
  result.launchState = launchStateMatch ? launchStateMatch[1] : null;
  return result;
}

function csvHeaderRow() {
  return ["Timestamp", "Launch State", ...METRICS.map((m) => m.label)];
}

function escapeCSVField(field) {
  if (typeof field === "string" && /[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvDataRow(data) {
  const row = [data.timestamp, data.launchState ?? "", ...METRICS.map((m) => data[m.key] ?? "")];
  return row.map(escapeCSVField).join(",");
}

module.exports = { METRICS, parseAmStart, csvHeaderRow, csvDataRow };

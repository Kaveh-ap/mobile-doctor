"use strict";

const METRICS = [
  { key: "pss", label: "Total PSS (KB)", regex: /TOTAL\s+PSS:\s*([\d,]+)/ },
  { key: "rss", label: "Total RSS (KB)", regex: /TOTAL\s+RSS:\s*([\d,]+)/ },
  { key: "nativeHeap", label: "Native Heap (KB)", regex: /Native Heap\s+(\d+)/ },
  { key: "dalvikHeap", label: "Dalvik Heap (KB)", regex: /Dalvik Heap\s+(\d+)/ },
  { key: "views", label: "Views", regex: /Views:\s*([\d,]+)/ },
  { key: "activities", label: "Activities", regex: /Activities:\s*(\d+)/ },
  { key: "appContexts", label: "App Contexts", regex: /AppContexts:\s*(\d+)/ },
];

function parseMemInfo(rawOutput, { timestamp, packageName }) {
  const result = { timestamp, package: packageName };
  METRICS.forEach((metric) => {
    const match = rawOutput.match(metric.regex);
    if (match) {
      result[metric.key] = parseInt(match[1].replace(/,/g, ""), 10);
    } else {
      result[metric.key] = null;
    }
  });
  return result;
}

function csvHeaderRow() {
  return ["Timestamp", ...METRICS.map((m) => m.label)];
}

function escapeCSVField(field) {
  if (typeof field === "string" && /[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvDataRow(data) {
  const row = [data.timestamp, ...METRICS.map((m) => data[m.key] ?? "")];
  return row.map(escapeCSVField).join(",");
}

module.exports = { METRICS, parseMemInfo, csvHeaderRow, csvDataRow };

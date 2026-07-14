"use strict";

const METRICS = [
  { key: "totalFrames", label: "Total Frames", regex: /Total frames rendered:\s*([\d,]+)/ },
  { key: "jankyFrames", label: "Janky Frames", regex: /Janky frames:\s*([\d,]+)/ },
  { key: "jankyPercent", label: "Janky %", regex: /Janky frames:\s*[\d,]+\s*\(([\d.]+)%\)/, float: true },
  { key: "jankyFramesLegacy", label: "Janky Frames (legacy)", regex: /Janky frames \(legacy\):\s*([\d,]+)/ },
  { key: "jankyPercentLegacy", label: "Janky % (legacy)", regex: /Janky frames \(legacy\):\s*[\d,]+\s*\(([\d.]+)%\)/, float: true },
  { key: "p50", label: "50th percentile (ms)", regex: /50th percentile:\s*(\d+)ms/ },
  { key: "p90", label: "90th percentile (ms)", regex: /90th percentile:\s*(\d+)ms/ },
  { key: "p95", label: "95th percentile (ms)", regex: /95th percentile:\s*(\d+)ms/ },
  { key: "p99", label: "99th percentile (ms)", regex: /99th percentile:\s*(\d+)ms/ },
  { key: "missedVsync", label: "Missed Vsync", regex: /Number Missed Vsync:\s*(\d+)/ },
  { key: "highInputLatency", label: "High Input Latency", regex: /Number High input latency:\s*(\d+)/ },
  { key: "slowUiThread", label: "Slow UI Thread", regex: /Number Slow UI thread:\s*(\d+)/ },
  { key: "slowBitmapUploads", label: "Slow Bitmap Uploads", regex: /Number Slow bitmap uploads:\s*(\d+)/ },
  { key: "slowDrawCommands", label: "Slow Issue Draw Commands", regex: /Number Slow issue draw commands:\s*(\d+)/ },
  { key: "deadlineMissed", label: "Frame Deadline Missed", regex: /Number Frame deadline missed:\s*(\d+)/ },
  { key: "deadlineMissedLegacy", label: "Frame Deadline Missed (legacy)", regex: /Number Frame deadline missed \(legacy\):\s*(\d+)/ },
  { key: "gpuP50", label: "50th GPU percentile (ms)", regex: /50th gpu percentile:\s*(\d+)ms/ },
  { key: "gpuP90", label: "90th GPU percentile (ms)", regex: /90th gpu percentile:\s*(\d+)ms/ },
  { key: "gpuP95", label: "95th GPU percentile (ms)", regex: /95th gpu percentile:\s*(\d+)ms/ },
  { key: "gpuP99", label: "99th GPU percentile (ms)", regex: /99th gpu percentile:\s*(\d+)ms/ },
];

function parseGfxInfo(rawOutput, { timestamp, packageName }) {
  const result = { timestamp, package: packageName };
  METRICS.forEach((metric) => {
    const match = rawOutput.match(metric.regex);
    if (match) {
      const raw = match[1].replace(/,/g, "");
      result[metric.key] = metric.float ? parseFloat(raw) : parseInt(raw, 10);
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

module.exports = { METRICS, parseGfxInfo, csvHeaderRow, csvDataRow };

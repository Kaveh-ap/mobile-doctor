"use strict";

// `dumpsys battery` reports instantaneous device state — level/temperature
// are reliable across Android versions, unlike the "Estimated power use"
// section of `dumpsys batterystats` (format varies a lot and needs
// --reset/--charged bookkeeping to mean anything). Level moves slowly, so
// this is really only meaningful over many iterations with the device
// unplugged; temperature is the more responsive signal of the two.
// Anchored to the start of the line (ignoring leading whitespace) so e.g.
// "voltage:" doesn't match inside "Max charging voltage:".
const METRICS = [
  { key: "level", label: "Battery Level (%)", regex: /^\s*level:\s*(\d+)/m },
  {
    key: "temperature",
    label: "Temperature (C)",
    regex: /^\s*temperature:\s*(\d+)/m,
    transform: (raw) => raw / 10,
  },
  { key: "voltage", label: "Voltage (mV)", regex: /^\s*voltage:\s*(\d+)/m },
];

function parseBattery(rawOutput, { timestamp }) {
  const result = { timestamp };
  METRICS.forEach((metric) => {
    const match = rawOutput.match(metric.regex);
    if (!match) {
      result[metric.key] = null;
      return;
    }
    const raw = parseInt(match[1], 10);
    result[metric.key] = metric.transform ? metric.transform(raw) : raw;
  });
  result.acPowered = /AC powered:\s*true/i.test(rawOutput);
  result.usbPowered = /USB powered:\s*true/i.test(rawOutput);
  return result;
}

function csvHeaderRow() {
  return ["Timestamp", "Charging", ...METRICS.map((m) => m.label)];
}

function escapeCSVField(field) {
  if (typeof field === "string" && /[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvDataRow(data) {
  const charging = data.acPowered || data.usbPowered ? "yes" : "no";
  const row = [data.timestamp, charging, ...METRICS.map((m) => data[m.key] ?? "")];
  return row.map(escapeCSVField).join(",");
}

module.exports = { METRICS, parseBattery, csvHeaderRow, csvDataRow };

"use strict";

// `adb shell monkey -v` prints a running log of injected events and exits
// non-zero with a "// CRASH" or "// NOT RESPONDING" block (plus a stack
// trace) if the app dies or ANRs mid-run. On a clean run it prints
// "Events injected: N" and "// Monkey finished" near the end.
function parseMonkeyOutput(rawOutput, { timestamp, packageName, requestedEvents }) {
  const crashed = /\/\/\s*CRASH/.test(rawOutput);
  const anr = /\/\/\s*NOT RESPONDING/.test(rawOutput);
  const finished = /Monkey finished/.test(rawOutput);

  const eventsMatch = rawOutput.match(/Events injected:\s*(\d+)/);
  const eventsInjected = eventsMatch ? parseInt(eventsMatch[1], 10) : null;

  let failureReason = null;
  if (crashed) {
    const shortMsgMatch = rawOutput.match(/\/\/\s*Short Msg:\s*(.+)/);
    failureReason = shortMsgMatch ? shortMsgMatch[1].trim() : "crash (no short message captured)";
  } else if (anr) {
    failureReason = "ANR (app not responding)";
  }

  return {
    timestamp,
    package: packageName,
    requestedEvents,
    eventsInjected,
    crashed,
    anr,
    finished,
    failureReason,
  };
}

function csvHeaderRow() {
  return ["Timestamp", "Requested Events", "Events Injected", "Crashed", "ANR", "Failure Reason"];
}

function escapeCSVField(field) {
  if (typeof field === "string" && /[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvDataRow(data) {
  const row = [
    data.timestamp,
    data.requestedEvents ?? "",
    data.eventsInjected ?? "",
    data.crashed ? "yes" : "no",
    data.anr ? "yes" : "no",
    data.failureReason ?? "",
  ];
  return row.map(escapeCSVField).join(",");
}

module.exports = { parseMonkeyOutput, csvHeaderRow, csvDataRow };

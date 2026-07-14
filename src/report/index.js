"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { resolveUniqueName } = require("../lib/unique-name");

// Any category that produces run folders with a summary.csv (gfx, memory,
// ...) can be reported on, as long as it ships its own src/<category>/
// template.html — nothing else to wire up here as categories get added.
const REPORTABLE_CATEGORIES = [
  { id: "gfx", description: "GFX/jank runs (dumpsys gfxinfo)" },
  { id: "memory", description: "Memory runs (dumpsys meminfo)" },
];

// Lists run folders (anything under resultsRoot/<category>/ with a
// summary.csv, excluding the reports/ output folder itself) so the picker
// always reflects whatever's actually on disk — no separate index to keep
// in sync.
function listRuns(categoryDir) {
  if (!fs.existsSync(categoryDir)) return [];

  return fs
    .readdirSync(categoryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "reports")
    .filter((entry) => fs.existsSync(path.join(categoryDir, entry.name, "summary.csv")))
    .map((entry) => {
      const runDir = path.join(categoryDir, entry.name);
      let iterations;
      try {
        iterations = JSON.parse(fs.readFileSync(path.join(runDir, "meta.json"), "utf8")).iterations;
      } catch {
        iterations = undefined;
      }
      return { name: entry.name, dir: runDir, iterations };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function openInBrowser(filePath) {
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", filePath], () => {});
  } else if (process.platform === "darwin") {
    execFile("open", [filePath], () => {});
  } else {
    execFile("xdg-open", [filePath], () => {});
  }
}

module.exports = {
  id: "report",
  description: "Build an HTML comparison report from one or more gfx/memory runs",

  async run({ prompt, resultsRoot, log }) {
    const available = REPORTABLE_CATEGORIES.filter(
      (c) => listRuns(path.join(resultsRoot, c.id)).length > 0
    );

    if (available.length === 0) {
      throw new Error(
        `No runs with a summary.csv found under ${resultsRoot}. Run "gfx" or "memory" first.`
      );
    }

    const categoryId =
      available.length === 1
        ? available[0].id
        : await prompt.askChoice("Select which category to report on:", available);

    const categoryDir = path.join(resultsRoot, categoryId);
    const runs = listRuns(categoryDir);

    console.log(`Available ${categoryId} runs:`);
    runs.forEach((run, i) => {
      const suffix = run.iterations ? ` (${run.iterations} iteration${run.iterations === 1 ? "" : "s"})` : "";
      console.log(`  ${i + 1}) ${run.name}${suffix}`);
    });

    const selection = await prompt.askText(
      `Select run(s) to include, comma-separated (e.g. 1,3)`,
      runs.length === 1 ? "1" : runs.map((_, i) => i + 1).join(",")
    );

    const indices = [...new Set(selection.split(",").map((s) => Number(s.trim()) - 1))].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < runs.length
    );

    if (indices.length === 0) {
      throw new Error("No valid runs selected.");
    }

    const selectedRuns = indices.map((i) => runs[i]);

    const datasets = selectedRuns.map((run) => ({
      name: run.name,
      csv: fs.readFileSync(path.join(run.dir, "summary.csv"), "utf8"),
    }));

    const template = fs.readFileSync(path.join(__dirname, "..", categoryId, "template.html"), "utf8");
    const rendered = template.replace(
      "const datasets = [];",
      `const datasets = ${JSON.stringify(datasets)};`
    );

    const reportsDir = path.join(categoryDir, "reports");
    fs.mkdirSync(reportsDir, { recursive: true });

    const reportName = await prompt.askText("Report file name", selectedRuns.map((r) => r.name).join("-vs-"));
    const uniqueName = resolveUniqueName(reportsDir, reportName, ".html");
    const reportPath = path.join(reportsDir, `${uniqueName}.html`);

    fs.writeFileSync(reportPath, rendered);

    log(`Report written to: ${reportPath}`);
    openInBrowser(reportPath);
    console.log(`\nDone. Opening report in your default browser.`);
  },
};

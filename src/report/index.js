"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { resolveUniqueName } = require("../lib/unique-name");
const { getClack } = require("../lib/clack");

// Any category that produces run folders with a summary.csv (gfx, memory,
// ...) can be reported on, as long as it ships its own src/<category>/
// template.html — nothing else to wire up here as categories get added.
// label/icon feed the navbar every generated report ships, so you can jump
// from a gfx report straight to the latest cpu/battery/... one.
const REPORTABLE_CATEGORIES = [
  { id: "gfx", label: "GFX", icon: "🃏", description: "GFX/jank runs (dumpsys gfxinfo)" },
  { id: "memory", label: "Memory", icon: "🧠", description: "Memory runs (dumpsys meminfo)" },
  { id: "startup", label: "Startup", icon: "🚀", description: "Startup runs (am start -W)" },
  { id: "cpu", label: "CPU", icon: "🖥️", description: "CPU runs (dumpsys cpuinfo)" },
  { id: "battery", label: "Battery", icon: "🔋", description: "Battery runs (dumpsys battery)" },
  { id: "stress", label: "Stress", icon: "🐒", description: "Stress/crash runs (monkey)" },
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

// Most recently generated report for a category, so the navbar can link to
// something that actually exists — null if that category has none yet.
function findLatestReportFile(categoryDir) {
  const reportsDir = path.join(categoryDir, "reports");
  if (!fs.existsSync(reportsDir)) return null;

  const newest = fs
    .readdirSync(reportsDir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(reportsDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

  return newest || null;
}

// Browsers want forward slashes in an href even on Windows.
function toWebRelative(fromDir, toFile) {
  return path.relative(fromDir, toFile).split(path.sep).join("/");
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
  description: "Build an HTML comparison report from one or more gfx/memory/startup/cpu/battery/stress runs",

  async run({ prompt, resultsRoot, log }) {
    const p = await getClack();

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
        : await prompt.askChoice(
            "Select which category to report on:",
            available.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}`, description: c.description }))
          );

    const categoryDir = path.join(resultsRoot, categoryId);
    const runs = listRuns(categoryDir);

    const selectedNames = await p.multiselect({
      message: `Select ${categoryId} run(s) to include:`,
      options: runs.map((run) => ({
        value: run.name,
        label: run.name,
        hint: run.iterations ? `${run.iterations} iteration${run.iterations === 1 ? "" : "s"}` : undefined,
      })),
      initialValues: runs.map((run) => run.name),
      required: true,
    });
    if (p.isCancel(selectedNames)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const selectedRuns = runs.filter((run) => selectedNames.includes(run.name));

    const datasets = selectedRuns.map((run) => ({
      name: run.name,
      csv: fs.readFileSync(path.join(run.dir, "summary.csv"), "utf8"),
    }));

    const reportsDir = path.join(categoryDir, "reports");
    fs.mkdirSync(reportsDir, { recursive: true });

    const reportName = await prompt.askText("Report file name", selectedRuns.map((r) => r.name).join("-vs-"));
    const uniqueName = resolveUniqueName(reportsDir, reportName, ".html");
    const reportPath = path.join(reportsDir, `${uniqueName}.html`);

    // One navbar entry per category, linking to its most recently generated
    // report — except the category being generated right now, which links
    // to the file about to be written (reportPath), and is marked active.
    const navLinks = REPORTABLE_CATEGORIES.map((cat) => {
      const isCurrent = cat.id === categoryId;
      const targetFile = isCurrent ? reportPath : findLatestReportFile(path.join(resultsRoot, cat.id));
      return {
        id: cat.id,
        label: cat.label,
        icon: cat.icon,
        active: isCurrent,
        href: targetFile ? toWebRelative(reportsDir, targetFile) : null,
      };
    });

    const template = fs.readFileSync(path.join(__dirname, "..", categoryId, "template.html"), "utf8");
    const rendered = template
      .replace("const datasets = [];", `const datasets = ${JSON.stringify(datasets)};`)
      .replace("const navLinks = [];", `const navLinks = ${JSON.stringify(navLinks)};`);

    fs.writeFileSync(reportPath, rendered);

    log(`Report written to: ${reportPath}`);
    openInBrowser(reportPath);
    p.log.success("Opening report in your default browser.");
  },
};

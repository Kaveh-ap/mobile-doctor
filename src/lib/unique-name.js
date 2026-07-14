"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Resolve a name that doesn't yet collide with anything in `dir`: tries
 * `name`, then `name-1`, `name-2`, ... until one is free. Generic — works
 * for a result directory name or a file name (pass the file's extension,
 * e.g. ".csv", so the check looks at "name.csv" rather than a bare "name").
 */
function resolveUniqueName(dir, name, extension = "") {
  let candidate = name;
  let suffix = 0;
  while (fs.existsSync(path.join(dir, candidate + extension))) {
    suffix += 1;
    candidate = `${name}-${suffix}`;
  }
  return candidate;
}

module.exports = { resolveUniqueName };

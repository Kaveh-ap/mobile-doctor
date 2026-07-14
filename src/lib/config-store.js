"use strict";

const fs = require("fs");

// Persists last-used answers (e.g. package name) per category, so repeat
// runs don't require re-typing the same values every time.
function makeConfigStore(configFilePath) {
  function loadAll() {
    try {
      return JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    } catch {
      return {};
    }
  }

  function get(categoryId) {
    return loadAll()[categoryId] || {};
  }

  function save(categoryId, partial) {
    const all = loadAll();
    all[categoryId] = { ...all[categoryId], ...partial };
    fs.writeFileSync(configFilePath, JSON.stringify(all, null, 2));
  }

  return { get, save };
}

module.exports = { makeConfigStore };

"use strict";

const { getClack } = require("./clack");

function bail(p) {
  p.cancel("Cancelled.");
  process.exit(0);
}

async function askText(label, fallback) {
  const p = await getClack();
  const result = await p.text({
    message: label,
    placeholder: fallback !== undefined ? String(fallback) : undefined,
    defaultValue: fallback !== undefined ? String(fallback) : undefined,
  });
  if (p.isCancel(result)) bail(p);
  return result || fallback;
}

async function askNumber(label, fallback) {
  const p = await getClack();
  const result = await p.text({
    message: label,
    placeholder: String(fallback),
    defaultValue: String(fallback),
    validate(value) {
      if (!value) return undefined;
      return Number.isFinite(Number(value)) ? undefined : "Enter a valid number.";
    },
  });
  if (p.isCancel(result)) bail(p);
  const parsed = Number(result);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {string} label
 * @param {Array<{ id: string, label?: string, description?: string }>} options
 * @returns {Promise<string>} the chosen option's id
 */
async function askChoice(label, options) {
  const p = await getClack();
  const result = await p.select({
    message: label,
    options: options.map((option) => ({
      value: option.id,
      label: option.label || option.id,
      hint: option.description,
    })),
  });
  if (p.isCancel(result)) bail(p);
  return result;
}

module.exports = { askText, askNumber, askChoice };

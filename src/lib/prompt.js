"use strict";

const readline = require("readline");

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askText(label, fallback) {
  const suffix = fallback !== undefined ? ` [${fallback}]` : "";
  const answer = await ask(`${label}${suffix}: `);
  return answer || fallback;
}

async function askNumber(label, fallback) {
  const answer = await askText(label, String(fallback));
  const parsed = Number(answer);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {string} label
 * @param {Array<{ id: string, description: string }>} options
 * @returns {Promise<string>} the chosen option's id
 */
async function askChoice(label, options) {
  console.log(label);
  options.forEach((option, i) => {
    console.log(`  ${i + 1}) ${option.id} — ${option.description}`);
  });
  const answer = await askText(`Choice (1-${options.length})`, "1");
  const index = Number(answer) - 1;
  return options[index] ? options[index].id : options[0].id;
}

module.exports = { askText, askNumber, askChoice };

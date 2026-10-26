import { readFile } from "node:fs/promises";
import { parseCityMinutes } from "../src/minutes/cityMinutes.js";

// Usage: node tools/inspect-votes.js 2026-06-16
const date = process.argv[2] ?? "2026-06-16";
const text = await readFile(`data/text/${date}_bowling-green-city-commission_minutes.txt`, "utf8");
const { votes, procedural, rollCallCount } = parseCityMinutes(text);

const line = (v) => {
  const nays = v.nays.length ? `  NO: ${v.nays.join(", ")}` : "";
  return `${v.yeas.length}–${v.nays.length} ${v.outcome ?? "?"}${nays}`;
};

console.log(`=== Item votes (${Object.keys(votes).length}) ===`);
for (const [key, v] of Object.entries(votes)) console.log(`${key}: ${line(v)}`);

console.log(`\n=== Procedural votes (${procedural.length}) ===`);
for (const v of procedural) console.log(`${v.description}: ${line(v)}`);

console.log(`\nROLL CALL lines in text: ${rollCallCount}`);
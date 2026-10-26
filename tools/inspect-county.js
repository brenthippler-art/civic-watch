import { readFile, readdir } from "node:fs/promises";
import { parseCountyMinutes } from "../src/minutes/countyMinutes.js";

// Usage: node tools/inspect-county.js 2026-07-09
const date = process.argv[2] ?? "2026-07-09";

// Find the cached minutes file for that date (regular or special-called).
const files = await readdir("data/text");
const file = files.find((f) => f.startsWith(`${date}_warren-county-fiscal-court_minutes`));
if (!file) {
  console.log(`No county minutes file for ${date}. Files available:`);
  console.log(files.filter((f) => f.includes("warren-county-fiscal-court_minutes")).join("\n"));
  process.exit(1);
}

const text = await readFile(`data/text/${file}`, "utf8");
const { votes, procedural, unmatched, present, rollCallCount } = parseCountyMinutes(text);

console.log(`=== ${file} ===`);
console.log(`Present (${present.length}): ${present.join(", ")}`);
console.log(`Roll calls: ${rollCallCount}, read: ${Object.keys(votes).length} item + ${procedural.length} procedural`);
for (const p of procedural) console.log(`  Procedural: ${p.yeaCount}–${p.nayCount} ${p.description.slice(0, 100)}`);

console.log(`\n=== Votes with any "no" ===`);
for (const [key, v] of Object.entries(votes)) {
  if (!v.nayCount) continue;
  console.log(`\n${key}: ${v.yeaCount}–${v.nayCount}`);
  console.log(`  Recorded as: "${v.tally}"`);
  console.log(`  No voters found: ${v.nays.length ? v.nays.join(", ") : "(none found)"}`);
  console.log(`  Yes voters: ${v.yeas ? v.yeas.join(", ") : "(couldn't work out)"}`);
  console.log(`  Item: ${v.description.slice(0, 120)}`);
}

if (unmatched.length) {
  console.log(`\n=== Roll calls the parser couldn't read (${unmatched.length}) ===`);
  unmatched.forEach((snippet, i) => console.log(`\n--- ${i + 1} ---\n${snippet}`));
}
// Usage: node --env-file=.env tools/test-alert.js county   (or: city)
import { readFile } from "node:fs/promises";
import { createBroadcast, emailFor } from "../src/alerts.js";

const which = process.argv[2] === "city" ? "City" : "County";
const { meetings } = JSON.parse(await readFile("public/data/meetings.json", "utf8"));
const meeting = meetings.find((m) => m.body.includes(which)); // meetings are newest first

if (!meeting) {
  console.error(`No ${which} meeting found.`);
  process.exit(1);
}

const email = emailFor(meeting);
await createBroadcast(email, { send: false }); // draft only, never sent
console.log(`Saved a draft in Kit: "${email.subject}"`);
console.log("Open Kit, then Broadcasts, to preview it. Delete the draft when you're done.");
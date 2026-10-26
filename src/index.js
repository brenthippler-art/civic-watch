import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBgCityDocuments } from "./sources/bgCity.js";
import { getWarrenCountyDocuments } from "./sources/warrenCounty.js";
import { getCountyVideos } from "./sources/countyVideos.js";
import { getDocumentText } from "./pdfText.js";
import { splitAgendaItems } from "./splitItems.js";
import { matchTopics } from "./watchlist.js";
import { extractMeetingTime } from "./meetingTime.js";
import { loadSeen, saveSeen } from "./seen.js";
import { buildDigest } from "./digest.js";
import { loadArchive, mergeEntries, saveArchive, attachVideos } from "./archive.js";
import { writeFeeds } from "./feed.js";
import { loadVotes, saveVotes } from "./votes.js";
import { parseCityMinutes } from "./minutes/cityMinutes.js";
import { parseCountyMinutes } from "./minutes/countyMinutes.js";
import { loadCorrections, applyCorrections } from "./corrections.js";
import { writeStatus } from "./status.js";
import { publish } from "./publish.js";
import { sendAgendaAlerts } from "./alerts.js";
import { localDateString, daysBetween } from "./dates.js";

// Load KIT_API_KEY and KIT_ALERT_MODE from .env, so every run has them,
// with or without --env-file. If there's no .env file, carry on without it.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: alerts stay off.
}

// ---- Options ----
// Normal daily run:  node src/index.js
// One-time backfill: node src/index.js --since 2026-01-01
// Skip publishing:   --no-publish     Skip email alerts: --no-email
const sinceIndex = process.argv.indexOf("--since");
const since = sinceIndex !== -1 ? process.argv[sinceIndex + 1] : null;

if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error("Use the format: --since YYYY-MM-DD");
  process.exit(1);
}

const isBackfill = Boolean(since);
const pause = () => new Promise((resolve) => setTimeout(resolve, 500));

let cutoff;
if (isBackfill) {
  cutoff = new Date(`${since}T00:00:00`);
} else {
  cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45); // minutes lag agendas by ~2 weeks
}

// ---- Gather documents ----
const results = await Promise.allSettled([
  getBgCityDocuments(),
  getWarrenCountyDocuments(cutoff.getFullYear()),
]);

const docs = [];
for (const result of results) {
  if (result.status === "fulfilled") docs.push(...result.value);
  else console.error("A source failed:", result.reason.message);
}

const agendas = docs
  .filter((d) => d.type === "agenda" && d.date >= cutoff)
  .sort((a, b) => a.date - b.date);

if (isBackfill) console.log(`Backfilling ${agendas.length} agendas since ${since}…`);

// ---- Process each agenda ----
const seen = await loadSeen();
const entries = [];

for (const [index, doc] of agendas.entries()) {
  try {
    const text = await getDocumentText(doc);
    const items = splitAgendaItems(text).map((item) => ({
      ...item,
      topics: matchTopics(item.text),
    }));
    entries.push({ doc, items, isNew: !seen.has(doc.url), time: extractMeetingTime(text) });

    if (isBackfill) {
      console.log(`  [${index + 1}/${agendas.length}] ${localDateString(doc.date)} ${doc.body}: ${items.length} items`);
      await pause();
    }
  } catch (err) {
    console.error(`Failed on ${doc.label}:`, err.message);
  }
}

// ---- Console digest (skipped for backfills, which would be huge) ----
if (!isBackfill) {
  const digest = buildDigest(entries);
  if (digest) {
    console.log(digest);
    await mkdir(path.join("data", "digests"), { recursive: true });
    await writeFile(path.join("data", "digests", `${localDateString()}.txt`), digest, "utf8");
  } else {
    console.log("Nothing new today.");
  }
}

// ---- Website data: meetings ----
const archive = mergeEntries(await loadArchive(), entries);

// Meeting video links: city from its website, county from its YouTube feed.
const videos = docs
  .filter((d) => d.type === "video")
  .map((d) => ({ body: d.body, date: localDateString(d.date), url: d.url }));

try {
  videos.push(...(await getCountyVideos()));
} catch (err) {
  console.warn("County videos skipped:", err.message);
}

const videosAttached = attachVideos(archive, videos);
if (videosAttached) console.log(`Video links added: ${videosAttached}`);

const archiveChanged = await saveArchive(archive);
console.log(archiveChanged ? `Site data updated (${archive.meetings.length} meetings total).` : "Site data unchanged.");

const feedsChanged = await writeFeeds(archive.meetings);
console.log(feedsChanged ? "Feeds updated." : "Feeds unchanged.");

// ---- Website data: votes from minutes (both bodies) ----
const votesArchive = await loadVotes();

const MINUTES_SOURCES = [
  { name: "City", match: (body) => body.includes("City"), parse: parseCityMinutes },
  { name: "County", match: (body) => body.includes("County"), parse: parseCountyMinutes },
];

const minutesDocs = docs.filter((d) => d.type === "minutes" && d.date >= cutoff);

for (const doc of minutesDocs) {
  const source = MINUTES_SOURCES.find((s) => s.match(doc.body));
  if (!source) continue;

  const minutesDate = localDateString(doc.date);

  // The same body's agenda closest to the minutes' date, within 3 days.
  const meeting = archive.meetings
    .filter((m) => source.match(m.body))
    .map((m) => ({ m, gap: Math.abs(daysBetween(m.date, minutesDate)) }))
    .filter(({ gap }) => gap <= 3)
    .sort((a, b) => a.gap - b.gap)[0]?.m;

  if (!meeting) {
    console.warn(`  No ${source.name} agenda near ${minutesDate} for "${doc.label}". Skipping.`);
    continue;
  }

  try {
    const text = await getDocumentText(doc);
    const { votes, procedural, rollCallCount, present = null } = source.parse(text);

    const allVotes = [...Object.values(votes), ...procedural];
    const dissents = allVotes.filter((v) => (v.nayCount ?? v.nays.length) > 0).length;

    votesArchive[meeting.url] = { minutesUrl: doc.url, votes, procedural, present };

    console.log(
      `  Votes ${meeting.date} ${source.name}: ${Object.keys(votes).length} item votes, ` +
      `${procedural.length} procedural, ${dissents} with a nay`
    );
    if (allVotes.length < rollCallCount) {
      console.warn(`    ⚠ ${rollCallCount} roll calls in the text, but only ${allVotes.length} were read`);
    }
    if (isBackfill) await pause();
  } catch (err) {
    console.error(`Failed on minutes ${minutesDate} (${source.name}):`, err.message);
  }
}

// Hand-entered corrections (e.g., names from meeting video), checked before use.
const correctionProblems = applyCorrections(votesArchive, archive.meetings, await loadCorrections());
correctionProblems.forEach((problem) => console.warn(`  ⚠ Correction skipped: ${problem}`));

const votesChanged = await saveVotes(votesArchive);
console.log(votesChanged ? "Vote data updated." : "Vote data unchanged.");

for (const entry of entries) seen.add(entry.doc.url);
await saveSeen(seen);

// ---- Status (shown on the site as "Last checked …") ----
await writeStatus({
  sources: {
    city: results[0].status === "fulfilled" ? "ok" : "error",
    county: results[1].status === "fulfilled" ? "ok" : "error",
  },
  dataChanged: archiveChanged || votesChanged || feedsChanged,
});

// ---- Publish ----
// Test without pushing: node src/index.js --no-publish
if (process.argv.includes("--no-publish")) {
  console.log("Skipping publish (--no-publish).");
} else {
  try {
    publish();
  } catch (err) {
    console.error("Publish failed:", err.message);
    process.exitCode = 1; // marks the run as failed in Task Scheduler
  }
}

// ---- Email alerts (after publishing, so the links work) ----
// Turn off for one run with --no-email. Backfills never send alerts.
const alertMode = isBackfill || process.argv.includes("--no-email")
  ? "off"
  : process.env.KIT_ALERT_MODE ?? "off";

await sendAgendaAlerts(archive.meetings, alertMode);
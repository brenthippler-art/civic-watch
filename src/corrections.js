import { readFile } from "node:fs/promises";

const FILE = "corrections.json";

export async function loadCorrections() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {}; // no corrections file yet: that's fine
    throw err; // a typo in the file should stop the run, not be silently ignored
  }
}

// Key format: "county|2026-07-09|ITEM-30" or "city|2026-06-16|MO-2026-158"
export function applyCorrections(votesArchive, meetings, corrections) {
  const problems = [];

  for (const [key, fix] of Object.entries(corrections)) {
    if (key.startsWith("_")) continue; // keys starting with _ are notes, not corrections

    const [bodyKey, date, voteId] = key.split("|");
    const bodyWord = bodyKey === "county" ? "County" : "City";
    const meeting = meetings.find((m) => m.date === date && m.body.includes(bodyWord));
    const entry = meeting && votesArchive[meeting.url];
    const vote = entry?.votes?.[voteId];

    if (!vote) {
      problems.push(`${key}: no matching vote found`);
      continue;
    }

    const nayCount = vote.nayCount ?? vote.nays.length;
    if (!Array.isArray(fix.nays) || fix.nays.length !== nayCount) {
      problems.push(`${key}: the minutes record ${nayCount} "no" vote(s), but the correction lists ${fix.nays?.length ?? 0}`);
      continue;
    }

    if (!fix.source) {
      problems.push(`${key}: every correction needs a "source" (for example, "Meeting video at 1:42:10")`);
      continue;
    }

    const present = entry.present;
    const notPresent = present ? fix.nays.filter((name) => !present.includes(name)) : [];
    if (notPresent.length) {
      problems.push(`${key}: ${notPresent.join(", ")} wasn't listed as present at that meeting`);
      continue;
    }

    vote.nays = fix.nays;
    vote.correction = { source: fix.source, note: fix.note ?? null };

    // With the "no" voters known, work out the yes voters if the counts line up.
    const accounted = (vote.yeaCount ?? 0) + nayCount + (vote.abstainCount ?? 0);
    if (present && accounted === present.length) {
      vote.yeas = present.filter((name) => !fix.nays.includes(name) && !(vote.abstain ?? []).includes(name));
      vote.inferred = true;
    }
  }

  return problems;
}
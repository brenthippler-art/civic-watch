import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { localDateString } from "./dates.js";

const FILE = path.join("public", "data", "meetings.json");

export async function loadArchive() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return { meetings: [] };
  }
}

export function mergeEntries(archive, entries) {
  // A Map keyed by URL: re-processing an agenda updates it instead of duplicating it.
  const byUrl = new Map(archive.meetings.map((m) => [m.url, m]));

  for (const { doc, items, time } of entries) {
    const existing = byUrl.get(doc.url);
    byUrl.set(doc.url, {
      url: doc.url,
      body: doc.body,
      date: localDateString(doc.date),
      time: time ?? existing?.time ?? null,
      special: Boolean(doc.special),
      label: doc.label,
      firstSeen: existing?.firstSeen ?? localDateString(),
      items: items.map(({ number, section, text, routine, topics, ref }) => ({
        number, section, text, routine, topics, ref,
      })),
    });
  }

  const meetings = [...byUrl.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { meetings };
}

// Returns true only if the file actually changed, so we don't publish for nothing.
export async function saveArchive(archive) {
  const json = JSON.stringify(archive, null, 2);

  let previous = null;
  try {
    previous = await readFile(FILE, "utf8");
  } catch {}

  if (previous === json) return false;

  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, json, "utf8");
  return true;
}
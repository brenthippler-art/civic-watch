import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join("public", "data", "votes.json");

// Shape: { [agendaUrl]: { minutesUrl, votes: { [itemRef]: vote } } }
export async function loadVotes() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function saveVotes(votes) {
  const json = JSON.stringify(votes, null, 2);

  let previous = null;
  try {
    previous = await readFile(FILE, "utf8");
  } catch {}

  if (previous === json) return false;

  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, json, "utf8");
  return true;
}
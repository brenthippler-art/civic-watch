import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join("data", "seen.json");

export async function loadSeen() {
  try {
    return new Set(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    return new Set(); // First run: nothing seen yet.
  }
}

export async function saveSeen(seen) {
  await mkdir("data", { recursive: true });
  await writeFile(FILE, JSON.stringify([...seen], null, 2));
}
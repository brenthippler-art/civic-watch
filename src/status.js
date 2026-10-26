import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join("public", "data", "status.json");

// sources: { city: "ok" | "error", county: "ok" | "error" }
export async function writeStatus({ sources, dataChanged }) {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    // First run: no previous status.
  }

  const now = new Date().toISOString();
  const status = {
    lastChecked: now,
    lastChanged: dataChanged ? now : previous.lastChanged ?? now,
    sources,
  };

  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(status, null, 2), "utf8");
}
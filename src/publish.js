import { execFileSync } from "node:child_process";
import { localDateString } from "./dates.js";

// Only the generated data gets auto-published. Changes to the site's code
// (HTML, CSS, JS) you commit and push yourself, on purpose.
const DATA_PATHS = ["public/data", "public/feeds", "corrections.json"];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function publish() {
  // Anything changed in the data files since the last commit?
  const changes = git("status", "--porcelain", "--", ...DATA_PATHS);
  if (!changes) {
    console.log("Nothing new to publish.");
    return false;
  }

  git("add", "--", ...DATA_PATHS);
  git("commit", "-m", `Update agendas and votes (${localDateString()})`, "--", ...DATA_PATHS);
  git("push");

  console.log("Published: pushed to GitHub. Vercel will redeploy in about a minute.");
  return true;
}
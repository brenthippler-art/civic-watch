import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const SITE_URL = "https://civic-watch-three.vercel.app";
const FEED_DIR = path.join("public", "feeds");
const MAX_ITEMS = 30;

const FEEDS = [
  { file: "all.xml", title: "Civic Watch: all new agendas", match: () => true },
  { file: "city.xml", title: "Civic Watch: Bowling Green City Commission agendas", match: (m) => m.body.includes("City") },
  { file: "county.xml", title: "Civic Watch: Warren County Fiscal Court agendas", match: (m) => m.body.includes("County") },
];

// Escapes text for XML and HTML. Also breaks up "]]>", which would end a CDATA block.
function escape(text) {
  return String(text)
    .replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" })[c])
    .replace(/]]>/g, "]]&gt;");
}

export function meetingAnchor(meeting) {
  return `meeting-${meeting.date}-${meeting.body.includes("County") ? "county" : "city"}`;
}

function longDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function itemXml(meeting) {
  const nonRoutine = meeting.items.filter((i) => !i.routine);
  const flagged = nonRoutine.filter((i) => i.topics.length);
  const listed = flagged.length ? flagged : nonRoutine.slice(0, 5);
  const listLabel = flagged.length ? "Flagged items" : "First items on the agenda";

  const html =
    `<p>${meeting.special ? "<strong>Special called meeting.</strong> " : ""}` +
    `${nonRoutine.length} non-routine item${nonRoutine.length === 1 ? "" : "s"}.</p>` +
    (listed.length
      ? `<p>${listLabel}:</p><ul>${listed.map((i) => `<li>${escape(i.text.slice(0, 300))}</li>`).join("")}</ul>`
      : "") +
    `<p><a href="${escape(meeting.url)}">Official agenda</a></p>`;

  const title = `${meeting.body}${meeting.special ? " (special called)" : ""}: ${longDate(meeting.date)}`;

  return `
    <item>
      <title>${escape(title)}</title>
      <link>${SITE_URL}/#${meetingAnchor(meeting)}</link>
      <guid isPermaLink="false">${escape(meeting.url)}</guid>
      <pubDate>${new Date(`${meeting.firstSeen}T12:00:00`).toUTCString()}</pubDate>
      <description><![CDATA[${html}]]></description>
    </item>`;
}

function feedXml(feed, meetings) {
  const items = meetings
    .filter(feed.match)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(feed.title)}</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}/feeds/${feed.file}" rel="self" type="application/rss+xml" />
    <description>New agendas from the Bowling Green City Commission and Warren County Fiscal Court, as soon as they are posted.</description>
    <language>en-us</language>${items.map(itemXml).join("")}
  </channel>
</rss>
`;
}

async function writeIfChanged(file, content) {
  let previous = null;
  try {
    previous = await readFile(file, "utf8");
  } catch {}
  if (previous === content) return false;
  await writeFile(file, content, "utf8");
  return true;
}

export async function writeFeeds(meetings) {
  await mkdir(FEED_DIR, { recursive: true });
  let changed = false;
  for (const feed of FEEDS) {
    const wrote = await writeIfChanged(path.join(FEED_DIR, feed.file), feedXml(feed, meetings));
    changed = changed || wrote;
  }
  return changed;
}
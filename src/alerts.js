import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SITE_URL, meetingAnchor } from "./feed.js";
import { localDateString } from "./dates.js";

// Kit tag IDs (from tools/kit-ids.js). These must match the form's checkbox values.
const TAGS = { city: 25035970, county: 25035973 };

const SENT_FILE = path.join("data", "sent-alerts.json");
const SEND_DELAY_MINUTES = 5; // gives Vercel time to deploy before people click the links

async function loadSent() {
  try {
    return new Set(JSON.parse(await readFile(SENT_FILE, "utf8")));
  } catch {
    return new Set();
  }
}

async function saveSent(sent) {
  await mkdir("data", { recursive: true });
  await writeFile(SENT_FILE, JSON.stringify([...sent], null, 2));
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function longDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// Builds the subject and HTML body for one agenda.
export function emailFor(meeting) {
  const bodyKey = meeting.body.includes("County") ? "county" : "city";
  const shortBody = bodyKey === "county" ? "Fiscal Court" : "City Commission";
  const when = longDate(meeting.date);

  const nonRoutine = meeting.items.filter((i) => !i.routine);
  const flagged = nonRoutine.filter((i) => i.topics.length);
  const listed = flagged.length ? flagged : nonRoutine.slice(0, 8);

  const items = listed
    .map((i) => {
      const topics = i.topics.length ? ` <em>(${escape(i.topics.join(", "))})</em>` : "";
      return `<li>${escape(i.text.slice(0, 300))}${topics}</li>`;
    })
    .join("");

  const content = `
    <p>The ${escape(meeting.body)} has posted the agenda for its
      ${meeting.special ? "<strong>special called</strong> " : ""}meeting on <strong>${when}</strong>.</p>
    <p>${nonRoutine.length} non-routine item${nonRoutine.length === 1 ? "" : "s"}${flagged.length ? `, ${flagged.length} on the watchlist` : ""}.</p>
    ${items ? `<p><strong>${flagged.length ? "Flagged items" : "First items on the agenda"}:</strong></p><ul>${items}</ul>` : ""}
    <p><a href="${SITE_URL}/#${meetingAnchor(meeting)}">See the full agenda on Civic Watch</a>
      &nbsp;·&nbsp; <a href="${escape(meeting.url)}">Official agenda</a></p>
    <p style="color:#5a6172;font-size:13px;">Civic Watch reads public agendas automatically.
      Always check the official document.</p>`;

  return {
    bodyKey,
    subject: `${meeting.special ? "Special meeting" : "New agenda"}: ${shortBody}, ${when}`,
    preview: `${nonRoutine.length} items on the agenda${flagged.length ? `, ${flagged.length} flagged` : ""}`,
    description: `Civic Watch alert: ${meeting.body}, ${meeting.date}`,
    content,
  };
}

// Creates one Kit broadcast for subscribers with the right tag.
// send = true schedules it; send = false saves it as a draft.
export async function createBroadcast(email, { send }) {
  const now = new Date();
  const sendAt = send ? new Date(now.getTime() + SEND_DELAY_MINUTES * 60_000).toISOString() : null;

  const response = await fetch("https://api.kit.com/v4/broadcasts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": process.env.KIT_API_KEY,
    },
    body: JSON.stringify({
      subject: email.subject,
      preview_text: email.preview,
      description: email.description,
      content: email.content,
      public: false, // email only; don't publish it to a web archive
      published_at: now.toISOString(),
      send_at: sendAt,
      email_address: null, // use the account's default sender
      thumbnail_url: null,
      thumbnail_alt: null,
      subscriber_filter: [{ all: [{ type: "tag", ids: [TAGS[email.bodyKey]] }], any: null, none: null }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Kit returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

// Called after each run. mode: "send", "draft", or "off".
export async function sendAgendaAlerts(meetings, mode) {
  if (mode === "off") {
    console.log("Alerts are off.");
    return;
  }
  if (!process.env.KIT_API_KEY) {
    console.warn("Alerts skipped: KIT_API_KEY isn't set. (Is the run using --env-file=.env?)");
    return;
  }

  const sent = await loadSent();
  const today = localDateString();

  for (const meeting of meetings) {
    // Only upcoming meetings, and only once per mode, so drafts don't pile up
    // and switching to "send" still sends.
    const ledgerKey = `${mode}:${meeting.url}`;
    if (meeting.date < today || sent.has(ledgerKey)) continue;

    const email = emailFor(meeting);
    try {
      await createBroadcast(email, { send: mode === "send" });
      sent.add(ledgerKey);
      await saveSent(sent); // save right away, so a later crash can't cause a repeat
      console.log(`  Alert ${mode === "send" ? `scheduled (${SEND_DELAY_MINUTES} min)` : "saved as a Kit draft"}: ${email.subject}`);
    } catch (err) {
      console.error(`  Alert failed for ${meeting.body} ${meeting.date}: ${err.message}`);
    }
  }
}
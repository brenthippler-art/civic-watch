import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SITE_URL } from "./feed.js";
import { escapeHtml, longDate, meetingAnchor } from "../public/shared.js";
import { localDateString } from "./dates.js";
import { PARTICIPATE } from "../public/participate.js";

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

// Builds the subject and HTML body for one agenda.
export function emailFor(meeting) {
  const bodyKey = meeting.body.includes("County") ? "county" : "city";
  const info = PARTICIPATE[bodyKey];
  const shortBody = bodyKey === "county" ? "Fiscal Court" : "City Commission";
  const when = longDate(meeting.date, { year: false });
  const time = meeting.time ?? info.usualTime;
  const timeNote = meeting.time ? "" : " (usual time; check the agenda)";

  const nonRoutine = meeting.items.filter((i) => !i.routine);
  const flagged = nonRoutine.filter((i) => i.topics.length);
  const listed = flagged.length ? flagged : nonRoutine.slice(0, 8);

  const items = listed
    .map((i) => {
      const topics = i.topics.length
        ? ` <em>(${escapeHtml(i.topics.join(", "))})</em>`
        : "";
      return `<li>${escapeHtml(i.text.slice(0, 300))}${topics}</li>`;
    })
    .join("");

  const contact = info.contacts
    ? info.contacts
        .map(
          (c) =>
            `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.name)}</a>`,
        )
        .join(", ")
    : `Fiscal Court office, <a href="${info.phone.href}">${info.phone.label}</a> · ` +
      `<a href="${info.findMagistrate}">Find your magistrate</a>`;

  const row = (label, value) =>
    `<p style="margin:0 0 6px;"><strong>${label}:</strong> ${value}</p>`;

  const content = `
    <p>The ${escapeHtml(meeting.body)} has posted the agenda for its
      ${meeting.special ? "<strong>special called</strong> " : ""}meeting on
      <strong>${when} at ${escapeHtml(time)}</strong>.</p>

    <h2 style="font-size:18px;margin:20px 0 8px;">How to take part</h2>
    ${row("When", `${when} at ${escapeHtml(time)}${timeNote}`)}
    ${row("Where", `<a href="${info.mapUrl}">${escapeHtml(info.location)}</a>`)}
    ${row("Speak", escapeHtml(info.speak))}
    ${info.watch ? row("Watch", `<a href="${info.watch.url}">${escapeHtml(info.watch.label)}</a>`) : ""}
    ${row("Contact", contact)}

    <h2 style="font-size:18px;margin:20px 0 8px;">On the agenda</h2>
    <p>${nonRoutine.length} non-routine item${nonRoutine.length === 1 ? "" : "s"}${flagged.length ? `, ${flagged.length} on the watchlist` : ""}.</p>
    ${items ? `<p><strong>${flagged.length ? "Flagged items" : "First items on the agenda"}:</strong></p><ul>${items}</ul>` : ""}

    <p><a href="${SITE_URL}/#${meetingAnchor(meeting)}">See the full agenda on Civic Watch</a>
      &nbsp;·&nbsp; <a href="${escapeHtml(meeting.url)}">Official agenda</a></p>
    <p style="color:#5a6172;font-size:13px;">Civic Watch reads public agendas automatically.
      Always check the official document.</p>`;

  return {
    bodyKey,
    subject: `${meeting.special ? "Special meeting" : "New agenda"}: ${shortBody}, ${when} at ${time}`,
    preview: `${when} at ${time} · ${nonRoutine.length} items${flagged.length ? `, ${flagged.length} flagged` : ""}`,
    description: `Civic Watch alert: ${meeting.body}, ${meeting.date}`,
    content,
  };
}

// Creates one Kit broadcast for subscribers with the right tag.
// send = true schedules it; send = false saves it as a draft.
export async function createBroadcast(email, { send }) {
  const now = new Date();
  const sendAt = send
    ? new Date(now.getTime() + SEND_DELAY_MINUTES * 60_000).toISOString()
    : null;

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
      subscriber_filter: [
        {
          all: [{ type: "tag", ids: [TAGS[email.bodyKey]] }],
          any: null,
          none: null,
        },
      ],
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
    console.warn(
      "Alerts skipped: KIT_API_KEY isn't set. (Is the run using --env-file=.env?)",
    );
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
      console.log(
        `  Alert ${mode === "send" ? `scheduled (${SEND_DELAY_MINUTES} min)` : "saved as a Kit draft"}: ${email.subject}`,
      );
    } catch (err) {
      console.error(
        `  Alert failed for ${meeting.body} ${meeting.date}: ${err.message}`,
      );
    }
  }
}

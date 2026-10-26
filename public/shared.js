// Small helpers used by the website (app.js, record.js, ordinances.js)
// and by the Node side (src/alerts.js, src/feed.js).
// Plain JavaScript only, so it runs in both places.

// Makes text safe to put inside HTML.
export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// Today as "2026-10-26", in local time.
export function todayString() {
  return new Date().toLocaleDateString("en-CA");
}

// "2026-10-29" -> "Thursday, October 29, 2026" (or without the year).
// Noon avoids a time-zone shift pushing the date back a day.
export function longDate(isoDate, { year = true } = {}) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(year && { year: "numeric" }),
  });
}

// "2026-10-29" -> "Oct 29, 2026"
export function shortDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "city" or "county"
export function bodyKey(meeting) {
  return meeting.body.includes("County") ? "county" : "city";
}

// The link target for one meeting: "meeting-2026-10-29-county".
// Used by the website, the RSS feeds, and the alert emails.
export function meetingAnchor(meeting) {
  return `meeting-${meeting.date}-${bodyKey(meeting)}`;
}

// City: "(First Reading – Non-Binding)". County: "second and final reading".
export function readingOf(item) {
  if (/second (and final )?reading/i.test(item.text)) return "second";
  if (/first reading/i.test(item.text)) return "first";
  return null;
}
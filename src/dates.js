// Returns "2026-10-25" in YOUR time zone.
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Days between two "YYYY-MM-DD" strings (a minus b).
export function daysBetween(a, b) {
  const ms = new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`);
  return Math.round(ms / 86_400_000);
}
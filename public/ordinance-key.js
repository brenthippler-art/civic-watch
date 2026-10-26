// Identifies the same ordinance across meetings.
// City:   item.ref "ORD-2026-17"  -> key "city-ORD-2026-17", label "Ordinance BG2026-17"
// County: "Ordinance #26-22WC"    -> key "county-26-22WC",   label "Ordinance 26-22WC"
const COUNTY_ORDINANCE = /Ordinance\s*#\s*(\d{2})\s*-\s*(\d+)\s*(WC)?\b/i;

export function ordinanceInfo(meeting, item) {
  if (meeting.body.includes("City")) {
    if (!item.ref?.startsWith("ORD-")) return null;
    const [, year, number] = item.ref.split("-");
    return { key: `city-${item.ref}`, label: `Ordinance BG${year}-${number}` };
  }

  const match = item.text.match(COUNTY_ORDINANCE);
  if (!match) return null;
  const number = `${match[1]}-${match[2]}${(match[3] ?? "").toUpperCase()}`;
  return { key: `county-${number}`, label: `Ordinance ${number}` };
}
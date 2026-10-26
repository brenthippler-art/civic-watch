// Turns "Municipal Order No. 2026 – 215 …" into "MO-2026-215"
// and "Ordinance No. BG2026 – 17 …" into "ORD-2026-17".
// Tolerant of common OCR slips: "MUNICIPAL, ORDER", "NO,", "2026 —201".
const CITY_ID = /(municipal[,.]?\s+order|ordinance)\s+no[.,]?\s*(?:bg)?\s*(\d{4})\s*[–—-]+\s*(\d+)/i;

export function cityRef(text) {
  const match = text.match(CITY_ID);
  if (!match) return null;
  const kind = /ordinance/i.test(match[1]) ? "ORD" : "MO";
  return `${kind}-${match[2]}-${Number(match[3])}`;
}
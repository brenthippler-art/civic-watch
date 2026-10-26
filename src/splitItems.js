import { cityRef } from "./itemRefs.js";

// Items that show up on every agenda and rarely matter.
// They're tagged, not dropped, so you can still see them if you want.
const ROUTINE = [
  /invocation/i,
  /pledge/i,
  /^roll call/i,
  /approve (the )?minutes/i,
  /^claims\b/i,
  /^adjourn/i,
  /personnel changes/i,
  /work schedule/i,
  /approving the promotions? of/i,
  /probationary appointments?/i,
  /out-of-town travel/i,
];

// "ITEMS FOR CONSIDERATION:" -> true. "Approve the budget" -> false.
function isSectionHeader(line) {
  return line.length > 3 && /[A-Z]/.test(line) && line === line.toUpperCase() && !/^\d/.test(line);
}

export function splitAgendaItems(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const items = [];
  let section = null;
  let current = null;

  for (const line of lines) {
    // Skip stray page numbers.
    if (/^\d+$/.test(line)) continue;

    // "7. Approve second and final reading..." starts a new item.
    const itemMatch = line.match(/^(\d{1,3})\.\s+(.+)/);
    if (itemMatch) {
      current = { number: Number(itemMatch[1]), section, text: itemMatch[2] };
      items.push(current);
      continue;
    }

    if (isSectionHeader(line)) {
      section = line.replace(/:$/, "");
      current = null;
      continue;
    }

    // City notes like "Municipal Orders require one reading and vote" are
    // labels for the next group, not part of the previous item.
    if (/requires? (one|two) readings?/i.test(line)) {
      current = null;
      continue;
    }

    // Anything else is a wrapped line that belongs to the item above it.
    if (current) current.text += " " + line;
  }

  return items.map((item) => ({
    ...item,
    routine: ROUTINE.some((pattern) => pattern.test(item.text)),
    ref: cityRef(item.text),
  }));
}
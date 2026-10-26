function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function formatItem(item) {
  const short = item.text.length > 220 ? item.text.slice(0, 220) + "…" : item.text;
  return `  • ${short}\n    [${item.topics.join(", ")}]`;
}

// entries: [{ doc, items, isNew }]
export function buildDigest(entries, today = new Date()) {
  const meetingsToday = entries.filter((e) => isSameDay(e.doc.date, today));
  const newAgendas = entries.filter((e) => e.isNew);

  if (meetingsToday.length === 0 && newAgendas.length === 0) return null;

  const lines = [`CIVIC WATCH | ${today.toDateString()}`, ""];

  if (meetingsToday.length) {
    lines.push("⏰ MEETING TODAY");
    for (const { doc, items } of meetingsToday) {
      const flagged = items.filter((i) => i.topics.length && !i.routine);
      lines.push(`- ${doc.body}: ${flagged.length} flagged items`, `  ${doc.url}`);
    }
    lines.push("");
  }

  for (const { doc, items } of newAgendas) {
    const flagged = items.filter((i) => i.topics.length && !i.routine);
    const other = items.filter((i) => !i.topics.length && !i.routine);

    lines.push(
      `📄 NEW AGENDA: ${doc.body}, ${doc.date.toDateString()}${doc.special ? " (SPECIAL CALLED)" : ""}`,
      `   ${doc.url}`
    );

    if (flagged.length) {
      lines.push("   Flagged:");
      flagged.forEach((item) => lines.push(formatItem(item)));
    } else {
      lines.push("   Nothing on your watchlist.");
    }

    lines.push(`   Plus ${other.length} other non-routine items.`, "");
  }

  return lines.join("\n");
}
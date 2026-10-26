const el = document.querySelector("#last-checked");
const SOURCE_NAMES = { city: "City Commission", county: "Fiscal Court" };
const STALE_AFTER_HOURS = 30; // runs happen twice a day, so 30+ hours means a missed day

// "today at 9:02 PM", "yesterday at 9:02 PM", or "Oct 24 at 9:02 PM"
function describe(date) {
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  if (dayKey(date) === dayKey(today)) return `today at ${time}`;
  if (dayKey(date) === dayKey(yesterday)) return `yesterday at ${time}`;

  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
  return `${day} at ${time}`;
}

if (el) {
  try {
    const response = await fetch("data/status.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`status.json returned ${response.status}`);
    const status = await response.json();

    const checked = new Date(status.lastChecked);
    const parts = [`Last checked <time datetime="${status.lastChecked}">${describe(checked)}</time>.`];

    const failed = Object.entries(status.sources ?? {})
      .filter(([, state]) => state !== "ok")
      .map(([key]) => SOURCE_NAMES[key] ?? key);
    if (failed.length) {
      parts.push(`${failed.join(" and ")} couldn't be reached on that check.`);
    }

    const hoursAgo = (Date.now() - checked.getTime()) / 3_600_000;
    if (hoursAgo > STALE_AFTER_HOURS) {
      parts.push("Updates may be delayed.");
      el.classList.add("stale");
    }

    el.innerHTML = parts.join(" ");
    el.hidden = false;
  } catch (err) {
    console.warn("Couldn't load status:", err);
  }
}
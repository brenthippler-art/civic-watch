import { ordinanceInfo } from "./ordinance-key.js";

const TODAY = new Date().toLocaleDateString("en-CA");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function shortDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const bodyKey = (meeting) => (meeting.body.includes("County") ? "county" : "city");
const anchorFor = (meeting) => `meeting-${meeting.date}-${bodyKey(meeting)}`;

function readingOf(item) {
  if (/second (and final )?reading/i.test(item.text)) return "second";
  if (/first reading/i.test(item.text)) return "first";
  return null;
}

// The plain-language part of an item, without the number and reading label.
function cleanTitle(meeting, item) {
  let text = item.text;
  if (bodyKey(meeting) === "city") {
    // "Ordinance No. BG2026 – 17 ORDINANCE RENAMING STREET (First Reading – Non-Binding) Ordinance approving …"
    const afterReading = text.match(/\((?:First|Second) Reading[^)]*\)\s*(.+)/i);
    text = afterReading ? afterReading[1] : text.replace(/^Ordinance No\.\s*BG\s*\d{4}\s*[–—-]\s*\d+\s*/i, "");
  } else {
    // "Approve second and final reading of Ordinance #26-22WC Adopting an Animal Control Policy …"
    text = text.replace(/^.*?Ordinance\s*#\s*\d{2}\s*-\s*\d+\s*(WC)?\s*/i, "");
  }
  text = text.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function nayCountOf(vote) {
  return vote.nayCount ?? vote.nays.length;
}

function voteHtml(vote) {
  const yeas = vote.yeaCount ?? vote.yeas?.length ?? 0;
  const nays = nayCountOf(vote);
  const failed = /denied|defeated|failed/.test(vote.outcome ?? "");
  const who = nays ? (vote.nays.length ? ` · No: ${vote.nays.map(escapeHtml).join(", ")}` : " · no vote not named") : "";
  const cls = nays ? "vote split" : failed ? "vote failed" : "vote";
  return `<span class="${cls}">${failed ? "Failed" : "Passed"} ${yeas}–${nays}${who}</span>`;
}

function statusOf(ordinance) {
  const last = ordinance.steps.at(-1);
  const when = shortDate(last.meeting.date);

  if (/denied|defeated|failed/.test(last.vote?.outcome ?? "")) return { label: "Failed", tone: "failed" };

  if (last.meeting.date >= TODAY) {
    if (last.reading === "second") return { label: `Final vote ${when}`, tone: "upcoming" };
    if (last.reading === "first") return { label: `First reading ${when}`, tone: "upcoming" };
    return { label: `On the agenda ${when}`, tone: "upcoming" };
  }

  if (!last.vote) return { label: "Awaiting minutes", tone: "pending" };
  if (last.reading === "second" || last.vote.outcome === "adopted") return { label: "Adopted", tone: "adopted" };
  if (last.reading === "first") return { label: "Passed first reading", tone: "pending" };
  return { label: "Approved", tone: "adopted" };
}

// True when the "no" votes differ between readings (count or names).
function voteChanged(ordinance) {
  const fingerprints = ordinance.steps
    .filter((s) => s.vote)
    .map((s) => `${nayCountOf(s.vote)}|${[...s.vote.nays].sort().join(",")}`);
  return new Set(fingerprints).size > 1;
}

function buildOrdinances(meetings, votes) {
  const byKey = new Map();

  for (const meeting of meetings) {
    for (const item of meeting.items) {
      const info = ordinanceInfo(meeting, item);
      if (!info) continue;

      const vote = votes[meeting.url]?.votes?.[item.ref ?? `ITEM-${item.number}`] ?? null;
      if (!byKey.has(info.key)) byKey.set(info.key, { ...info, body: meeting.body, steps: [] });

      byKey.get(info.key).steps.push({
        meeting,
        item,
        vote,
        reading: readingOf(item),
        title: cleanTitle(meeting, item),
      });
    }
  }

  for (const ordinance of byKey.values()) {
    ordinance.steps.sort((a, b) => a.meeting.date.localeCompare(b.meeting.date));
    ordinance.title = ordinance.steps.at(-1).title;
    ordinance.topics = [...new Set(ordinance.steps.flatMap((s) => s.item.topics))];
    ordinance.lastDate = ordinance.steps.at(-1).meeting.date;
    ordinance.status = statusOf(ordinance);
    ordinance.voteChanged = voteChanged(ordinance);
  }

  return [...byKey.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

function stepHtml(step) {
  const readingLabel =
    step.reading === "first" ? "First reading" : step.reading === "second" ? "Second reading" : "On the agenda";
  const result = step.vote
    ? voteHtml(step.vote)
    : step.meeting.date >= TODAY
      ? `<span class="quiet">Scheduled</span>`
      : `<span class="quiet">Vote not recorded yet</span>`;

  return `
    <li>
      <span class="timeline-date">${shortDate(step.meeting.date)}</span>
      <strong>${readingLabel}</strong> ${result}
      <a class="timeline-link" href="./#${anchorFor(step.meeting)}">Meeting</a>
    </li>`;
}

function ordinanceHtml(ordinance) {
  const key = ordinance.body.includes("County") ? "county" : "city";
  const bodyName = key === "county" ? "Fiscal Court" : "City Commission";
  const topics = ordinance.topics.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");

  return `
    <article class="ordinance ${key}" id="ord-${ordinance.key}" tabindex="-1">
      <p class="ordinance-label">${escapeHtml(ordinance.label)} · ${bodyName}</p>
      <h2>${escapeHtml(ordinance.title)}</h2>
      <p class="ordinance-status">
        <span class="status ${ordinance.status.tone}">${escapeHtml(ordinance.status.label)}</span>
        ${ordinance.voteChanged ? `<span class="tag reading">Vote changed between readings</span>` : ""}
      </p>
      ${topics ? `<div class="tags">${topics}</div>` : ""}
      <ol class="timeline">${ordinance.steps.map(stepHtml).join("")}</ol>
    </article>`;
}

// ---------- Page ----------

const form = document.querySelector("#ord-filters");
let ordinances = [];

function render() {
  const data = new FormData(form);
  const body = data.get("body");
  const progressOnly = data.get("progress") === "on";

  const shown = ordinances.filter((o) => {
    const key = o.body.includes("County") ? "county" : "city";
    if (body !== "all" && key !== body) return false;
    if (progressOnly && !["upcoming", "pending"].includes(o.status.tone)) return false;
    return true;
  });

  document.querySelector("#ordinances").innerHTML =
    shown.map(ordinanceHtml).join("") || `<p class="quiet">No ordinances match.</p>`;

  const inProgress = shown.filter((o) => ["upcoming", "pending"].includes(o.status.tone)).length;
  document.querySelector("#ord-count").textContent =
    `Showing ${shown.length} ordinance${shown.length === 1 ? "" : "s"}, ${inProgress} in progress.`;
}

function goToLinkedOrdinance() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id.startsWith("ord-")) return;

  if (!document.getElementById(id)) {
    form.reset(); // clear filters so the linked ordinance is shown
    render();
  }

  const card = document.getElementById(id);
  if (!card) return;
  card.scrollIntoView({ block: "start" });
  document.fonts?.ready.then(() => card.scrollIntoView({ block: "start" }));
  card.focus({ preventScroll: true });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), 2500);
}

form.addEventListener("change", render);
window.addEventListener("hashchange", goToLinkedOrdinance);

try {
  const [meetingsResponse, votesResponse] = await Promise.all([
    fetch("data/meetings.json"),
    fetch("data/votes.json"),
  ]);
  if (!meetingsResponse.ok) throw new Error(`meetings.json returned ${meetingsResponse.status}`);

  const { meetings } = await meetingsResponse.json();
  const votes = votesResponse.ok ? await votesResponse.json() : {};

  ordinances = buildOrdinances(meetings, votes);
  render();
  goToLinkedOrdinance();
} catch (err) {
  console.error("Couldn't load ordinance data:", err);
  document.querySelector("#ordinances").innerHTML =
    `<p class="quiet">Ordinance data couldn't be loaded right now. Please try again later.</p>`;
}
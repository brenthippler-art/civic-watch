const TODAY = new Date().toLocaleDateString("en-CA"); // "2026-10-25", local time
const PAST_DAYS = 60;
const PAST_CUTOFF = (() => {
  const d = new Date();
  d.setDate(d.getDate() - PAST_DAYS);
  return d.toLocaleDateString("en-CA");
})();

const DEFAULT_FILTERS = { body: "all", reading: "any", topic: "" };
let filters = { ...DEFAULT_FILTERS };
let showOlder = false;
let meetings = [];
let votes = {};

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatDate(isoDate) {
  // Noon avoids a time-zone shift pushing the date back a day.
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

// ---------- Filter logic ----------

function bodyKey(meeting) {
  return meeting.body.includes("County") ? "county" : "city";
}

// City: "(First Reading – Non-Binding)". County: "second and final reading".
function readingOf(item) {
  if (/second (and final )?reading/i.test(item.text)) return "second";
  if (/first reading/i.test(item.text)) return "first";
  return null;
}

function filtersActive() {
  return filters.topic !== "" || filters.reading !== "any";
}

function itemMatches(item) {
  if (filters.topic && !item.topics.includes(filters.topic)) return false;
  if (filters.reading !== "any" && readingOf(item) !== filters.reading) return false;
  // With no item filters on, show just the watchlist hits (the default view).
  if (!filtersActive()) return item.topics.length > 0;
  return true;
}

// ---------- HTML builders ----------

// "Passed 5–0", or "Passed 4–1 · No: Hill" for a split vote.
// "Passed 5–0", or "Passed 4–1 · No: Hill" for a split vote.
function voteHtml(vote) {
  if (!vote) return "";
  const yeaCount = vote.yeaCount ?? vote.yeas?.length ?? 0;
  const nayCount = vote.nayCount ?? vote.nays.length;
  const failed = /denied|defeated|failed/.test(vote.outcome ?? "");
  const label = vote.outcome === "tabled" ? "Tabled" : failed ? "Failed" : "Passed";

  let noVoters = "";
  if (nayCount) {
    noVoters = vote.nays.length
      ? ` · No: ${vote.nays.map(escapeHtml).join(", ")}`
      : " · No votes not named in minutes";
  }

  const cls = nayCount ? "vote split" : failed ? "vote failed" : "vote";
  return `<span class="${cls}">${label} ${yeaCount}–${nayCount}${noVoters}</span>`;
}

function itemHtml(item, vote) {
  const reading = readingOf(item);
  const readingTag = reading
    ? `<span class="tag reading">${reading === "first" ? "First reading" : "Second reading"}</span>`
    : "";
  const topicTags = item.topics.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  const tags = voteHtml(vote) + readingTag + topicTags;
  return `<li>${escapeHtml(item.text)}${tags ? `<div class="tags">${tags}</div>` : ""}</li>`;
}

function meetingHtml(meeting) {
  if (filters.body !== "all" && bodyKey(meeting) !== filters.body) return "";

  const visible = meeting.items.filter((i) => !i.routine);
  const matching = visible.filter(itemMatches);

  if (filtersActive() && matching.length === 0) return "";

  const date = new Date(`${meeting.date}T12:00:00`);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const heading = filtersActive() ? "Matching items" : "Flagged items";

  // Votes for this meeting, keyed by item ref ("MO-2026-215").
  const meetingVotes = votes[meeting.url]?.votes ?? {};
  const minutesUrl = votes[meeting.url]?.minutesUrl;
  // City items match by ordinance/order number; county items by agenda item number.
  const renderItem = (item) => itemHtml(item, meetingVotes[item.ref ?? `ITEM-${item.number}`]);

  return `
    <article class="meeting ${bodyKey(meeting)}">
      <div class="date-tile" aria-hidden="true">
        <span class="month">${month}</span>
        <span class="day">${day}</span>
      </div>
      <div class="meeting-content">
        <h3>${escapeHtml(meeting.body)}</h3>
        <p class="meta">
          ${formatDate(meeting.date)}
          ${meeting.special ? `<span class="badge">Special called</span>` : ""}
        </p>
        ${matching.length
          ? `<h4>${heading}</h4><ul class="flagged">${matching.map(renderItem).join("")}</ul>`
          : `<p class="quiet">Nothing on the watchlist.</p>`}
        <details>
          <summary>All ${visible.length} non-routine items</summary>
          <ol>${visible.map(renderItem).join("")}</ol>
        </details>
        <p class="source-links">
          <a class="source-link" href="${escapeHtml(meeting.url)}" target="_blank" rel="noopener">
            Official agenda <span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>
          </a>
          ${minutesUrl
            ? `<a class="source-link" href="${escapeHtml(minutesUrl)}" target="_blank" rel="noopener">
                 Minutes <span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>
               </a>`
            : ""}
        </p>
      </div>
    </article>`;
}

// Topics only change when new data loads, so this runs once.
function renderTopicOptions() {
  const topics = [...new Set(meetings.flatMap((m) => m.items.flatMap((i) => i.topics)))].sort();
  const options = [{ value: "", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))];

  document.querySelector("#topic-options").innerHTML = options
    .map((opt, i) => `
      <div class="option">
        <input type="radio" id="topic-${i}" name="topic" value="${escapeHtml(opt.value)}" ${opt.value === filters.topic ? "checked" : ""} />
        <label for="topic-${i}">${escapeHtml(opt.label)}</label>
      </div>`)
    .join("");
}

// ---------- Render ----------

function render() {
  const upcomingCards = meetings
    .filter((m) => m.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(meetingHtml)
    .filter(Boolean);

  document.querySelector("#upcoming").innerHTML =
    upcomingCards.join("") || `<p class="quiet">No upcoming meetings match.</p>`;

  const past = meetings.filter((m) => m.date < TODAY);
  const recentCards = past.filter((m) => m.date >= PAST_CUTOFF).map(meetingHtml).filter(Boolean);
  const olderCards = past.filter((m) => m.date < PAST_CUTOFF).map(meetingHtml).filter(Boolean);
  const pastCards = showOlder ? [...recentCards, ...olderCards] : recentCards;

  const toggle = olderCards.length
    ? `<button type="button" id="toggle-older" class="toggle-older" aria-expanded="${showOlder}">
         ${showOlder ? "Hide older meetings" : `Show older meetings (${olderCards.length})`}
       </button>`
    : "";

  document.querySelector("#past").innerHTML =
    (pastCards.join("") || `<p class="quiet">No past meetings in the last ${PAST_DAYS} days match.</p>`) + toggle;

  const count = upcomingCards.length + pastCards.length;
  document.querySelector("#result-count").textContent = `Showing ${count} meeting${count === 1 ? "" : "s"} in the last sixty days. Older meetings available at the bottom of the page.`;
}

// ---------- Events ----------

const form = document.querySelector("#filters");

form.addEventListener("change", () => {
  const data = new FormData(form);
  filters = {
    body: data.get("body"),
    reading: data.get("reading"),
    topic: data.get("topic") ?? "",
  };
  render();
});

form.addEventListener("reset", (event) => {
  event.preventDefault();
  filters = { ...DEFAULT_FILTERS };
  showOlder = false;
  form.elements.body.value = "all";
  form.elements.reading.value = "any";
  form.querySelector('input[name="topic"][value=""]').checked = true;
  render();
});

document.querySelector("#past").addEventListener("click", (event) => {
  if (!event.target.closest("#toggle-older")) return;
  showOlder = !showOlder;
  render();
  document.querySelector("#toggle-older")?.focus();
});

// ---------- Start ----------

const [meetingsResponse, votesResponse] = await Promise.all([
  fetch("data/meetings.json"),
  fetch("data/votes.json"),
]);
({ meetings } = await meetingsResponse.json());
votes = votesResponse.ok ? await votesResponse.json() : {};

renderTopicOptions();
render();
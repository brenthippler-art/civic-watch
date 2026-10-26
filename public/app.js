import { ordinanceInfo } from "./ordinance-key.js";
import { PARTICIPATE } from "./participate.js";
import {
  escapeHtml,
  todayString,
  longDate,
  bodyKey,
  meetingAnchor,
  readingOf,
} from "./shared.js";
import { setOpen, openSectionContaining } from "./disclosure.js";

const TODAY = todayString();
const PAST_DAYS = 60;
const PAST_CUTOFF = (() => {
  const d = new Date();
  d.setDate(d.getDate() - PAST_DAYS);
  return d.toLocaleDateString("en-CA");
})();

const DEFAULT_FILTERS = { body: "all", reading: "any", topic: "", query: "" };
let filters = { ...DEFAULT_FILTERS };
let showOlder = false;
let meetings = [];
let votes = {};

// "Scottsville  Rezoning" -> ["scottsville", "rezoning"]
function queryTerms() {
  return filters.query.toLowerCase().split(/\s+/).filter(Boolean);
}

// Every word must appear somewhere in the item, in any order.
function matchesQuery(text) {
  const lower = text.toLowerCase();
  return queryTerms().every((term) => lower.includes(term));
}

// Makes search words safe to use inside a regular expression.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Escapes the text and wraps each search match in <mark>.
function highlight(text) {
  const terms = queryTerms();
  if (!terms.length) return escapeHtml(text);

  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, i) =>
      i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join("");
}

function filtersActive() {
  return (
    filters.topic !== "" || filters.reading !== "any" || filters.query !== ""
  );
}

function itemMatches(item) {
  if (filters.query && !matchesQuery(item.text)) return false;
  if (filters.topic && !item.topics.includes(filters.topic)) return false;
  if (filters.reading !== "any" && readingOf(item) !== filters.reading)
    return false;
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
  const label =
    vote.outcome === "tabled" ? "Tabled" : failed ? "Failed" : "Passed";

  let noVoters = "";
  if (nayCount) {
    noVoters = vote.nays.length
      ? ` · No: ${vote.nays.map(escapeHtml).join(", ")}`
      : " · No votes not named in minutes";
  }

  const cls = nayCount ? "vote split" : failed ? "vote failed" : "vote";
  return `<span class="${cls}">${label} ${yeaCount}–${nayCount}${noVoters}</span>`;
}

function itemHtml(item, vote, meeting) {
  const reading = readingOf(item);
  const readingTag = reading
    ? `<span class="tag reading">${reading === "first" ? "First reading" : "Second reading"}</span>`
    : "";
  const topicTags = item.topics
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  const ordinance = ordinanceInfo(meeting, item);
  const historyLink = ordinance
    ? `<a class="tag-link" href="ordinances.html#ord-${ordinance.key}">Ordinance history</a>`
    : "";

  const tags = voteHtml(vote) + readingTag + topicTags + historyLink;
  return `<li>${highlight(item.text)}${tags ? `<div class="tags">${tags}</div>` : ""}</li>`;
}

const NEW_TAB = `<span class="visually-hidden"> (opens in new tab)</span>`;

// Matches the links used in the RSS feeds and alert emails: "meeting-2026-10-29-county"

function meetingHtml(meeting) {
  if (filters.body !== "all" && bodyKey(meeting) !== filters.body) return "";

  // While searching, include routine items too, so a search for a name still finds appointments.
  const visible = filters.query
    ? meeting.items
    : meeting.items.filter((i) => !i.routine);
  const matching = visible.filter(itemMatches);

  if (filtersActive() && matching.length === 0) return "";

  const date = new Date(`${meeting.date}T12:00:00`);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const heading = filtersActive() ? "Matching items" : "Flagged items";

  // Votes for this meeting, keyed by item ref ("MO-2026-215").
  const meetingVotes = votes[meeting.url]?.votes ?? {};
  const minutesUrl = votes[meeting.url]?.minutesUrl;

  // Past meetings: the exact video if we have it, otherwise that body's video page.
  let videoLink = "";
  if (meeting.date < TODAY) {
    const url = meeting.videoUrl ?? PARTICIPATE[bodyKey(meeting)].watch.url;
    const label = meeting.videoUrl ? "Video" : "Meeting videos";
    videoLink = `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">
        ${label} <span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>
      </a>`;
  }

  // City items match by ordinance/order number; county items by agenda item number.
  const renderItem = (item) =>
    itemHtml(item, meetingVotes[item.ref ?? `ITEM-${item.number}`], meeting);

  return `
    <article class="meeting ${bodyKey(meeting)}" id="${meetingAnchor(meeting)}" tabindex="-1">
      <div class="date-tile" aria-hidden="true">
        <span class="month">${month}</span>
        <span class="day">${day}</span>
      </div>
      <div class="meeting-content">
        <h3>${escapeHtml(meeting.body)}</h3>
                <p class="meta">
          ${longDate(meeting.date)}
          ${meeting.special ? `<span class="badge">Special called</span>` : ""}
        </p>
        ${
          matching.length
            ? `<h4>${heading}</h4><ul class="flagged">${matching.map(renderItem).join("")}</ul>`
            : `<p class="quiet">Nothing on the watchlist.</p>`
        }
        <details>
          <summary>All ${visible.length} ${filters.query ? "" : "non-routine "}items</summary>
          <ol>${visible.map(renderItem).join("")}</ol>
        </details>
        <p class="source-links">
          <a class="source-link" href="${escapeHtml(meeting.url)}" target="_blank" rel="noopener">
            Official agenda <span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>
          </a>
          ${
            minutesUrl
              ? `<a class="source-link" href="${escapeHtml(minutesUrl)}" target="_blank" rel="noopener">
                 Minutes <span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>
               </a>`
              : ""
          }
                    ${videoLink}
                    <button type="button" class="copy-link" data-anchor="${meetingAnchor(meeting)}">Copy link</button>
        </p>
      </div>
    </article>`;
}

// Topics only change when new data loads, so this runs once.
function renderTopicOptions() {
  const topics = [
    ...new Set(meetings.flatMap((m) => m.items.flatMap((i) => i.topics))),
  ].sort();
  const options = [
    { value: "", label: "All topics" },
    ...topics.map((t) => ({ value: t, label: t })),
  ];

  document.querySelector("#topic-options").innerHTML = options
    .map(
      (opt, i) => `
      <div class="option">
        <input type="radio" id="topic-${i}" name="topic" value="${escapeHtml(opt.value)}" ${opt.value === filters.topic ? "checked" : ""} />
        <label for="topic-${i}">${escapeHtml(opt.label)}</label>
      </div>`,
    )
    .join("");
}

// ---------- Render ----------

function render() {
  const searching = filters.query !== "";

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

  // Searching always covers every meeting, so older ones are included automatically.
  const includeOlder = showOlder || searching;
  const pastCards = includeOlder ? [...recentCards, ...olderCards] : recentCards;

  const toggle = olderCards.length && !searching
    ? `<button type="button" id="toggle-older" class="toggle-older" aria-expanded="${showOlder}">
         ${showOlder ? "Hide older meetings" : `Show older meetings (${olderCards.length})`}
       </button>`
    : "";

  document.querySelector("#past").innerHTML =
    (pastCards.join("") ||
      `<p class="quiet">${searching ? "No past meetings match." : `No past meetings in the last ${PAST_DAYS} days match.`}</p>`) +
    toggle;

  // Counts on the collapsed section headings.
  document.querySelector("#upcoming-count").textContent = meetingCount(upcomingCards.length);
  document.querySelector("#past-count").textContent = meetingCount(pastCards.length);

  const count = upcomingCards.length + pastCards.length;
  const meetingsWord = `meeting${count === 1 ? "" : "s"}`;
  let summary;
  if (searching) {
    summary = `${count} ${meetingsWord} with items matching “${filters.query}.”`;
  } else if (showOlder) {
    summary = `Showing ${count} ${meetingsWord}, including older meetings.`;
  } else {
    summary = `Showing ${count} ${meetingsWord} from the last 60 days. Older meetings are at the end of Past meetings.`;
  }
  document.querySelector("#result-count").textContent = summary;
}

// ---------- Events ----------

const form = document.querySelector("#filters");

// Shows the current choice next to each collapsed filter: "Government · Both".
function updateFilterSummaries() {
  for (const current of form.querySelectorAll(".filter-current")) {
    const checked = form.querySelector(
      `input[name="${current.dataset.filter}"]:checked`,
    );
    const label = checked && form.querySelector(`label[for="${checked.id}"]`);
    current.textContent = label ? label.textContent.trim() : "";
  }
}

// After a search or filter change, open the sections that have results.
function openSectionsWithResults() {
  for (const id of ["upcoming", "past"]) {
    const hasResults = Boolean(
      document.getElementById(id).querySelector(".meeting"),
    );
    setOpen(document.querySelector(`[aria-controls="${id}"]`), hasResults);
  }
}

// Back to the default view: every filter group and section closed.
function collapseAll() {
  for (const group of form.querySelectorAll(".filter-group"))
    group.open = false;
  for (const button of document.querySelectorAll(".section-toggle"))
    setOpen(button, false);
}

const meetingCount = (n) => `${n} meeting${n === 1 ? "" : "s"}`;

function readFilters() {
  const data = new FormData(form);
  filters = {
    body: data.get("body"),
    reading: data.get("reading"),
    topic: data.get("topic") ?? "",
    query: (data.get("query") ?? "").trim(),
  };

  // Keep the search in the address bar, so a search can be shared as a link.
  const url = filters.query
    ? `?q=${encodeURIComponent(filters.query)}`
    : location.pathname;
  history.replaceState(null, "", url);
  updateFilterSummaries();
  render();
  openSectionsWithResults();
}

// Wait until typing pauses before updating, so results don't redraw on every keystroke.
let searchTimer;
form.addEventListener("input", (event) => {
  if (event.target.name !== "query") return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(readFilters, 200);
});

form.addEventListener("change", readFilters);

// Pressing Enter in the search box would normally submit the form and reload the page.
form.addEventListener("submit", (event) => event.preventDefault());

function resetFilters() {
  filters = { ...DEFAULT_FILTERS };
  form.elements.body.value = "all";
  form.elements.reading.value = "any";
  form.elements.query.value = "";
  form.querySelector('input[name="topic"][value=""]').checked = true;
  history.replaceState(null, "", location.pathname + location.hash);
  updateFilterSummaries();
}

form.addEventListener("reset", (event) => {
  event.preventDefault();
  resetFilters();
  showOlder = false;
  render();
  collapseAll();
});

document.querySelector("#past").addEventListener("click", (event) => {
  if (!event.target.closest("#toggle-older")) return;
  showOlder = !showOlder;
  render();
  document.querySelector("#toggle-older")?.focus();
});

// ---------- Shareable links ----------

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function announce(message) {
  const announcer = document.querySelector("#announcer");
  announcer.textContent = "";
  // A tiny delay makes screen readers announce the same message twice in a row.
  setTimeout(() => (announcer.textContent = message), 50);
}

// Scroll to the meeting named in the URL (#meeting-2026-10-29-county), if any.
// smooth: true only for in-page clicks. On page load, an instant jump is more reliable.
function goToLinkedMeeting({ smooth = false } = {}) {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id.startsWith("meeting-")) return;

  const target = meetings.find((m) => meetingAnchor(m) === id);
  if (!target) {
    console.warn(`No meeting matches the link #${id}`);
    return;
  }

  // The meeting may be hidden by a filter or behind "Show older meetings."
  if (!document.getElementById(id)) {
    resetFilters();
    if (target.date < PAST_CUTOFF) showOlder = true;
    render();
  }

  const card = document.getElementById(id);
  if (!card) return;
    openSectionContaining(card);

  const scrollToCard = (behavior) =>
    card.scrollIntoView({ behavior, block: "start" });

  scrollToCard(smooth && !prefersReducedMotion ? "smooth" : "auto");

  // Web fonts can finish loading after this and shift the page. Re-align once they're ready.
  if (!smooth) document.fonts?.ready.then(() => scrollToCard("auto"));

  card.focus({ preventScroll: true });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), 2500);
}

window.addEventListener("hashchange", () =>
  goToLinkedMeeting({ smooth: true }),
);

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-link");
  if (!button) return;

  const url = `${location.origin}${location.pathname}#${button.dataset.anchor}`;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "Link copied";
    announce("Link copied.");
    setTimeout(() => (button.textContent = "Copy link"), 2000);
  } catch {
    // Clipboard blocked (some browsers, or no HTTPS). Put the link in the address bar instead.
    history.replaceState(null, "", `#${button.dataset.anchor}`);
    announce(
      "Couldn't copy automatically. The link is now in your address bar.",
    );
  }
});

// ---------- Start ----------

try {
  const [meetingsResponse, votesResponse] = await Promise.all([
    fetch("data/meetings.json"),
    fetch("data/votes.json"),
  ]);
  if (!meetingsResponse.ok) throw new Error(`meetings.json returned ${meetingsResponse.status}`);

  ({ meetings } = await meetingsResponse.json());
  votes = votesResponse.ok ? await votesResponse.json() : {};

  renderTopicOptions();

  // A shared search link (?q=rezoning) starts with that search filled in.
  const sharedQuery = new URLSearchParams(location.search).get("q");
  if (sharedQuery) {
    form.elements.query.value = sharedQuery;
    filters.query = sharedQuery.trim();
  }

  updateFilterSummaries();
  render();
  if (sharedQuery) openSectionsWithResults();
  goToLinkedMeeting(); // jump to #meeting-… if the URL has one
} catch (err) {
  console.error("Couldn't load site data:", err);
  document.querySelector("#upcoming").innerHTML =
    `<p class="quiet">Meeting data couldn't be loaded right now. Please try again later.</p>`;
}
import { ordinanceInfo } from "./ordinance-key.js";

const TODAY = new Date().toLocaleDateString("en-CA"); // "2026-10-25", local time
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

// How to take part, per governing body. Update contacts after elections.
const PARTICIPATE = {
  city: {
    usualTime: "4:30 PM",
    location:
      "Commission Chamber, City Hall, 1001 College Street, Bowling Green",
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=1001+College+Street+Bowling+Green+KY",
    speak:
      "Sign up to speak at the back of the Commission Chamber when you arrive. " +
      "Speakers are called to the podium one at a time.",
    watch: {
      label: "Live on BGTV4 and online",
      url: "https://www.bgky.org/videos",
    },
    contacts: [
      { name: "Mayor Todd Alcott", email: "todd.alcott@bgky.org" },
      { name: "Carlos Bailey", email: "carlos.bailey@bgky.org" },
      { name: "Dana Beasley-Brown", email: "dana.beasleybrown@bgky.org" },
      { name: "Melinda Hill", email: "melinda.hill@bgky.org" },
      { name: "Sue Parrigin", email: "sue.parrigin@bgky.org" },
    ],
  },
  county: {
    usualTime: "9:00 AM",
    location:
      "Warren County Fiscal Courtroom, 429 East 10th Avenue, Bowling Green",
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=429+East+10th+Avenue+Bowling+Green+KY",
    speak:
      "To ask about speaking at a meeting, call the Fiscal Court office at 270-843-4146.",
    watch: {
      label: "Warren County on YouTube",
      url: "https://www.youtube.com/@warrencountykygov",
    },
    phone: { label: "270-843-4146", href: "tel:+12708434146" },
    findMagistrate:
      "https://bgky.maps.arcgis.com/apps/instant/sidebar/index.html?appid=1fba8d21efff42efb36b4fff8f7dbc8d",
    officialsPage:
      "https://www.warrencountyky.gov/departments/fiscal-court/#magistrates",
  },
};

function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function formatDate(isoDate) {
  // Noon avoids a time-zone shift pushing the date back a day.
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
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

// ---------- Search ----------

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
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join("");
}

function filtersActive() {
  return filters.topic !== "" || filters.reading !== "any" || filters.query !== "";
}

function itemMatches(item) {
  if (filters.query && !matchesQuery(item.text)) return false;
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
  const topicTags = item.topics.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");

  const ordinance = ordinanceInfo(meeting, item);
  const historyLink = ordinance
    ? `<a class="tag-link" href="ordinances.html#ord-${ordinance.key}">Ordinance history</a>`
    : "";

  const tags = voteHtml(vote) + readingTag + topicTags + historyLink;
  return `<li>${highlight(item.text)}${tags ? `<div class="tags">${tags}</div>` : ""}</li>`;
}

const NEW_TAB = `<span class="visually-hidden"> (opens in new tab)</span>`;

// Matches the links used in the RSS feeds and alert emails: "meeting-2026-10-29-county"
function anchorFor(meeting) {
  return `meeting-${meeting.date}-${bodyKey(meeting)}`;
}

function participateHtml(meeting) {
  const info = PARTICIPATE[bodyKey(meeting)];
  const time = meeting.time ?? info.usualTime;
  const timeNote = meeting.time
    ? ""
    : ` <span class="quiet">(usual time; check the agenda)</span>`;

  let contact;
  if (info.contacts) {
    contact = info.contacts
      .map(
        (c) =>
          `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.name)}</a>`,
      )
      .join(", ");
  } else {
    contact =
      `Fiscal Court office: <a href="${info.phone.href}">${info.phone.label}</a>. ` +
      `<a href="${info.findMagistrate}" target="_blank" rel="noopener">Find your magistrate${NEW_TAB}</a> · ` +
      `<a href="${info.officialsPage}" target="_blank" rel="noopener">All magistrates${NEW_TAB}</a>`;
  }

  const watch = info.watch
    ? `<div><dt>Watch</dt><dd><a href="${info.watch.url}" target="_blank" rel="noopener">${escapeHtml(info.watch.label)}${NEW_TAB}</a></dd></div>`
    : "";

  return `
    <div class="participate">
      <h4>How to take part</h4>
      <dl>
        <div><dt>When</dt><dd>${formatDate(meeting.date)}, ${escapeHtml(time)}${timeNote}</dd></div>
        <div><dt>Where</dt><dd><a href="${info.mapUrl}" target="_blank" rel="noopener">${escapeHtml(info.location)}<span class="visually-hidden"> (map, opens in new tab)</span></a></dd></div>
        <div><dt>Speak</dt><dd>${escapeHtml(info.speak)}</dd></div>
        ${watch}
        <div><dt>Contact</dt><dd>${contact}</dd></div>
      </dl>
    </div>`;
}

function meetingHtml(meeting) {
  if (filters.body !== "all" && bodyKey(meeting) !== filters.body) return "";

    // While searching, include routine items too, so a search for a name still finds appointments.
  const visible = filters.query ? meeting.items : meeting.items.filter((i) => !i.routine);
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
    <article class="meeting ${bodyKey(meeting)}" id="${anchorFor(meeting)}" tabindex="-1">
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
                    <button type="button" class="copy-link" data-anchor="${anchorFor(meeting)}">Copy link</button>
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

  const count = upcomingCards.length + pastCards.length;
  const meetingsWord = `meeting${count === 1 ? "" : "s"}`;
  let summary;
  if (searching) {
    summary = `${count} ${meetingsWord} with items matching “${filters.query}.”`;
  } else if (showOlder) {
    summary = `Showing ${count} ${meetingsWord}, including older meetings.`;
  } else {
    summary = `Showing ${count} ${meetingsWord} from the last 60 days. Older meetings are at the bottom of the page.`;
  }
  document.querySelector("#result-count").textContent = summary;
}

// ---------- Events ----------

const form = document.querySelector("#filters");

function readFilters() {
  const data = new FormData(form);
  filters = {
    body: data.get("body"),
    reading: data.get("reading"),
    topic: data.get("topic") ?? "",
    query: (data.get("query") ?? "").trim(),
  };

  // Keep the search in the address bar, so a search can be shared as a link.
  const url = filters.query ? `?q=${encodeURIComponent(filters.query)}` : location.pathname;
  history.replaceState(null, "", url);

  render();
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
}

form.addEventListener("reset", (event) => {
  event.preventDefault();
  resetFilters();
  showOlder = false;
  render();
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

  const target = meetings.find((m) => anchorFor(m) === id);
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

  const scrollToCard = (behavior) => card.scrollIntoView({ behavior, block: "start" });

  scrollToCard(smooth && !prefersReducedMotion ? "smooth" : "auto");

  // Web fonts can finish loading after this and shift the page. Re-align once they're ready.
  if (!smooth) document.fonts?.ready.then(() => scrollToCard("auto"));

  card.focus({ preventScroll: true });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), 2500);
}

window.addEventListener("hashchange", () => goToLinkedMeeting({ smooth: true }));

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
    announce("Couldn't copy automatically. The link is now in your address bar.");
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

  render();
  goToLinkedMeeting(); // jump to #meeting-… if the URL has one
} catch (err) {
  console.error("Couldn't load site data:", err);
  document.querySelector("#upcoming").innerHTML =
    `<p class="quiet">Meeting data couldn't be loaded right now. Please try again later.</p>`;
}
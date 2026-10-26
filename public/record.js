// Current members. Update after elections.
// `key` is matched against the first four letters of names in the minutes.
const BODIES = [
  {
    key: "city",
    label: "Bowling Green City Commission",
    match: (m) => m.body.includes("City"),
    note: "",
    roster: [
      { key: "alcott", name: "Todd Alcott", title: "Mayor" },
      { key: "bailey", name: "Carlos Bailey", title: "Commissioner" },
      { key: "beasley", name: "Dana Beasley-Brown", title: "Commissioner" },
      { key: "hill", name: "Melinda Hill", title: "Commissioner" },
      { key: "parrigin", name: "Sue Parrigin", title: "Commissioner" },
    ],
  },
  {
    key: "county",
    label: "Warren County Fiscal Court",
    match: (m) => m.body.includes("County"),
    note:
      "Fiscal Court minutes record vote counts (for example, “seven yeas, no nays”) rather than each name. " +
      "Individual yes votes are worked out from who was present. If the counts don’t line up with attendance, " +
      "that vote is shown but left out of individual totals.",
    roster: [
      { key: "gorman", name: "Doug Gorman", title: "Judge-Executive" },
      { key: "lasley", name: "Scott Lasley", title: "Magistrate, District 1" },
      { key: "lawrence", name: "Tom Lawrence", title: "Magistrate, District 2" },
      { key: "williams", name: "Rick Williams", title: "Magistrate, District 3" },
      { key: "mcwhorter", name: "Rex McWhorter", title: "Magistrate, District 4" },
      { key: "aldridge", name: "Eric Aldridge", title: "Magistrate, District 5" },
      { key: "cummings", name: "Ron Cummings", title: "Magistrate, District 6" },
    ],
  },
];

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// "Beasley-Brown", "Esquire Lasley", or an OCR slip -> the roster entry.
function memberFor(roster, rawName) {
  const clean = rawName
    .toLowerCase()
    .replace(/^(mayor|commissioner|esquire|magistrate|judge[- ]executive|judge)\s+/, "")
    .replace(/[^a-z]/g, "");
  return roster.find((m) => clean.startsWith(m.key.slice(0, 4))) ?? null;
}

const yeaCountOf = (vote) => vote.yeaCount ?? vote.yeas?.length ?? 0;
const nayCountOf = (vote) => vote.nayCount ?? vote.nays.length;

function buildRecords(body, meetings, votes) {
  const records = new Map(
    body.roster.map((m) => [
      m.key,
      { ...m, cast: 0, yea: 0, nay: 0, abstain: 0, absent: 0, meetingsMissed: 0, motions: 0, seconds: 0, dissents: [] },
    ])
  );
  const splits = [];
  const unrecognized = new Set();
  let rollCalls = 0;
  let meetingCount = 0;
  let unattributed = 0;

  const bodyMeetings = meetings
    .filter((m) => body.match(m) && votes[m.url])
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const meeting of bodyMeetings) {
    const { votes: meetingVotes = {}, procedural = [], minutesUrl } = votes[meeting.url];
    meetingCount++;

    const itemTextFor = (vote) =>
      meeting.items.find((i) => (i.ref ?? `ITEM-${i.number}`) === vote.id)?.text ?? vote.description ?? vote.id;

    const ballots = [
      ...Object.values(meetingVotes).map((vote) => ({ vote, procedural: false, text: itemTextFor(vote) })),
      ...procedural.map((vote) => ({ vote, procedural: true, text: vote.description })),
    ];

    // For "meetings missed": how many credited votes this meeting had,
    // and how many of them each member missed.
    let creditedVotesHere = 0;
    const missedHere = new Map();

    for (const { vote, procedural: isProcedural, text } of ballots) {
      rollCalls++;
      const context = { meeting, minutesUrl, vote, text, procedural: isProcedural };

      if (nayCountOf(vote) > 0) splits.push(context);

      // Movers and seconders are always named, even when votes are counts only.
      const mover = vote.motion && memberFor(body.roster, vote.motion);
      const seconder = vote.second && memberFor(body.roster, vote.second);
      if (mover) records.get(mover.key).motions++;
      if (seconder) records.get(seconder.key).seconds++;

      // Counts only, with no way to tell who voted which way: skip individual totals.
      if (!Array.isArray(vote.yeas)) {
        unattributed++;
        continue;
      }
      creditedVotesHere++;

      const votedThisTime = new Set();
      const tally = (names, field) => {
        for (const name of names) {
          const member = memberFor(body.roster, name);
          if (!member) {
            unrecognized.add(name);
            continue;
          }
          const record = records.get(member.key);
          record[field]++;
          if (field !== "abstain") record.cast++;
          if (field === "nay") record.dissents.push(context);
          votedThisTime.add(member.key);
        }
      };

      tally(vote.yeas, "yea");
      tally(vote.nays, "nay");
      tally(vote.abstain, "abstain");

      for (const record of records.values()) {
        if (!votedThisTime.has(record.key)) {
          record.absent++;
          missedHere.set(record.key, (missedHere.get(record.key) ?? 0) + 1);
        }
      }
    }

    // Missed every credited vote at this meeting = missed the meeting.
    if (creditedVotesHere > 0) {
      for (const record of records.values()) {
        if (missedHere.get(record.key) === creditedVotesHere) record.meetingsMissed++;
      }
    }
  }

  if (unrecognized.size) {
    console.warn(`${body.label}: names that didn't match the roster:`, [...unrecognized]);
  }

  return { records: [...records.values()], splits, rollCalls, meetingCount, unattributed };
}

const VIDEO_PAGES = {
  city: "https://www.bgky.org/videos",
  county: "https://www.youtube.com/@warrencountykygov",
};

function sourceLinks(meeting, minutesUrl) {
  const bodyKey = meeting.body.includes("County") ? "county" : "city";
  const anchor = `meeting-${meeting.date}-${bodyKey}`;
  const videoUrl = meeting.videoUrl ?? VIDEO_PAGES[bodyKey];
  const videoLabel = meeting.videoUrl ? "Video" : "Meeting videos";
  const newTab = `<span aria-hidden="true">↗</span><span class="visually-hidden">(opens in new tab)</span>`;

  return `
    <p class="source-links">
      <a class="source-link" href="./#${anchor}">Meeting on Civic Watch</a>
      <a class="source-link" href="${escapeHtml(meeting.url)}" target="_blank" rel="noopener">Agenda ${newTab}</a>
      ${minutesUrl ? `<a class="source-link" href="${escapeHtml(minutesUrl)}" target="_blank" rel="noopener">Minutes ${newTab}</a>` : ""}
      <a class="source-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">${videoLabel} ${newTab}</a>
    </p>`;
}

function splitHtml({ meeting, minutesUrl, vote, text, procedural }) {
  const failed = /denied|defeated|failed/.test(vote.outcome ?? "");

  let noLine;
  if (vote.nays.length && vote.correction) {
    noLine = `${vote.nays.map(escapeHtml).join(", ")} <span class="quiet">(source: ${escapeHtml(vote.correction.source)}; not recorded in the minutes)</span>`;
  } else if (vote.nays.length) {
    noLine = vote.nays.map(escapeHtml).join(", ");
  } else {
    noLine = `<span class="quiet">Not named in the minutes</span>`;
  }

  const yesLine = Array.isArray(vote.yeas)
    ? `<p class="split-who"><strong>Voted yes:</strong> ${vote.yeas.map(escapeHtml).join(", ")}${vote.inferred ? ` <span class="quiet">(from attendance)</span>` : ""}</p>`
    : "";

  const noteLine = vote.note
    ? `<p class="split-note"><strong>Note:</strong> ${escapeHtml(vote.note.text)} <span class="quiet">(source: ${escapeHtml(vote.note.source)})</span></p>`
    : "";

  return `
    <article class="split-vote">
      <p class="split-meta">
        <span class="vote split">${yeaCountOf(vote)}–${nayCountOf(vote)}</span>
        ${formatDate(meeting.date)}
        ${procedural ? `<span class="tag reading">Procedural motion</span>` : ""}
        ${failed ? `<span class="vote failed">Failed</span>` : ""}
        ${vote.note ? `<span class="tag reading">See note</span>` : ""}
      </p>
      <p class="split-text">${escapeHtml(text)}</p>
      <p class="split-who"><strong>Voted no:</strong> ${noLine}</p>
      ${yesLine}
      ${vote.tally ? `<p class="split-who quiet">Recorded in the minutes as: “${escapeHtml(vote.tally)}”</p>` : ""}
      ${noteLine}
      ${sourceLinks(meeting, minutesUrl)}
    </article>`;
}

// The Absent stat. Missed a whole meeting: "1 meeting" over "Absent · 2 votes".
// Only missed some votes: "3 votes" over "Absent".
function absentStat(record) {
  const votesWord = record.absent === 1 ? "vote" : "votes";
  if (!record.meetingsMissed) {
    return `<div><dt>Absent</dt><dd>${record.absent} <small>${votesWord}</small></dd></div>`;
  }
  const meetingsWord = record.meetingsMissed === 1 ? "meeting" : "meetings";
  return `<div><dt>Absent · ${record.absent} ${votesWord}</dt><dd>${record.meetingsMissed} <small>${meetingsWord}</small></dd></div>`;
}

function officialHtml(record, bodyKey) {
  const yesRate = record.cast ? Math.round((record.yea / record.cast) * 100) : 0;
  const dissentList = record.dissents.length
    ? `<details>
         <summary>${record.dissents.length} no vote${record.dissents.length === 1 ? "" : "s"}</summary>
         <ul class="dissent-list">
           ${record.dissents
             .map((d) => `<li><span class="dissent-date">${formatDate(d.meeting.date)}${d.vote.correction ? " · from video, not minutes" : ""}</span> ${escapeHtml(d.text)}</li>`)
             .join("")}
         </ul>
       </details>`
    : `<p class="quiet">No "no" votes recorded.</p>`;

  return `
    <article class="official ${bodyKey}">
      <p class="official-title">${escapeHtml(record.title)}</p>
      <h4>${escapeHtml(record.name)}</h4>
      <dl class="stats">
        <div><dt>Votes cast</dt><dd>${record.cast}</dd></div>
        <div><dt>Voted yes</dt><dd>${record.yea} <small>(${yesRate}%)</small></dd></div>
        <div><dt>Voted no</dt><dd>${record.nay}</dd></div>
        ${absentStat(record)}
        <div><dt>Motions made</dt><dd>${record.motions}</dd></div>
        <div><dt>Seconds</dt><dd>${record.seconds}</dd></div>
      </dl>
      ${dissentList}
    </article>`;
}

function sectionHtml({ body, records, splits, rollCalls, meetingCount, unattributed }) {
  const stats =
    `${rollCalls} roll-call votes from ${meetingCount} meetings · ` +
    `${splits.length} ${splits.length === 1 ? "was" : "were"} not unanimous`;

  return `
    <section class="record-body" aria-labelledby="heading-${body.key}">
      <h2 id="heading-${body.key}">${escapeHtml(body.label)}</h2>
      <p class="section-note">${stats}</p>
      ${body.note ? `<p class="section-note">${escapeHtml(body.note)}</p>` : ""}
      ${unattributed ? `<p class="section-note">${unattributed} vote${unattributed === 1 ? "" : "s"} couldn’t be credited to individuals.</p>` : ""}

      <h3 class="subhead">Split votes</h3>
      ${splits.map(splitHtml).join("") || `<p class="quiet">No split votes recorded yet.</p>`}

      <h3 class="subhead">Members</h3>
      <div class="officials">${records.map((r) => officialHtml(r, body.key)).join("")}</div>
    </section>`;
}

// ---------- Start ----------

const [meetingsResponse, votesResponse] = await Promise.all([
  fetch("data/meetings.json"),
  fetch("data/votes.json"),
]);
const { meetings } = await meetingsResponse.json();
const votes = votesResponse.ok ? await votesResponse.json() : {};

const sections = BODIES.map((body) => ({ body, ...buildRecords(body, meetings, votes) }));

const totalVotes = sections.reduce((sum, s) => sum + s.rollCalls, 0);
const totalSplits = sections.reduce((sum, s) => sum + s.splits.length, 0);
document.querySelector("#record-summary").textContent =
  `${totalVotes} roll-call votes across both bodies. ${totalSplits} ${totalSplits === 1 ? "was" : "were"} not unanimous.`;

document.querySelector("#bodies").innerHTML = sections.map(sectionHtml).join("");
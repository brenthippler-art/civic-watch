import { cityRef } from "../itemRefs.js";

// All-caps item headings. Case-sensitive, so mixed-case mentions don't match.
// Tolerates OCR slips like "MUNICIPAL, ORDER", "NO,", and "2026 —201".
const HEADING = /(MUNICIPAL[,.]?\s+ORDER|ORDINANCE)\s+NO[.,]?\s*(?:BG)?\s*\d{4}\s*[–—-]+\s*\d+/g;

// Where a list of names ends.
const NAME_LIST_END = String.raw`(?=\s*(?:Abstain|Absent|Motion\b|Municipal Order No|Ordinance No|First Reading|Second Reading|The motion|[A-Z]{4,})|$)`;

// "ROLL CALL: Voting Yea: … Voting Nay: …", tolerant of OCR slips
// ("VotingNay", "Yca", "Ney", a ; or . instead of :).
const ROLL_CALL = new RegExp(
  String.raw`ROLL\s*CALL\s*[:;.,]?\s*Voting\s*Y[ec]a\s*[:;.,]?\s*(.+?)\s*Voting\s*N[ae]y\s*[:;.,]?\s*(.+?)${NAME_LIST_END}`,
  "g"
);

const ABSTAIN = new RegExp(String.raw`^\s*Abstain\w*\s*[:;.,]?\s*(.+?)${NAME_LIST_END}`);

// Text after a roll call that starts with an all-caps heading
// ("REGULAR AGENDA MUNICIPAL ORDER NO. …") means there was no result sentence.
const STARTS_WITH_HEADING = /^\s*[A-Z][A-Z0-9 .,&'—–-]{7,}/;

// The result sentence right after a roll call, in mixed case:
// "Municipal Order No. 2026 — 158 failed…", "First Reading of Ordinance No. BG2026 — 17 was approved…"
// Case-sensitive on purpose: the NEXT item's all-caps heading must not match.
const RESULT_ITEM = /^\s*(?:(?:First|Second) Reading of )?((?:Municipal Order|Ordinance) No[.,]?\s*(?:BG)?\s*\d{4}\s*[–—-]+\s*\d+)/;

// "Motion to add … to the agenda … was approved"
const PROCEDURAL = /^\s*(Motion to .+?)\s+(?:was|were)\s/i;

// No "was" required, so "158 failed for a lack of majority vote" is caught.
const OUTCOME = /\b(approved|adopted|denied|defeated|failed|tabled|postponed|withdrawn)\b/i;

// The motion to consider an item ("…for consideration", "…for the second and binding reading").
const ITEM_MOTION = /Motion was made\s*by (.+?) and seconded\s*by (.+?) for /;

// A procedural motion and what it was for:
// "…seconded by Bailey to approve the minutes of the June 2, 2026 meeting."
// The purpose ends at a period followed by a capital letter, so "No. 2026" doesn't cut it short.
const PROCEDURAL_MOTION = /Motion was made\s*by (.+?) and seconded\s*by (.+?) (to .{3,200}?)\.(?=\s+[A-Z]|\s*$)/g;

// "Parrigin, Bailey, Beasley-Brown, Hill and Alcott" -> ["Parrigin", …]
function splitNames(list) {
  if (!list || /^none/i.test(list.trim())) return [];
  return list
    .replace(/\.$/, "")
    .split(/,|\band\b/)
    .map((name) => name.trim())
    .filter(Boolean);
}

// "to approve the minutes of June 2" -> "Motion to approve the minutes of June 2"
function motionDescription(purpose) {
  return `Motion ${purpose.trim()}`;
}

export function parseCityMinutes(text) {
  // Flatten to one line so wrapped sentences read as one.
  const flat = text.replace(/\s+/g, " ");

  // 1. Every item heading, with the motion and second for that item.
  //    Headings only supply motions. They never decide which roll call
  //    belongs to which item.
  const headings = [...flat.matchAll(HEADING)].map((heading, i, all) => {
    const end = i + 1 < all.length ? all[i + 1].index : flat.length;
    const motion = flat.slice(heading.index, end).match(ITEM_MOTION);
    return {
      id: cityRef(heading[0]),
      index: heading.index,
      motion: motion?.[1].trim() ?? null,
      second: motion?.[2].trim() ?? null,
    };
  });
  const headingById = new Map(headings.filter((h) => h.id).map((h) => [h.id, h]));

  // 2. Every roll call, matched to what it was about.
  const votes = {};
  const procedural = [];
  let previousEnd = 0;

  for (const rollCall of flat.matchAll(ROLL_CALL)) {
    const end = rollCall.index + rollCall[0].length;
    const textBefore = flat.slice(previousEnd, rollCall.index);
    let textAfter = flat.slice(end, end + 400);
    previousEnd = end;

    const abstain = textAfter.match(ABSTAIN);
    if (abstain) textAfter = textAfter.slice(abstain[0].length);

    // The result sentence, if there is one. If the next thing is an all-caps
    // heading, there's no result sentence, and we must not read into the next item.
    const hasResultSentence = !STARTS_WITH_HEADING.test(textAfter);
    const resultSentence = hasResultSentence ? textAfter.slice(0, 250) : "";

    const ballot = {
      yeas: splitNames(rollCall[1]),
      nays: splitNames(rollCall[2]),
      abstain: splitNames(abstain?.[1]),
      outcome: resultSentence.match(OUTCOME)?.[1].toLowerCase() ?? null,
    };

    // Only count it as an item vote if the result sentence names the item.
    const proceduralMatch = resultSentence.match(PROCEDURAL);
    const result = resultSentence.match(RESULT_ITEM);
    const id = !proceduralMatch && result ? cityRef(result[1]) : null;

    if (!id) {
      // Not clearly about an agenda item: record it as procedural.
      // Describe it by, in order: "Motion to …" in the result sentence,
      // the motion that preceded the roll call, or the result sentence itself.
      const mover = [...textBefore.matchAll(PROCEDURAL_MOTION)].at(-1);
      const description =
        proceduralMatch?.[1] ??
        (mover && motionDescription(mover[3])) ??
        resultSentence.match(/^\s*(.+?)\s+(?:was|were)\s/)?.[1] ??
        "Vote without a recorded description";

      procedural.push({
        description: description.trim().slice(0, 200),
        motion: mover?.[1].trim() ?? null,
        second: mover?.[2].trim() ?? null,
        ...ballot,
      });
      continue;
    }

    // Same item voted on twice at one meeting? Keep both: "MO-2026-5", "MO-2026-5#2".
    const repeats = Object.keys(votes).filter((k) => k === id || k.startsWith(`${id}#`)).length;
    const key = repeats ? `${id}#${repeats + 1}` : id;

    const heading = headingById.get(id);
    votes[key] = { id, motion: heading?.motion ?? null, second: heading?.second ?? null, ...ballot };
  }

  // Uppercase "ROLL CALL" only, so "a roll call vote was taken" isn't counted.
  const rollCallCount = (flat.match(/ROLL\s*CALL/g) || []).length;

  return { votes, procedural, rollCallCount };
}
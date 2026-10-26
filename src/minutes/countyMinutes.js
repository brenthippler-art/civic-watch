// Number words in vote counts: "seven yeas, no nays"
const WORDS = { no: 0, none: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function toCount(word) {
  if (word == null) return 0;
  if (/^\d+$/.test(word)) return Number(word);
  return WORDS[word.toLowerCase()] ?? null;
}

// "Present were: Esquire Eric Aldridge, EsquireRon Cummings, …, and Esquire Rick Williams."
const PRESENT = /Present were:?\s*(.+?)\.\s/;

// Last names from that list. \s* after the title handles "EsquireRon Cummings".
const FULL_NAME_LAST = /(?:Esquire|Magistrate)\s*[A-Z][\w'-]*\s+([A-Z][\w'-]+)/g;

// Only present when the judge-executive attends: "Presiding Judge Executive Doug Gorman."
const PRESIDING_JUDGE = /Presiding\s+Judge[- ]?Executive\s+(?:[A-Z][\w'.-]*\s+)*([A-Z][\w'-]+)\./;

// Stops a match from running past one vote into the next.
const NOT_A_NEW_ROLL_CALL = String.raw`(?:(?!Upon\s+roll\s+call).)`;

// One vote:
// "Esquire Aldridge moved, seconded by Esquire Cummings to approve … Upon roll call the vote was:
//  seven yeas, no nays. It is so ordered. (See Fiscal Court Order Book …). (7)"
// The "(7)" is optional: votes not on the agenda (electing a presiding officer,
// granting a hearing) have no item number and become procedural votes.
const COUNTY_VOTE = new RegExp(
  String.raw`Esquire\s*(\S+?)\s+moved\s*,?\s*seconded\s+by\s+(?:Esquire\s*)?(\S+?)\s+((?:to|that)\s${NOT_A_NEW_ROLL_CALL}+?)\.?\s*` +
  String.raw`Upon\s+roll\s+call\s+the\s+vote\s+was:?\s*(${NOT_A_NEW_ROLL_CALL}+?)\.\s*` +
  String.raw`(It\s+is\s+so\s+ordered|(?:The\s+)?[Mm]otion\s+(?:failed|carried))\.?\s*` +
  String.raw`(?:\(See[^)]*\)\.?\s*)?(?:\((\d{1,3})\))?`,
  "g"
);

// Names inside a vote tally, e.g. "five yeas, two nays (Esquire Lasley and Esquire Williams)"
const TALLY_NAME = /(?:Esquire|Magistrate|Judge(?:[- ]Executive)?)\s*([A-Z][\w'-]+)/g;
const ABSTAIN_NAME = /(?:Esquire|Magistrate|Judge(?:[- ]Executive)?)\s*([A-Z][\w'-]+)\s+(?:abstain|pass)/gi;

function parseTally(tally) {
  const yea = tally.match(/(\w+)\s+yeas?\b/i);
  const nay = tally.match(/(\w+)\s+nays?\b/i);
  const abstain = tally.match(/(\w+)\s+abstain/i);

  const abstainNames = [...tally.matchAll(ABSTAIN_NAME)].map((m) => m[1]);

  // Names mentioned after the nay count are the "no" voters (minus any abstainers).
  const afterNay = nay ? tally.slice(tally.indexOf(nay[0]) + nay[0].length) : "";
  const nayNames = [...afterNay.matchAll(TALLY_NAME)]
    .map((m) => m[1])
    .filter((name) => !abstainNames.includes(name));

  return {
    yeaCount: toCount(yea?.[1]),
    nayCount: toCount(nay?.[1]),
    abstainCount: abstain ? toCount(abstain[1]) : abstainNames.length,
    nayNames,
    abstainNames,
  };
}

export function parseCountyMinutes(text) {
  const flat = text.replace(/\s+/g, " ");

  // Who was there: the magistrates listed, plus the judge-executive only if presiding.
  const presentMatch = flat.match(PRESENT);
  const magistrates = presentMatch ? [...presentMatch[1].matchAll(FULL_NAME_LAST)].map((m) => m[1]) : [];
  const judge = flat.match(PRESIDING_JUDGE)?.[1] ?? null;
  const present = judge ? [...magistrates, judge] : magistrates;

  const votes = {};
  const procedural = [];
  const spans = []; // where each matched vote starts and ends in the text

  for (const match of flat.matchAll(COUNTY_VOTE)) {
    const [, mover, seconder, purpose, tallyText, ending, itemNumber] = match;
    spans.push([match.index, match.index + match[0].length]);
    const tally = parseTally(tallyText);

    // Work out each person's vote only if the numbers fully add up.
    const accounted = (tally.yeaCount ?? 0) + (tally.nayCount ?? 0) + (tally.abstainCount ?? 0);
    const namesComplete =
      tally.nayNames.length === tally.nayCount && tally.abstainNames.length === tally.abstainCount;
    const canInfer = present.length > 0 && accounted === present.length && namesComplete;

    const yeas = canInfer
      ? present.filter((name) => !tally.nayNames.includes(name) && !tally.abstainNames.includes(name))
      : null; // null = counts only, can't credit individuals

    const failed = /failed/i.test(ending) || (tally.nayCount ?? 0) >= (tally.yeaCount ?? 0);

    const vote = {
      description: `Motion ${purpose.trim()}`.slice(0, 200),
      motion: mover.replace(/,$/, ""),
      second: seconder.replace(/,$/, ""),
      tally: tallyText.trim(), // the vote exactly as the minutes wrote it
      yeaCount: tally.yeaCount,
      nayCount: tally.nayCount,
      abstainCount: tally.abstainCount,
      yeas,
      nays: tally.nayNames,
      abstain: tally.abstainNames,
      inferred: yeas !== null,
      outcome: failed ? "failed" : "approved",
    };

    // No item number: not an agenda item, so it's a procedural vote.
    if (!itemNumber) {
      procedural.push(vote);
      continue;
    }

    const id = `ITEM-${Number(itemNumber)}`;
    const repeats = Object.keys(votes).filter((k) => k === id || k.startsWith(`${id}#`)).length;
    const key = repeats ? `${id}#${repeats + 1}` : id;
    votes[key] = { id, ...vote };
  }

  // Every "Upon roll call" the vote pattern didn't cover, with surrounding text.
  const unmatched = [...flat.matchAll(/Upon\s+roll\s+call/gi)]
    .filter((rc) => !spans.some(([start, end]) => rc.index >= start && rc.index < end))
    .map((rc) => flat.slice(Math.max(0, rc.index - 450), rc.index + 250));

  return { votes, procedural, rollCallCount: spans.length + unmatched.length, unmatched, present };
}
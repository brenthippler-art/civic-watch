import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCountyMinutes } from "../src/minutes/countyMinutes.js";
import { fixture } from "./helpers.js";

const ALL_SEVEN = ["Aldridge", "Cummings", "Lasley", "Lawrence", "McWhorter", "Williams", "Gorman"];

const FIXTURES = {
  oct15: "2026-10-15_warren-county-fiscal-court_minutes.txt",
  jul30: "2026-07-30_warren-county-fiscal-court_minutes.txt",
  aug13: "2026-08-13_warren-county-fiscal-court_minutes.txt",
  mar26: "2026-03-26_warren-county-fiscal-court_minutes.txt",
  jan14: "2026-01-14_warren-county-fiscal-court_minutes-special.txt",
};

const parsed = Object.fromEntries(
  Object.entries(FIXTURES).map(([key, file]) => [key, parseCountyMinutes(fixture(file))])
);

for (const [key, result] of Object.entries(parsed)) {
  test(`${key}: every roll call is read, none skipped or merged`, () => {
    const read = Object.keys(result.votes).length + result.procedural.length;
    assert.equal(result.unmatched.length, 0, `unread roll calls:\n${result.unmatched.join("\n---\n")}`);
    assert.equal(read, result.rollCallCount);
  });
}

test("Oct 15: 28 item votes, all 7–0 and credited to all seven members", () => {
  const { votes, present } = parsed.oct15;
  assert.deepEqual([...present].sort(), [...ALL_SEVEN].sort());
  assert.equal(Object.keys(votes).length, 28);
  for (const vote of Object.values(votes)) {
    assert.equal(vote.yeaCount, 7);
    assert.equal(vote.yeas.length, 7);
    assert.equal(vote.inferred, true);
  }
});

test("Jul 30: items 30 and 31 are 6–1 with the 'no' unnamed, so nobody is credited", () => {
  for (const id of ["ITEM-30", "ITEM-31"]) {
    const vote = parsed.jul30.votes[id];
    assert.ok(vote, `${id} should be found`);
    assert.equal(vote.yeaCount, 6);
    assert.equal(vote.nayCount, 1);
    assert.deepEqual(vote.nays, []);
    assert.equal(vote.yeas, null);
    assert.equal(vote.tally, "six yeas, one nay");
  }
});

test("Jul 30: the unnumbered hearing vote is procedural, not merged into the next item", () => {
  const { votes, procedural } = parsed.jul30;
  assert.equal(Object.keys(votes).length, 36);
  assert.equal(procedural.length, 1);
  assert.match(procedural[0].description, /grant a hearing/i);
  assert.equal(procedural[0].motion, "Cummings");
  assert.equal(procedural[0].yeaCount, 7);
});

test("Aug 13: McWhorter absent; item 7 is 5–1 with the 'no' unnamed", () => {
  const { votes, present } = parsed.aug13;
  assert.equal(present.includes("McWhorter"), false);
  assert.equal(present.length, 6);
  const vote = votes["ITEM-7"];
  assert.equal(vote.yeaCount, 5);
  assert.equal(vote.nayCount, 1);
  assert.equal(vote.yeas, null);
});

test("Mar 26: judge absent, six magistrates present, presiding vote not credited (5 of 6)", () => {
  const { votes, procedural, present } = parsed.mar26;
  assert.equal(present.length, 6);
  assert.equal(present.includes("Gorman"), false);
  assert.equal(Object.keys(votes).length, 32);
  assert.equal(procedural.length, 1);
  assert.match(procedural[0].description, /preside/i);
  assert.equal(procedural[0].yeaCount, 5);
  assert.equal(procedural[0].yeas, null);
});

test("Jan 14: 'EsquireRon Cummings' (no space) is still read as present", () => {
  const { present, votes, procedural } = parsed.jan14;
  assert.ok(present.includes("Cummings"));
  assert.equal(present.length, 6);
  assert.equal(Object.keys(votes).length, 1);
  assert.equal(procedural.length, 1);
});

const HEADER =
  "Present were: Esquire Eric Aldridge, Esquire Ron Cummings, Esquire Scott Lasley, " +
  "Esquire Tom Lawrence, and Esquire Rex McWhorter, and Esquire Rick Williams. " +
  "Presiding Judge Executive Doug Gorman. ********** ";

test("Named 'no' votes are credited, and yes votes are worked out from attendance", () => {
  const text =
    HEADER +
    "Esquire Lasley moved, seconded by Esquire Williams to approve a rezoning. " +
    "Upon roll call the vote was: five yeas, two nays (Esquire Aldridge and Esquire Cummings). " +
    "It is so ordered. (9)";

  const vote = parseCountyMinutes(text).votes["ITEM-9"];
  assert.ok(vote, "ITEM-9 should be found");
  assert.deepEqual([...vote.nays].sort(), ["Aldridge", "Cummings"]);
  assert.deepEqual([...vote.yeas].sort(), ["Gorman", "Lasley", "Lawrence", "McWhorter", "Williams"]);
  assert.equal(vote.inferred, true);
});

test("An unreadable vote is reported as unread, never merged into the next vote", () => {
  const text =
    HEADER +
    "Esquire Aldridge moved, seconded by Esquire Cummings to do the first thing. " +
    "Upon roll call the vote was: seven yeas, no nays. So ordered. ********** " +
    "Esquire Lasley moved, seconded by Esquire Lawrence to do the second thing. " +
    "Upon roll call the vote was: six yeas, one nay. It is so ordered. (12)";

  const { votes, unmatched } = parseCountyMinutes(text);
  assert.equal(unmatched.length, 1, "the oddly worded vote should be reported as unread");
  const vote = votes["ITEM-12"];
  assert.equal(vote.motion, "Lasley", "item 12 must keep its own mover, not borrow the first vote's");
  assert.equal(vote.nayCount, 1);
});
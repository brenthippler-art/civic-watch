import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCityMinutes } from "../src/minutes/cityMinutes.js";
import { fixture } from "./helpers.js";

const june16 = parseCityMinutes(fixture("2026-06-16_bowling-green-city-commission_minutes.txt"));

test("June 16: every roll call is read (28 item + 2 procedural = 30)", () => {
  assert.equal(june16.rollCallCount, 30);
  assert.equal(Object.keys(june16.votes).length, 28);
  assert.equal(june16.procedural.length, 2);
});

test("June 16: data center ordinance BG2026-6 is adopted 5–0, not the procedural 4–1", () => {
  const vote = june16.votes["ORD-2026-6"];
  assert.ok(vote, "ORD-2026-6 should be found");
  assert.equal(vote.yeas.length, 5);
  assert.deepEqual(vote.nays, []);
  assert.equal(vote.outcome, "adopted");
});

test("June 16: six-month pause MO 2026-158 fails 2–3", () => {
  const vote = june16.votes["MO-2026-158"];
  assert.ok(vote, "MO-2026-158 should be found");
  assert.deepEqual([...vote.yeas].sort(), ["Bailey", "Beasley-Brown"]);
  assert.deepEqual([...vote.nays].sort(), ["Alcott", "Hill", "Parrigin"]);
  assert.equal(vote.outcome, "failed");
});

test("June 16: the motion to add MO 158 is a procedural 4–1 vote, with Alcott voting no", () => {
  const vote = june16.procedural.find((p) => p.description.startsWith("Motion to add"));
  assert.ok(vote, "the add-to-agenda motion should be a procedural vote");
  assert.equal(vote.yeas.length, 4);
  assert.deepEqual(vote.nays, ["Alcott"]);
});

test("June 16: no vote is filed under an empty or missing ID", () => {
  for (const [key, vote] of Object.entries(june16.votes)) {
    assert.match(key, /^(MO|ORD)-\d{4}-\d+/);
    assert.ok(vote.id);
  }
});

test("OCR slips still parse: 'MUNICIPAL, ORDER', 'NO,', '—201', 'VotingNay'", () => {
  const text =
    "MUNICIPAL, ORDER NO, 2026 —201 MUNICIPAL ORDER APPROVING A CONTRACT " +
    "Summary of Municipal Order No. 2026 — 201 was read by the City Clerk. " +
    "Motion was made by Parrigin and seconded by Bailey for consideration of said Municipal Order. " +
    "ROLL CALL: Voting Yea: Bailey, Hill and Alcott VotingNay: Parrigin " +
    "Municipal Order No. 2026 —201 was approved by majority vote.";

  const { votes } = parseCityMinutes(text);
  const vote = votes["MO-2026-201"];
  assert.ok(vote, "MO-2026-201 should be found");
  assert.deepEqual(vote.yeas, ["Bailey", "Hill", "Alcott"]);
  assert.deepEqual(vote.nays, ["Parrigin"]);
  assert.equal(vote.motion, "Parrigin");
  assert.equal(vote.second, "Bailey");
  assert.equal(vote.outcome, "approved");
});

test("A roll call whose result doesn't name an item is procedural, never pinned on an item", () => {
  const text =
    "ORDINANCE NO. BG2026 — 9 ORDINANCE AMENDING SOMETHING " +
    "Motion was made by Hill and seconded by Alcott to amend said Ordinance. " +
    "ROLL CALL: Voting Yea: Bailey, Hill and Alcott Voting Nay: None " +
    "The amendment was approved by unanimous vote.";

  const { votes, procedural } = parseCityMinutes(text);
  assert.equal(Object.keys(votes).length, 0, "the amendment must not count as the ordinance's vote");
  assert.equal(procedural.length, 1);
  assert.equal(procedural[0].description, "Motion to amend said Ordinance");
  assert.equal(procedural[0].motion, "Hill");
  assert.equal(procedural[0].second, "Alcott");
});
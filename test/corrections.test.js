import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCorrections } from "../src/corrections.js";

const meetings = [{ url: "jul9", body: "Warren County Fiscal Court", date: "2026-07-09" }];

// A fresh copy for each test, since applyCorrections changes the votes in place.
function votesArchive() {
  return {
    jul9: {
      present: ["Aldridge", "Cummings", "Lasley", "Lawrence", "McWhorter", "Williams", "Gorman"],
      votes: {
        "ITEM-30": { id: "ITEM-30", yeaCount: 6, nayCount: 1, abstainCount: 0, yeas: null, nays: [], abstain: [] },
      },
    },
  };
}

const KEY = "county|2026-07-09|ITEM-30";

test("A valid correction names the 'no' voter and works out the yes voters", () => {
  const archive = votesArchive();
  const problems = applyCorrections(archive, meetings, {
    [KEY]: { nays: ["Cummings"], source: "Meeting video" },
  });
  const vote = archive.jul9.votes["ITEM-30"];
  assert.deepEqual(problems, []);
  assert.deepEqual(vote.nays, ["Cummings"]);
  assert.equal(vote.yeas.length, 6);
  assert.equal(vote.yeas.includes("Cummings"), false);
  assert.equal(vote.correction.source, "Meeting video");
});

test("A correction with the wrong number of names is rejected and changes nothing", () => {
  const archive = votesArchive();
  const problems = applyCorrections(archive, meetings, {
    [KEY]: { nays: ["Cummings", "Lasley"], source: "Meeting video" },
  });
  assert.equal(problems.length, 1);
  assert.deepEqual(archive.jul9.votes["ITEM-30"].nays, []);
});

test("A correction naming someone who wasn't present is rejected", () => {
  const archive = votesArchive();
  archive.jul9.present = archive.jul9.present.filter((n) => n !== "McWhorter");
  const problems = applyCorrections(archive, meetings, {
    [KEY]: { nays: ["McWhorter"], source: "Meeting video" },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /wasn't listed as present/);
});

test("A correction without a source is rejected", () => {
  const problems = applyCorrections(votesArchive(), meetings, { [KEY]: { nays: ["Cummings"] } });
  assert.equal(problems.length, 1);
});

test("A note-only entry adds the note and leaves the tally alone", () => {
  const archive = votesArchive();
  applyCorrections(archive, meetings, { [KEY]: { note: "Video differs", source: "Meeting video" } });
  const vote = archive.jul9.votes["ITEM-30"];
  assert.equal(vote.note.text, "Video differs");
  assert.deepEqual(vote.nays, []);
  assert.equal(vote.yeas, null);
});

test("A correction for a vote that doesn't exist is reported", () => {
  const problems = applyCorrections(votesArchive(), meetings, {
    "county|2026-07-09|ITEM-99": { nays: ["Cummings"], source: "Meeting video" },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no matching vote/);
});
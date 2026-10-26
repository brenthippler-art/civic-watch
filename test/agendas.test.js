import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAgendaItems } from "../src/splitItems.js";
import { extractMeetingTime } from "../src/meetingTime.js";
import { cityRef } from "../src/itemRefs.js";
import { ordinanceInfo } from "../public/ordinance-key.js";
import { fixture } from "./helpers.js";

const cityAgendaText = fixture("2026-10-20_bowling-green-city-commission_agenda.txt");
const countyAgendaText = fixture("2026-10-15_warren-county-fiscal-court_agenda.txt");
const cityItems = splitAgendaItems(cityAgendaText);
const countyItems = splitAgendaItems(countyAgendaText);
const byNumber = (items, n) => items.find((i) => i.number === n);

test("City Oct 20 agenda: 29 items, with routine items tagged", () => {
  assert.equal(cityItems.length, 29);
  assert.equal(byNumber(cityItems, 1).routine, true, "promotions are routine");
  assert.equal(byNumber(cityItems, 11).routine, false, "a contract change order is not routine");
  assert.equal(byNumber(cityItems, 26).routine, true, "travel expenses are routine");
});

test("City Oct 20 agenda: item 23 is Ordinance BG2026-17, first reading", () => {
  const item = byNumber(cityItems, 23);
  assert.equal(item.ref, "ORD-2026-17");
  assert.match(item.text, /First Reading/);
});

test("County Oct 15 agenda: 32 items, with opening and closing items routine", () => {
  assert.equal(countyItems.length, 32);
  for (const n of [1, 2, 3, 4, 5, 6, 31, 32]) {
    assert.equal(byNumber(countyItems, n).routine, true, `item ${n} should be routine`);
  }
  const item7 = byNumber(countyItems, 7);
  assert.equal(item7.routine, false);
  assert.match(item7.text, /Ordinance #26-22WC/);
});

test("Meeting times are read from the agenda heading", () => {
  assert.equal(extractMeetingTime(cityAgendaText), "4:30 PM");
  assert.equal(extractMeetingTime(countyAgendaText), "9:00 AM");
  assert.equal(extractMeetingTime("Special Called Meeting 3:00 p.m."), "3:00 PM");
  assert.equal(extractMeetingTime("No time listed here"), null);
});

test("cityRef normalizes order and ordinance numbers, including OCR slips", () => {
  assert.equal(cityRef("Municipal Order No. 2026 – 215 Municipal Order approving…"), "MO-2026-215");
  assert.equal(cityRef("ORDINANCE NO. BG2026 — 6"), "ORD-2026-6");
  assert.equal(cityRef("MUNICIPAL, ORDER NO, 2026 —201"), "MO-2026-201");
  assert.equal(cityRef("Approve the budget"), null);
});

test("ordinanceInfo groups readings of the same ordinance", () => {
  const city = { body: "Bowling Green City Commission" };
  const county = { body: "Warren County Fiscal Court" };

  assert.deepEqual(ordinanceInfo(city, { ref: "ORD-2026-17", text: "" }), {
    key: "city-ORD-2026-17",
    label: "Ordinance BG2026-17",
  });
  assert.equal(ordinanceInfo(city, { ref: "MO-2026-215", text: "" }), null);
  assert.equal(
    ordinanceInfo(county, { text: "Approve Ordinance #26- 18WC Rezoning property" }).key,
    "county-26-18WC"
  );
  assert.equal(ordinanceInfo(county, { text: "Approve budget transfers" }), null);
});
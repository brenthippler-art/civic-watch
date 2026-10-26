import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, longDate, shortDate, bodyKey, meetingAnchor, readingOf } from "../public/shared.js";

const county = { body: "Warren County Fiscal Court", date: "2026-10-29" };
const city = { body: "Bowling Green City Commission", date: "2026-11-04" };

test("escapeHtml escapes HTML characters, and numbers", () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  assert.equal(escapeHtml(42), "42");
});

test("dates format without shifting a day", () => {
  assert.equal(longDate("2026-10-29"), "Thursday, October 29, 2026");
  assert.equal(longDate("2026-10-29", { year: false }), "Thursday, October 29");
  assert.equal(shortDate("2026-01-01"), "Jan 1, 2026");
});

test("bodyKey and meetingAnchor", () => {
  assert.equal(bodyKey(county), "county");
  assert.equal(bodyKey(city), "city");
  assert.equal(meetingAnchor(county), "meeting-2026-10-29-county");
});

test("readingOf", () => {
  assert.equal(readingOf({ text: "Ordinance No. BG2026-17 (First Reading – Non-Binding)" }), "first");
  assert.equal(readingOf({ text: "Ordinance #26-22WC, second and final reading" }), "second");
  assert.equal(readingOf({ text: "Approve the minutes" }), null);
});
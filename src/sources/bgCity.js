import * as cheerio from "cheerio";

const PAGE_URL = "https://www.bgky.org/city-commission";

// Link labels look like "Agenda 10/20/26". This pulls out the date.
function parseShortDate(text) {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  let [, month, day, year] = match;
  if (year.length === 2) year = "20" + year;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export async function getBgCityDocuments() {
  const response = await fetch(PAGE_URL, {
    headers: { "User-Agent": "civic-watch personal agenda monitor" },
  });
  if (!response.ok) throw new Error(`City page returned ${response.status}`);

  const $ = cheerio.load(await response.text());
  const docs = [];

  $("a").each((_, el) => {
    const label = $(el).text().trim();
    const href = $(el).attr("href");
    if (!href || !href.toLowerCase().endsWith(".pdf")) return;

    const isAgenda = /agenda/i.test(label);
    const isMinutes = /minutes/i.test(label);
    if (!isAgenda && !isMinutes) return;

    const date = parseShortDate(label);
    if (!date) return;

    docs.push({
      body: "Bowling Green City Commission",
      type: isAgenda ? "agenda" : "minutes",
      label,
      date,
      url: new URL(href, PAGE_URL).href,
    });
  });

  return docs;
}
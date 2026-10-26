import * as cheerio from "cheerio";

const PAGE_URL = "https://www.bgky.org/city-commission";
const BODY = "Bowling Green City Commission";

// Labels look like "Agenda 10/20/26" or "09/15/2026 Board of Commissioners Meeting".
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
    if (!href) return;

    const date = parseShortDate(label);
    if (!date) return;

    const url = new URL(href, PAGE_URL).href;

    // Agendas and minutes are PDFs.
    if (href.toLowerCase().endsWith(".pdf")) {
      const isAgenda = /agenda/i.test(label);
      const isMinutes = /minutes/i.test(label);
      if (!isAgenda && !isMinutes) return;
      docs.push({ body: BODY, type: isAgenda ? "agenda" : "minutes", label, date, url });
      return;
    }

    // Meeting videos: "10/20/26 Board of Commissioners Meeting" -> /videos/video/1406
    // Work sessions are skipped, so a regular meeting's video always wins.
    if (/\/videos\/video\/\d+/.test(href) && /board of commissioner|\bBOC\b/i.test(label) && !/work session/i.test(label)) {
      docs.push({ body: BODY, type: "video", label, date, url });
    }
  });

  return docs;
}
// Reads the county's YouTube RSS feed (about the 15 most recent videos).
// Titles look like "Warren County Fiscal Court 10 15 2026".
const CHANNEL_ID = "UCFGX2OvgI4Y92vWEyAtIClg"; // @warrencountykygov
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const BODY = "Warren County Fiscal Court";

// "… 10 15 2026" (also accepts "10/15/2026" or "10-15-26")
const TITLE_DATE = /(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{2}|\d{4})\s*$/;

export async function getCountyVideos() {
  const response = await fetch(FEED_URL);
  if (!response.ok) throw new Error(`YouTube feed returned ${response.status}`);
  const xml = await response.text();

  const videos = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const url = entry.match(/<link rel="alternate" href="([^"]+)"/)?.[1];

    if (!url || !/fiscal court/i.test(title)) continue; // skip Parks videos, etc.

    const match = title.trim().match(TITLE_DATE);
    if (!match) continue; // no date in the title (e.g., "Special Hearing on Rezoning")

    let [, month, day, year] = match;
    if (year.length === 2) year = `20${year}`;

    videos.push({
      body: BODY,
      date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      url,
    });
  }

  return videos;
}
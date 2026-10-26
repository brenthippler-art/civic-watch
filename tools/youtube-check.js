// Usage: node tools/youtube-check.js
// Finds the county channel's ID, then shows how its recent video titles are written.
const HANDLE_URL = "https://www.youtube.com/@warrencountykygov";

const page = await fetch(HANDLE_URL, {
  headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US" },
});
const html = await page.text();

const channelId =
  html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ??
  html.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1];

if (!channelId) {
  console.log("Couldn't find the channel ID on the page.");
  process.exit(1);
}
console.log("Channel ID:", channelId);

const feed = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
const xml = await feed.text();
const titles = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]+)<\/title>/g)].map((m) => m[1]);

console.log(`\nLatest ${titles.length} video titles:`);
titles.forEach((title) => console.log(" ", title));
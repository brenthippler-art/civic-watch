import * as cheerio from "cheerio";

// Two public Drive folders, same layout: one subfolder per year,
// files named like "261015 Minutes October 15, 2026.pdf".
const ROOTS = [
  { type: "agenda", folderId: "0B1zhDr21WzTJN180YmRaZDNiQVE", resourceKey: "0-lEbm9jG7K3pXxIoA3Nv2UQ" },
  { type: "minutes", folderId: "1JG_lkAWctoKmoMQ2WUA9hblGz0Q1RmlT", resourceKey: null },
];

// Lists everything in a public Drive folder using Google's plain HTML view.
async function listDriveFolder(folderId, resourceKey) {
  const url = new URL("https://drive.google.com/embeddedfolderview");
  url.searchParams.set("id", folderId);
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);

  const response = await fetch(url, {
    headers: { "User-Agent": "civic-watch personal agenda monitor" },
  });
  if (!response.ok) throw new Error(`Drive folder returned ${response.status}`);

  const $ = cheerio.load(await response.text());
  const entries = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const folderMatch = href.match(/\/folders\/([\w-]+)/);
    const fileMatch = href.match(/\/file\/d\/([\w-]+)/);
    if (!folderMatch && !fileMatch) return;

    const title = $(el).find(".flip-entry-title").text().trim() || $(el).text().trim();
    const linkKey = new URL(href, "https://drive.google.com").searchParams.get("resourcekey");

    entries.push({
      id: (folderMatch || fileMatch)[1],
      name: title,
      isFolder: Boolean(folderMatch),
      resourceKey: linkKey,
    });
  });

  return entries;
}

// "261015 Minutes October 15, 2026.pdf" -> Oct 15, 2026
function parseCountyFileDate(name) {
  const match = name.match(/^(\d{2})(\d{2})(\d{2})\s/);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
}

export async function getWarrenCountyDocuments(sinceYear) {
  const thisYear = new Date().getFullYear();
  const firstYear = Math.min(sinceYear ?? thisYear - 1, thisYear - 1);
  const wanted = [];
  for (let year = firstYear; year <= thisYear; year++) wanted.push(String(year));

  const docs = [];

  for (const root of ROOTS) {
    const yearFolders = await listDriveFolder(root.folderId, root.resourceKey);
    const targets = yearFolders.filter((f) => f.isFolder && wanted.includes(f.name));

    if (targets.length === 0) {
      console.warn(`No ${root.type} year folders found. Names seen:`, yearFolders.map((f) => f.name));
    }

    // "agenda" files must say "agenda"; "minutes" files must say "minutes".
    const namePattern = root.type === "agenda" ? /agenda/i : /minutes/i;

    for (const folder of targets) {
      const files = await listDriveFolder(folder.id, folder.resourceKey);

      for (const file of files) {
        if (file.isFolder || !namePattern.test(file.name)) continue;
        const date = parseCountyFileDate(file.name);
        if (!date) continue;

        docs.push({
          body: "Warren County Fiscal Court",
          type: root.type,
          label: file.name.replace(/\.pdf$/i, ""),
          special: /special/i.test(file.name),
          date,
          url: `https://drive.google.com/file/d/${file.id}/view`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
        });
      }
    }
  }

  return docs;
}
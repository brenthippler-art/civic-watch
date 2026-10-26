import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPdf } from "./pdf.js";

const CACHE_DIR = path.join("data", "text");

// Less than this much text means "this is probably a scan."
const MIN_TEXT = 100;

// "Warren County Fiscal Court" -> "warren-county-fiscal-court"
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function cacheFileFor(doc) {
  const isoDate = doc.date.toISOString().slice(0, 10);
  const name = `${isoDate}_${slug(doc.body)}_${slug(doc.type)}${doc.special ? "-special" : ""}.txt`;
  return path.join(CACHE_DIR, name);
}

export async function getDocumentText(doc) {
  const file = cacheFileFor(doc);

  // Use the saved copy, but only if it actually has text in it.
  try {
    const cached = await readFile(file, "utf8");
    if (cached.trim().length >= MIN_TEXT) return cached;
  } catch {
    // Not cached yet.
  }

  const response = await fetch(doc.downloadUrl || doc.url, {
    headers: { "User-Agent": "civic-watch personal agenda monitor" },
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${doc.label}`);

  const bytes = new Uint8Array(await response.arrayBuffer());

  // Every real PDF starts with "%PDF-". If not, we got an error page instead.
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") throw new Error(`Not a PDF: ${doc.label}`);

  // Text layer where it exists, OCR page by page where it doesn't.
  const text = await readPdf(bytes, doc.label);

  // Don't cache a failure. An empty file would just get retried anyway.
  if (text.trim().length >= MIN_TEXT) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, text, "utf8");
  }

  return text;
}
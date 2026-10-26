import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";

// Find where pdfjs-dist is installed, so we can point it at its own decoder files.
const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve("pdfjs-dist/package.json"));

// PDF.js wants folder paths ending in "/". Windows uses "\", so convert.
const toPdfjsDir = (folder) => path.join(PDFJS_DIR, folder).replace(/\\/g, "/") + "/";
const WASM_DIR = toPdfjsDir("wasm");
const FONT_DIR = toPdfjsDir("standard_fonts");

// A page with less text than this is treated as a scan and OCR'd.
const MIN_PAGE_TEXT = 50;

if (!existsSync(path.join(PDFJS_DIR, "wasm", "jbig2.wasm"))) {
  console.warn(`jbig2.wasm not found in ${WASM_DIR}. Scanned PDFs may OCR as blank.`);
}

function loadPdf(bytes) {
  return getDocument({
    data: bytes.slice(),           // PDF.js may take ownership, so hand it a copy
    wasmUrl: WASM_DIR,             // where jbig2.wasm lives
    standardFontDataUrl: FONT_DIR, // fonts PDF.js may need while drawing
    verbosity: 0,                  // errors only, no font warnings
  });
}

// The text layer of one page, keeping line breaks.
async function pageText(page) {
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
    .join("");
}

// Draws one page onto a white canvas and returns it as a PNG.
async function renderPage(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.encode("png");
}

// Reads every page: the text layer when it has one, OCR when it doesn't.
export async function readPdf(bytes, label) {
  const task = loadPdf(bytes);
  let worker = null;
  let ocrPages = 0;

  try {
    const pdf = await task.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      let text = await pageText(page);

      if (text.trim().length < MIN_PAGE_TEXT) {
        worker ??= await createWorker("eng"); // only start OCR if a page needs it
        const { data } = await worker.recognize(await renderPage(page));
        text = data.text;
        ocrPages++;
      }

      pages.push(text);
    }

    const result = pages.join("\n");
    if (ocrPages) {
      console.log(`  OCR: ${label} (${ocrPages} of ${pdf.numPages} pages) → ${result.length} characters`);
    }
    return result;
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
}
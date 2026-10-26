# Civic Watch

**What Bowling Green City Commission and Warren County Fiscal Court are voting on, and how each official voted, pulled straight from the official agendas and minutes.**

**Live site:** [civic-watch-three.vercel.app](https://civic-watch-three.vercel.app) · [Ordinances](https://civic-watch-three.vercel.app/ordinances.html) · [Voting record](https://civic-watch-three.vercel.app/record.html)

---

## The problem

Local government decisions about zoning, land purchases, tax incentives, utilities, and data centers are made in public, but the public record is hard to follow:

- **The documents are scattered.** The City of Bowling Green posts agendas and minutes as PDFs on its website. Warren County posts them in shared Google Drive folders. There's no single place to see both.
- **They're posted late.** The Fiscal Court often posts its agenda the night before a 9:00 AM meeting, which leaves residents almost no time to read it, let alone prepare a comment.
- **The minutes are hard to use.** City minutes are scanned images with no searchable text. County minutes record votes as counts ("six yeas, one nay") rather than names. Building a voting record means reading every set of minutes by hand.
- **Commercial tools exist, but not here.** Services like CivicSignal monitor local agendas for businesses at $99–$699 a month, and only in selected states. Nothing like it existed for south-central Kentucky residents.

Civic Watch checks both governments every evening, reads every new agenda and set of minutes, flags the items residents care about, tracks each ordinance from first reading to final vote, builds a voting record for each official, and publishes it all to a free public website. Residents can sign up for an email alert when a new agenda is posted, with the meeting time, place, and how to speak included.

## My contribution

I designed and built the whole project: the data pipeline, the parsing logic, the website, and the automated publishing. It was developed with Claude as a pair-programming assistant; I typed out and worked through every piece of code to understand it.

- **Data collection:** scrapers for the city's agenda page and the county's Google Drive folders, including the year-by-year folder structure and date-coded file names.
- **Document reading:** a PDF pipeline that uses each page's text layer when it has one and falls back to OCR, page by page, when it doesn't.
- **Agenda parsing:** splits each agenda into individual items, tags routine items, matches a keyword watchlist, and identifies first and second readings of ordinances.
- **Vote parsing:** two parsers, one for each government's minutes format, that attribute every roll call to the right agenda item and record who moved, seconded, and voted which way.
- **Voting record:** per-official totals for votes cast, yes, no, absences (whole meetings missed and individual votes), motions, and seconds, plus a list of every split vote with links to the agenda, minutes, and meeting video.
- **Ordinance tracking:** follows each ordinance across meetings, from first reading to final vote, on its own page.
- **Front end:** an accessible, responsive static site with search, topic, government, and reading filters; shareable links to any meeting; a "How to take part" box on upcoming meetings; and links to each meeting's video.
- **Alerts:** RSS feeds for each government, and email alerts through Kit that subscribers can limit to the city, the county, or both.
- **Automation:** a scheduled task that runs the parser tests, then the pipeline, every evening, and auto-publishes changes through GitHub to Vercel.

## Stack

| Layer | Tools |
| --- | --- |
| Data pipeline | Node.js (ES modules), [Cheerio](https://cheerio.js.org/) for HTML scraping |
| PDF reading | [PDF.js (`pdfjs-dist`)](https://github.com/mozilla/pdf.js) for text extraction and page rendering, including its JBIG2 WebAssembly decoder |
| OCR | [Tesseract.js](https://tesseract.projectnaptha.com/) with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) for rendering scanned pages |
| Front end | Vanilla HTML, CSS, and JavaScript modules (no framework), Google Fonts (Fraunces, Source Sans 3) |
| Email alerts | [Kit](https://kit.com) API v4 (tag-based broadcasts), verified sending domain |
| Video links | City video page (scraped), Warren County YouTube channel RSS feed |
| Testing | Node's built-in test runner (`node:test`) with saved minutes and agenda text as fixtures |
| Hosting | Vercel (static), GitHub |
| Scheduling | Windows Task Scheduler |

## Screenshots

<!-- Replace these with real screenshots. Suggested size: ~1400px wide. -->

| Agendas | Voting record |
| --- | --- |
| ![Agendas page with sidebar filters and meeting cards](docs/screenshots/agendas.png) | ![Voting record page with split votes and member cards](docs/screenshots/record.png) |

| Ordinances | Email alert |
| --- | --- |
| ![Ordinances page showing each ordinance's readings and votes](docs/screenshots/ordinances.png) | ![New-agenda alert email with meeting time, place, and flagged items](docs/screenshots/alert.png) |

| Mobile | Dark mode |
| --- | --- |
| ![Agendas page on a phone, with filters above the meetings](docs/screenshots/mobile.png) | ![Agendas page in dark mode](docs/screenshots/dark.png) |

## How it works

```
Every evening (Windows Task Scheduler, 6 PM)
        │
        ▼
0. Run parser tests ── If any fail: update local data only, don't publish or email
        │
        ▼
1. Find documents ──── City: bgky.org/city-commission (PDFs and video links)
        │              County: public Google Drive folders (one per year),
        │              plus the county's YouTube feed for meeting videos
        ▼
2. Read each PDF ───── Text layer if the page has one; OCR if it's a scan
        │              (cached locally, so each document is only read once)
        ▼
3. Parse agendas ───── Split into items · tag routine items · match watchlist
        │              · detect first/second readings
        ▼
4. Parse minutes ───── Attribute each roll call to its agenda item
        │              · record motion, second, yeas, nays, abstentions
        ▼
5. Apply corrections ─ Hand-entered names (e.g., from meeting video), validated first
        │
        ▼
6. Publish ─────────── If the data changed: write RSS feeds and status,
        │              git commit + push → Vercel redeploys
        ▼
7. Alert ───────────── New agenda for an upcoming meeting: Kit email to
                       subscribers tagged for that government (sent once)
```

## Technical decisions

**Read page by page, not document by document.** Some minutes are a mix of text pages and scanned pages. Treating a whole PDF as "text" or "scan" missed the scanned pages in mixed documents. Each page is now checked on its own and only scanned pages go through OCR, which is both more complete and faster.

**One PDF library, configured for scans.** The city's scanned minutes use JBIG2 image compression. The first PDF library I used bundled a copy of PDF.js without the JBIG2 decoder, so scanned pages rendered blank and OCR returned nothing. Even after adding `pdfjs-dist` for rendering, the two copies of PDF.js conflicted in the same process. I removed the first library and used `pdfjs-dist` for everything, pointing it at its own WebAssembly decoder.

**Attribute votes strictly, never by position.** My first vote parser took "the first roll call after each item heading." On June 16, 2026, that silently recorded a procedural 4–1 vote as the vote on a data-center zoning ordinance, which would have published that the mayor voted against it when the real vote was 5–0. The parser now matches every roll call by the result sentence that follows it ("Ordinance No. BG2026 — 6 was adopted…"). Anything that doesn't clearly name an item is recorded as a labeled procedural vote, never attached to an item by guesswork.

**Stop matches from running together.** A county vote worded unusually could make the pattern run past it into the next vote, combining one vote's mover with another's tally. Every county pattern now uses a tempered token, `(?:(?!Upon\s+roll\s+call).)`, so a single match can never cross into a second roll call. An unreadable vote shows up as a visible gap instead of a silent error.

**Infer only when the numbers prove it, and say so.** County minutes record counts, not names. Individual yes votes are worked out from attendance only when yeas plus nays plus abstentions exactly equals the number present and every "no" is named. Otherwise the vote is shown with its tally but left out of individual totals. Inferred votes are labeled "from attendance" on the site.

**Corrections are validated and labeled.** When the minutes don't name a "no" voter, a name can be added from meeting video in `corrections.json`. Each entry must give a source, match the minutes' nay count, and name someone who was present, or it's rejected with a warning. Corrected names are always shown with their source and "not recorded in the minutes."

**Tests guard the scheduled run.** The parsers are tested against saved text from real minutes and agendas, including the June 16 meeting that exposed the attribution bug. The scheduled task runs the tests first. If any fail, it still updates the local data so I can inspect it, but it doesn't publish or send email, so a parser broken by a format change can't put wrong votes on the site.

**One source of truth for shared details.** Meeting times, locations, how to speak, and contacts live in one module (`public/participate.js`) that both the website and the Node alert emails import. Small helpers like HTML escaping, date formatting, and meeting links live in `public/shared.js`. A meeting link built by the RSS feed, the email, and the website is always the same, because all three call the same function.

**Alerts send once, and only when they're useful.** Each email alert is recorded in a local ledger, so a re-run never sends the same agenda twice. Alerts only go out for meetings today or later, and backfills never send email. A mode setting (`off`, `draft`, or `send`) makes it possible to review real alerts as Kit drafts before turning on sending.

**Self-checking runs.** Each run counts the raw roll-call lines in every set of minutes and warns if any couldn't be read. That check is what surfaced several of the bugs above.

**Static site, no framework.** The site is plain HTML, CSS, and JavaScript reading two JSON files. There's no build step, so Vercel serves the `public` folder as-is, deploys take seconds, and none of the OCR tooling ever reaches the server.

**Publish data automatically, code deliberately.** The auto-publish step only commits `public/data/`, `public/feeds/`, and `corrections.json`. Changes to the site's own code are committed by hand, so a half-finished edit is never pushed by the evening run.

## Accessibility

- **Semantic structure:** landmarks (`header`, `nav`, `aside`, `main`, `footer`), a logical heading hierarchy, and a skip link to the main content.
- **Filters as real form controls:** single-choice groups use radio buttons inside `fieldset`/`legend`, so screen readers announce the group and position, and arrow keys move within a group. The native circles are visually hidden but remain focusable.
- **Live updates:** the "Showing N meetings" count is an `aria-live="polite"` region, so filter changes are announced without interrupting.
- **State is exposed:** `aria-pressed`/checked states, `aria-expanded` on "Show older meetings," and `aria-current="page"` in the site navigation.
- **Focus management:** keyboard focus is restored to the "Show older meetings" button after the list re-renders, and a high-visibility focus ring works on both light and dark backgrounds.
- **Color and contrast:** the color palette targets WCAG AA contrast in both light and dark modes, and color is never the only signal. Every colored pill also has text.
- **Respects user settings:** automatic dark mode (`prefers-color-scheme`) and no animation for users who prefer reduced motion (`prefers-reduced-motion`).
- **Images and links:** the county map SVG has a `title` read as a single image, decorative date tiles are hidden from screen readers to avoid reading the date twice, and links that open in a new tab say so.
- **Search and links:** search results highlight matches with `<mark>`, and following a shared meeting link moves keyboard focus to that meeting, not just the scroll position. Copying a link is confirmed through a live region.
- **Sign-up form:** the Kit email form uses labeled inputs and a `fieldset`/`legend` for the city/county choice, replacing the default pop-up markup.
- **Security:** all text from PDFs is HTML-escaped before rendering, and the Kit API key stays in a local `.env` file that's never committed.

## Testing and verification

Accuracy is checked in layers:

- **Unit tests** (`npm test`): both minutes parsers, the agenda splitter, corrections, and the shared helpers, tested against saved text from real documents in `test/fixtures/`. They run before every scheduled update.
- **Roll-call reconciliation:** every run compares the number of roll calls in each set of minutes to the number parsed, and logs a ⚠ warning for any gap.
- **Inspection tools:** `tools/inspect-votes.js` and `tools/inspect-county.js` print every parsed vote for a meeting, the raw vote wording, attendance, and any roll calls that couldn't be read.
- **Manual checks against source documents:** split votes were checked against the official minutes, and every vote on the site links to its agenda and minutes so anyone can verify it.
- **Accessibility checks:** keyboard-only navigation, screen-reader landmarks and labels, narrow-screen layout, and dark mode were tested by hand.

## Data sources

- **Bowling Green City Commission:** agendas and minutes at [bgky.org/city-commission](https://www.bgky.org/city-commission)
- **Warren County Fiscal Court:** agendas and minutes in the public Google Drive folders linked from [warrencountyky.gov/departments/fiscal-court](https://www.warrencountyky.gov/departments/fiscal-court/)

## Known limitations

- **County "no" votes aren't named** in the Fiscal Court minutes. They're shown as counts unless a name is added from meeting video.
- **OCR can misread text** in scanned city minutes. Names are matched to a roster by their first four letters to absorb small errors, and anything that doesn't match is logged rather than guessed.
- **Rosters are maintained by hand** in `public/record.js` and need updating after elections.
- **Keyword flags are simple pattern matches**, not analysis. Every item links to the official document.
- **The scheduler runs on a personal Windows machine**, so updates depend on that computer being on. The site shows when it last checked, and flags it if that was more than 30 hours ago.
- **Meeting links share one preview.** Social sites ignore the `#meeting-…` part of a link, so every meeting link shows the Agendas page preview.

## Setup

**Requirements:** Node.js 18 or newer, Git.

```bash
git clone https://github.com/brenthippler-art/civic-watch.git
cd civic-watch
npm install
```

**Run the tests:**
```bash
npm test
```

**Run once without publishing or emailing:**
```bash
node src/index.js --no-publish --no-email
```

**Backfill past meetings** (the first run OCRs scanned minutes and takes several minutes; results are cached):
```bash
node src/index.js --since 2026-01-01 --no-publish
```

**Preview the site locally:**
```bash
npx serve public
```

**Inspect parsed votes for one meeting:**
```bash
node tools/inspect-votes.js 2026-06-16    # City Commission
node tools/inspect-county.js 2026-07-30   # Fiscal Court
```

**Schedule the evening run (Windows, PowerShell).** 6 PM gives residents the evening to read a Fiscal Court agenda that was posted that afternoon:
```powershell
$action  = New-ScheduledTaskAction -Execute "C:\path\to\civic-watch\run-civic-watch.cmd"
$sixPm   = New-ScheduledTaskTrigger -Daily -At 6:00pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Civic Watch" -Action $action -Trigger $sixPm -Settings $settings
```
Run logs are written to `data/logs/run.log`.

**Email alerts (optional).** Create a `.env` file in the project folder (it's gitignored):
```
KIT_API_KEY=your_kit_v4_api_key
KIT_ALERT_MODE=draft
```
`KIT_ALERT_MODE` is `off` (the default), `draft` (creates broadcasts in Kit for review), or `send`. To preview one alert as a Kit draft:
```bash
node --env-file=.env tools/test-alert.js county
```

**Adding a correction** (for example, a county "no" vote confirmed from meeting video), in `corrections.json`:
```json
{
  "county|2026-07-09|ITEM-30": { "nays": ["LastName"], "source": "Meeting video at 1:42:10" }
}
```

## Project structure

```
civic-watch/
├── public/                 # The website (served by Vercel)
│   ├── index.html          # Agendas page
│   ├── ordinances.html     # Ordinance tracking page
│   ├── record.html         # Voting record page
│   ├── app.js, ordinances.js, record.js   # Page logic
│   ├── shared.js           # Helpers shared by the site and Node
│   ├── participate.js      # Time, place, how to speak (site + emails)
│   ├── ordinance-key.js    # Matches an ordinance across meetings
│   ├── style.css
│   ├── data/               # meetings.json, votes.json, status.json (generated)
│   └── feeds/              # RSS feeds (generated)
├── src/
│   ├── index.js            # Runs the whole pipeline
│   ├── sources/            # City page, county Drive folder, and county video scrapers
│   ├── minutes/            # City and county minutes parsers
│   ├── pdf.js              # Text layer + page-by-page OCR
│   ├── pdfText.js          # Download + cache
│   ├── splitItems.js       # Agenda item splitter
│   ├── watchlist.js        # Topic keywords
│   ├── corrections.js      # Validated hand-entered corrections
│   ├── feed.js             # RSS feeds
│   ├── alerts.js           # Kit email alerts
│   └── publish.js          # Commit + push changed data
├── test/                   # Parser tests and saved document fixtures
├── tools/                  # Inspection and alert-preview scripts
├── corrections.json
├── run-civic-watch.cmd     # Entry point for Task Scheduler
└── vercel.json             # Static hosting config
```

---

*Civic Watch is an independent project and is not affiliated with the City of Bowling Green or Warren County. Information is generated automatically from public records and may contain errors. Always check the official documents, which are linked with every meeting and vote.*
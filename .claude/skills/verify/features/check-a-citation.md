# Check a claim of the report

The reader checks any claim of a report in two actions. A hover over a citation shows the quote that the app verified, with the source title, the domain and the label. A click opens the source page in a new tab. The same label is on every list of sources.

## Sub-features

- `cite-chip` shows each citation of a verified claim as a numbered chip in the report.
- `cite-hover` opens a popover with the full quote, the source title, the domain and the label on hover and on keyboard focus (U6).
- `cite-open` opens the source page in a new tab on a click (U7).
- `cite-label` shows the label in the popover, in the source list of the report, and in the Sources tab (S3).
- `cite-source-list` ends the report with a source list that has the title, the domain, the label and the link (R7).
- `cite-unknown` leaves a citation mark with no verified claim as plain text.

## How to get to it (user POV)

- In the web UI, open a run that has a report. Move the pointer over a numbered chip in the report, or move to it with the Tab key.
- Click the chip, or press Enter on it.
- Read the Sources tab of the progress panel while a run is running.

## Driving it with the proof helpers

Preconditions:

- `node scripts/doctor.mjs` exits 0.
- `.claude/skills/verify/scripts/ui.sh <slug>` runs in the background and has printed `READY`. Its `URL:` line is `<URL>` and its `Evidence:` line is `<evidence folder>`.

- **Hover, focus and link.** Run `node .claude/skills/verify/scripts/browser.mjs --base <URL> --out <evidence folder> .claude/skills/verify/scripts/steps/citation.json`. It opens the stored `completed` run. Every line reads `PASS`: the popover shows the full quote (U6) and the source title, the domain and the label (U6, S3), the chip links to the source page with `target="_blank"` and `rel="noopener noreferrer"` (U7), keyboard focus opens the popover too, and the source list of the report and the Sources tab both carry the label (R7, S3).
- **What the reader sees.** Look at `citation.png`. The popover sits above the chip `1` and reads `LFP cells last about 3,000 cycles.`, then `lfp cycle life result 1`, then `example.org` and the badge `Reference`.
- **The rewrite of the marks.** Run `pnpm test lib/ui/citations.test.ts`. The report stores a citation as the mark `[^n]`. The tests cover a mark of a verified claim, two marks side by side, a mark with no verified claim, and a mark that the report escaped.
- **Quotes of a real run.** A live proof from [run-a-question.md](run-a-question.md) checks that every quote is on its page (`v1.stored` in `audit.txt`). The web UI shows the same stored quotes and adds no check of its own.

## Gotchas

- A device without a pointer has no hover. A tap on a chip opens the source page. The quote is then in the Claims tab and in the row of the page in the Activity list.
- The popover opens about a tenth of a second after the pointer arrives. A step that reads it must wait for `[data-slot=hover-card-content]`.
- The fakes use the label `Reference` for every source, and `Blog` in the `no-claims` scenario. The eight badges differ by icon and text. A live run shows more of them.
- The headless driver checks the link of a chip. It does not follow the link, because the page is `example.org` on fakes.

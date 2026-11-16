# Research Marshal PRD

Status: draft 2, 2026-11-15.

This document is the source of truth for what Research Marshal does. It does not cover the tech stack. [TECH_STACK.md](TECH_STACK.md) covers that.

## Problem

AI research tools often state facts that their cited pages do not contain. To rely on an answer, a reader must open every source and search for the statement by hand.

## Product

The user asks one research question. Research Marshal searches the live web and returns a cited Markdown report. Every fact in the report carries a quote that the app found, word for word, on the page that the citation names.

## Users

Anyone with a research question can use Research Marshal. That includes a private person, a student, a business owner, and a university researcher. Two readers set the bar.

- The general reader has no research training. This reader must get from the question to the report without instructions.
- The university researcher checks sources by habit. The report must hold up when this reader checks every citation.

## Success criteria

Version 1 succeeds when all six criteria hold.

1. Every quote in a report appears word for word on its source page.
2. Every sentence that states a fact carries at least one citation.
3. The reader checks any claim in two actions. A hover shows the quote. A click opens the source.
4. Every failed page, every search without results, and every dropped claim is visible in the run.
5. No run exceeds the budget.
6. A first-time user completes a run without instructions.

## Terms

| Term | Meaning |
| --- | --- |
| Question | The one research question that starts a run. |
| Run | Everything the app does for one question, from the first search to the report. |
| Round | One search and at most 8 page reads. |
| Map | A list of the pages of one site. The run uses the list to choose pages to read. |
| Page | A web page that the run finds. |
| Quote | A passage that the app copies from a page. |
| Claim | One factual statement, one quote, and the page that the quote comes from. |
| Verified claim | A claim that passed both checks, V1 and V2. |
| Source | A page that at least one verified claim cites. |
| Report | The Markdown answer that the app writes at the end of a run. |

## Requirements

### Live web data

- **W1.** The app gets every page from the web at the time of the run. No source is hard-coded, and no source is invented.
- **W2.** The app has three web actions. It searches the web, it reads one page, and it maps one site.
- **W3.** The app never crawls a whole site.

### Verified claims

- **V1.** The quote of a claim must appear word for word on the page that the claim names. Differences in whitespace and formatting do not count. A changed, added, or missing word fails the check.
- **V2.** The quote must support the claim. A second check decides this for every claim. The second check is separate from the step that wrote the claim.
- **V3.** The app drops a claim that fails V1 or V2.
- **V4.** The report cites only verified claims.

### Budget

- **B1.** A run has at most 3 rounds.
- **B2.** A round has one search and at most 8 page reads.
- **B3.** A run has at most 1 map. A page that the run reads from the map counts toward the 8 page reads of its round.
- **B4.** The run stops before the third round when the verified claims answer the question.
- **B5.** When the budget ends, the app writes the report with the verified claims that it has.
- **B6.** The limits are fixed. The user cannot change them.
- **B7.** A page that the app could not read is not a page read. Only a page that the app read counts toward the 8 page reads of a round. When a read fails, the run reads the next selected page. A round has at most 16 read attempts. When the web data service refuses one page of a site as unsupported, the run tries no other page of that site. The run shows those pages as skipped, with the reason.

### Visible failures

- **F1.** The run shows every page with one state: read, failed, or skipped. A failed page is a page that the app could not read, for example a blocked page. A skipped page is a page that the run found but did not read.
- **F2.** The run shows every search, including a search without results.
- **F3.** The run shows every dropped claim with its quote and the check that it failed.
- **F4.** The app never removes a failure from the run.

### Source labels

- **S1.** Any web page can be a source. The app does not rank or block pages by label.
- **S2.** Every source has exactly one label from the table below.
- **S3.** The label appears wherever the source appears: in the citation popover, in the source list of the report, and in the live source list.

| Label | Covers |
| --- | --- |
| Paper | A journal article, a conference paper, or a preprint. |
| Official | A page of a government, a public agency, or a standards body. |
| Reference | An encyclopedia, a dictionary, or a textbook. |
| News | An article of a news outlet. |
| Organization | A page of a company, a university, or a nonprofit. |
| Blog | An article on a personal blog or a company blog. |
| Forum | A forum thread, a question-and-answer site, or a social media post. |
| Other | A page that fits no other label. |

### Report

- **R1.** The report is Markdown. It opens with a direct answer to the question.
- **R2.** The report is one to two pages long.
- **R3.** Every sentence that states a fact cites at least one verified claim.
- **R4.** A sentence without a citation only connects other sentences. It states no fact.
- **R5.** When sources disagree, the report presents each side with its quotes.
- **R6.** When the verified claims do not answer the whole question, the report is short and names the parts that it could not answer. When no claim is verified, the report says so and lists the searches of the run.
- **R7.** The report ends with a source list. Each entry has the title, the domain, the label, and the link.

### User flow

The user flow has four steps: ask, watch, read, and come back.

**Ask**

- **U1.** The app has one prompt box. The user types one question and starts the run.
- **U2.** The app takes no follow-up questions on a report. A new question starts a new run.

**Watch**

- **U3.** The app shows each step when it happens: every search, every page with its state, and every claim that the app verifies or drops. The app shows the report while the app writes it.
- **U4.** The app shows how much of the budget the run has used.
- **U5.** The user can cancel a run. A cancelled run writes no report.

**Read**

- **U6.** When the user hovers over a citation, a popover shows the full quote, the source title, the domain, and the label.
- **U7.** When the user clicks a citation, the source page opens in a new tab.

**Come back**

- **U8.** The history lists every past run, including cancelled runs.
- **U9.** The history keeps the full run: the question, the date, the report, every step, every page with its state, and every dropped claim. A past run is read-only.
- **U10.** Every past run has a rerun button. A rerun starts a new run with the same question. The app saves the new run as a separate entry and leaves the old run unchanged.

## Not in version 1

- Accounts and login.
- A crawl of a whole site.
- A hosted service. The app runs locally for one user.
- Follow-up questions on a report.
- User settings for the budget.
- Ranking or filtering of sources by label.

## Open questions

1. What does the app do with a vague question? The options are to start the run immediately, to ask one clarifying question first, or to show the search plan and wait for approval.
2. Is the list of source labels complete?
3. Can the user copy or download the report as a Markdown file?
4. What does the app do when a run fails as a whole? Examples are a rejected API key, a model call that the provider refuses, and a restart of the app during a run. The requirements cover a failed page (F1) and a search without results (F2). They do not cover a failed run.
5. What does the user see when the finished report fails a check? The app shows the report while the app writes it (U3). The user can therefore read a sentence before the app confirms that the sentence cites only verified claims (V4, R3).

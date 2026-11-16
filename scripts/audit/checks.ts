import { PageWords } from "./quote";
import {
  blocksOf,
  type ParsedReport,
  parseReport,
  SOURCE_LABELS,
  sentencesOf,
  wordCount,
} from "./report-md";
import {
  type Envelope,
  type Ev,
  eventsOf,
  readsOf,
  type StoredRun,
} from "./stored-run";

// The PRD's numbers, written here and not imported from lib/research/budget.ts.
export const PRD = Object.freeze({
  rounds: 3, // B1
  searchesPerRound: 5, // B2, as the code allows; see the evidence line of the check
  readsPerRound: 8, // B2: successful reads
  readAttemptsPerRound: 16, // B2 after issue #8: failed reads do not count
  mapsPerRun: 1, // B3
  // R2: a page is 250 (double-spaced) to 500 (single-spaced) words.
  reportWords: { min: 250, max: 1000 },
});

const WEB_ACTIONS = new Set(["google_search", "universal", "map"]);

export type Status = "pass" | "fail" | "warn" | "skip";

export type Check = {
  id: string;
  requirement: string;
  measures: string;
  status: Status;
  evidence: string[];
};

type Verdict = Pick<Check, "status" | "evidence">;
type CheckSpec = Omit<Check, "status" | "evidence"> & {
  run: (ctx: Context) => Verdict;
};

export type Context = {
  stored: StoredRun;
  status: string;
  report: Ev<"report.finished"> | undefined;
  parsed: ParsedReport | undefined;
  verified: Map<number, Ev<"claim.verified">>;
  pageWords: (url: string) => PageWords | undefined;
};

export function contextOf(stored: StoredRun): Context {
  const reports = eventsOf(stored, "report.finished");
  const report = reports.at(-1);
  const cache = new Map<string, PageWords>();
  return {
    stored,
    status: stored.run.status,
    report,
    parsed: report ? parseReport(report.markdown) : undefined,
    verified: new Map(
      eventsOf(stored, "claim.verified").map((c) => [c.number, c]),
    ),
    pageWords(url) {
      const markdown = stored.pages.get(url);
      if (markdown === undefined) return undefined;
      let page = cache.get(url);
      if (!page) {
        page = new PageWords(markdown);
        cache.set(url, page);
      }
      return page;
    },
  };
}

const pass = (...evidence: string[]): Verdict => ({ status: "pass", evidence });
const skip = (...evidence: string[]): Verdict => ({ status: "skip", evidence });
const judge = (problems: string[], ...evidence: string[]): Verdict =>
  problems.length > 0
    ? { status: "fail", evidence: [...problems, ...evidence] }
    : pass(...evidence);

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const short = (text: string, max = 90) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function roundsOf(ctx: Context): number[] {
  return eventsOf(ctx.stored, "round.started").map((r) => r.round);
}

const CHECKS: CheckSpec[] = [
  {
    id: "log.integrity",
    requirement: "F4, U9",
    measures:
      "The event log is whole: seq runs 1..N, it opens with run.started, it ends with one run.finished that matches Run.status.",
    run(ctx) {
      const { events, run } = ctx.stored;
      const problems: string[] = [];
      events.forEach((e, i) => {
        if (e.seq !== i + 1) problems.push(`seq ${e.seq} at position ${i + 1}`);
      });
      if (events[0]?.type !== "run.started") {
        problems.push(`the first event is ${events[0]?.type ?? "missing"}`);
      }
      const finished = eventsOf(ctx.stored, "run.finished");
      if (run.status === "RUNNING") {
        problems.push("the run never finished (Run.status is RUNNING)");
      } else if (finished.length !== 1) {
        problems.push(`${finished.length} run.finished events, expected 1`);
      } else if (events.at(-1)?.type !== "run.finished") {
        problems.push("events follow run.finished");
      } else if (finished[0]?.end.status.toUpperCase() !== run.status) {
        problems.push(
          `run.finished says ${finished[0]?.end.status}, Run.status says ${run.status}`,
        );
      }
      if (run.status !== "RUNNING" && run.finishedAt === null) {
        problems.push("Run.finishedAt is empty");
      }
      for (let i = 1; i < events.length; i += 1) {
        const [a, b] = [events[i - 1], events[i]] as [Envelope, Envelope];
        if (b.at < a.at)
          problems.push(`event ${b.seq} is earlier than ${a.seq}`);
      }
      return judge(
        problems.slice(0, 10),
        `${events.length} events, status ${run.status}`,
      );
    },
  },
  {
    id: "web.actions",
    requirement: "W2, W3",
    measures:
      "Every Decodo call is a search, a page read or a map, and each call settled.",
    run(ctx) {
      const requested = eventsOf(ctx.stored, "decodo.requested");
      const settled = new Set(
        eventsOf(ctx.stored, "decodo.settled").map((s) => s.call),
      );
      const problems = requested
        .filter((r) => !WEB_ACTIONS.has(r.endpoint))
        .map((r) => `call ${r.call} uses the endpoint ${r.endpoint}`);
      const open = requested.filter((r) => !settled.has(r.call));
      if (open.length > 0 && ctx.status !== "CANCELLED") {
        problems.push(
          `${open.length} calls never settled: ${open.map((r) => r.call).join(", ")}`,
        );
      }
      const byEndpoint = [...countBy(requested, (r) => r.endpoint)]
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      return judge(
        problems,
        `${requested.length} calls (${byEndpoint || "none"})`,
        ...(open.length > 0 && ctx.status === "CANCELLED"
          ? [`${plural(open.length, "call")} still open at the cancel`]
          : []),
      );
    },
  },
  {
    id: "budget.rounds",
    requirement: "B1",
    measures: `At most ${PRD.rounds} rounds, numbered 1, 2, 3 in order.`,
    run(ctx) {
      const rounds = roundsOf(ctx);
      const problems: string[] = [];
      if (rounds.length > PRD.rounds) {
        problems.push(`${rounds.length} rounds, limit ${PRD.rounds}`);
      }
      rounds.forEach((r, i) => {
        if (r !== i + 1) problems.push(`round ${r} at position ${i + 1}`);
      });
      return judge(problems, `${rounds.length} of ${PRD.rounds} rounds used`);
    },
  },
  {
    id: "budget.searches",
    requirement: "B2",
    measures: `At most ${PRD.searchesPerRound} searches per round.`,
    run(ctx) {
      const searches = eventsOf(ctx.stored, "decodo.requested").filter(
        (r) => r.endpoint === "google_search",
      );
      const perRound = roundsOf(ctx).map(
        (round) =>
          [round, searches.filter((s) => s.round === round).length] as const,
      );
      return judge(
        perRound
          .filter(([, n]) => n > PRD.searchesPerRound)
          .map(([round, n]) => `round ${round}: ${n} searches`),
        `per round: ${perRound.map(([r, n]) => `r${r} ${n}`).join(", ") || "none"}`,
        "PRD B2 and the Terms table say one search per round; the code and this check allow 5.",
      );
    },
  },
  {
    id: "budget.reads",
    requirement: "B2, B3",
    measures: `At most ${PRD.readsPerRound} successful reads and ${PRD.readAttemptsPerRound} read attempts per round.`,
    run(ctx) {
      const attempts = eventsOf(ctx.stored, "decodo.requested").filter(
        (r) => r.endpoint === "universal",
      );
      const reads = eventsOf(ctx.stored, "page.read");
      const problems: string[] = [];
      const lines: string[] = [];
      for (const round of roundsOf(ctx)) {
        const tried = attempts.filter((a) => a.round === round).length;
        const read = reads.filter((p) => p.round === round).length;
        lines.push(`r${round} ${read} read of ${tried} tried`);
        if (read > PRD.readsPerRound) {
          problems.push(
            `round ${round}: ${read} pages read, limit ${PRD.readsPerRound}`,
          );
        }
        if (tried > PRD.readAttemptsPerRound) {
          problems.push(
            `round ${round}: ${tried} read attempts, limit ${PRD.readAttemptsPerRound}`,
          );
        }
      }
      return judge(problems, `per round: ${lines.join(", ") || "none"}`);
    },
  },
  {
    id: "budget.maps",
    requirement: "B3",
    measures: `At most ${PRD.mapsPerRun} map per run.`,
    run(ctx) {
      const maps = eventsOf(ctx.stored, "decodo.requested").filter(
        (r) => r.endpoint === "map",
      );
      return judge(
        maps.length > PRD.mapsPerRun
          ? [`${maps.length} maps: ${maps.map((m) => m.input).join(", ")}`]
          : [],
        `${maps.length} of ${PRD.mapsPerRun} maps`,
      );
    },
  },
  {
    id: "budget.no-reread",
    requirement: "B2",
    measures: "No page is read twice in a run.",
    run(ctx) {
      const urls = eventsOf(ctx.stored, "decodo.requested")
        .filter((r) => r.endpoint === "universal")
        .map((r) => r.input);
      const twice = [...countBy(urls, (u) => u)].filter(([, n]) => n > 1);
      return judge(
        twice.map(([url, n]) => `read ${n} times: ${url}`),
        `${urls.length} read attempts, ${new Set(urls).size} distinct pages`,
      );
    },
  },
  {
    id: "report.presence",
    requirement: "U5, B5",
    measures:
      "A completed run has exactly one report; a cancelled run has none.",
    run(ctx) {
      const n = eventsOf(ctx.stored, "report.finished").length;
      if (ctx.status === "CANCELLED") {
        const deltas = eventsOf(ctx.stored, "report.delta").length;
        return judge(
          n > 0 ? [`the cancelled run has ${n} report.finished events`] : [],
          "cancelled, no report",
          ...(deltas > 0
            ? [`${deltas} report deltas were streamed before the cancel`]
            : []),
        );
      }
      if (ctx.status === "COMPLETED") {
        return judge(
          n === 1 ? [] : [`${n} report.finished events, expected 1`],
          `completed, ${n} report`,
        );
      }
      return skip(
        `status ${ctx.status}: the PRD does not say what a failed run shows (open question 4)`,
      );
    },
  },
  {
    id: "report.citations",
    requirement: "V4",
    measures:
      "Every citation mark in the report names a verified claim, and the stored cited list matches the Markdown.",
    run(ctx) {
      const { parsed, report } = ctx;
      if (!parsed || !report) return skip("no report");
      const marks = [
        ...parsed.bodyCitations,
        ...parsed.sources.flatMap((s) => s.marks),
      ];
      const unknown = [...new Set(marks)].filter((n) => !ctx.verified.has(n));
      const problems = unknown.map(
        (n) => `[^${n}] is not a verified claim of this run`,
      );
      const inBody = [...new Set(parsed.bodyCitations)].sort((a, b) => a - b);
      const stored = [...new Set(report.cited)].sort((a, b) => a - b);
      if (inBody.join() !== stored.join()) {
        problems.push(
          `report.finished.cited [${stored.join(", ")}] differs from the marks in the Markdown [${inBody.join(", ")}]`,
        );
      }
      return judge(
        problems,
        `${inBody.length} distinct claims cited (${parsed.bodyCitations.length} marks), ${ctx.verified.size} verified`,
      );
    },
  },
  {
    id: "report.sources",
    requirement: "V4, R7",
    measures:
      "Every source is a page with a verified claim, its marks are claims of that page, and every cited page is listed.",
    run(ctx) {
      const { parsed } = ctx;
      if (!parsed || ctx.report?.writtenBy === "code") {
        return skip(
          parsed ? "the no-claims report has no source list (R6)" : "no report",
        );
      }
      const problems: string[] = [];
      if (!parsed.hasSourceList)
        problems.push("the report has no Sources heading");
      const listed = new Map(parsed.sources.map((s) => [s.url, s]));
      for (const source of parsed.sources) {
        const claims = [...ctx.verified.values()].filter(
          (c) => c.url === source.url,
        );
        if (claims.length === 0) {
          problems.push(`no verified claim cites ${source.url}`);
        }
        for (const n of source.marks) {
          const claim = ctx.verified.get(n);
          if (claim && claim.url !== source.url) {
            problems.push(
              `[^${n}] is listed under ${source.url} but quotes ${claim.url}`,
            );
          }
        }
      }
      for (const n of new Set(parsed.bodyCitations)) {
        const claim = ctx.verified.get(n);
        if (!claim) continue;
        const source = listed.get(claim.url);
        if (!source)
          problems.push(
            `[^${n}] cites ${claim.url}, which the source list lacks`,
          );
        else if (!source.marks.includes(n)) {
          problems.push(`[^${n}] is cited but missing from its source line`);
        }
      }
      return judge(problems, `${parsed.sources.length} sources`);
    },
  },
  {
    id: "report.source-entries",
    requirement: "R7, S2",
    measures:
      "Each source entry has a title, a domain that matches its link, one of the eight labels, the page's extracted label, and an http(s) link.",
    run(ctx) {
      const { parsed } = ctx;
      if (!parsed || ctx.report?.writtenBy === "code") {
        return skip(
          parsed ? "the no-claims report has no source list (R6)" : "no report",
        );
      }
      const labels = new Map(
        eventsOf(ctx.stored, "page.extracted").map((p) => [p.url, p.label]),
      );
      const problems = parsed.unparsedSourceLines.map(
        (line) => `not a source entry: ${short(line)}`,
      );
      for (const s of parsed.sources) {
        const at = short(s.url, 60);
        let host: string | null = null;
        try {
          const url = new URL(s.url);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            problems.push(`${at}: the link is ${url.protocol}`);
          }
          host = url.hostname.replace(/^www\./, "");
        } catch {
          problems.push(`${at}: the link is not a URL`);
        }
        if (s.title === "") problems.push(`${at}: no title`);
        if (s.domain === "") problems.push(`${at}: no domain`);
        else if (host !== null && s.domain !== host) {
          problems.push(`${at}: domain ${s.domain} but the link is on ${host}`);
        }
        if (!(SOURCE_LABELS as readonly string[]).includes(s.label)) {
          problems.push(
            `${at}: the label "${s.label}" is not one of the eight`,
          );
        } else if (labels.has(s.url) && labels.get(s.url) !== s.label) {
          problems.push(
            `${at}: listed as ${s.label}, extracted as ${labels.get(s.url)}`,
          );
        }
      }
      const byLabel = [...countBy(parsed.sources, (s) => s.label)]
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      return judge(problems, `${parsed.sources.length} entries (${byLabel})`);
    },
  },
  {
    id: "report.hygiene",
    requirement: "R1, R7",
    measures:
      "The report has no image, no raw HTML, no link outside the source list, and only http(s) links.",
    run(ctx) {
      const { parsed, report } = ctx;
      if (!parsed || !report) return skip("no report");
      const problems: string[] = [];
      const md = report.markdown;
      for (const m of md.matchAll(/!\[[^\]]*\]\([^)]*\)/g)) {
        problems.push(`image: ${short(m[0], 60)}`);
      }
      const noAutolinks = md.replace(/<https?:\/\/[^<>\s]+>/g, "");
      for (const m of noAutolinks.matchAll(
        /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>|<!--/g,
      )) {
        problems.push(`raw HTML: ${short(m[0], 60)}`);
      }
      const body = parsed.body.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
      for (const m of body.matchAll(/(?<!!)\[[^\]^][^\]]*\]\([^)]*\)/g)) {
        problems.push(`link outside the source list: ${short(m[0], 70)}`);
      }
      for (const m of body.matchAll(
        /<https?:\/\/[^>]+>|(?<![(<])\bhttps?:\/\/\S+/g,
      )) {
        problems.push(`URL outside the source list: ${short(m[0], 70)}`);
      }
      for (const m of body.matchAll(/^[ \t]*\[[^\]]+\]:.*$/gm)) {
        problems.push(`link or footnote definition: ${short(m[0], 70)}`);
      }
      return judge(problems, `${md.length} characters checked`);
    },
  },
  {
    id: "report.length",
    requirement: "R2",
    measures: `The report is ${PRD.reportWords.min} to ${PRD.reportWords.max} words (one page is 250 to 500 words).`,
    run(ctx) {
      const { report } = ctx;
      if (!report) return skip("no report");
      const words = wordCount(report.markdown);
      if (report.writtenBy === "code") {
        return skip(
          `${words} words; the no-claims report is short by design (R6)`,
        );
      }
      const { min, max } = PRD.reportWords;
      return judge(
        words < min || words > max
          ? [`${words} words, outside ${min} to ${max}`]
          : [],
        `${words} words, about ${(words / 500).toFixed(1)} single-spaced pages`,
      );
    },
  },
  {
    id: "report.opening",
    requirement: "R1",
    measures:
      "The report opens with a paragraph of answer, not with a heading and nothing under it.",
    run(ctx) {
      const { parsed } = ctx;
      if (!parsed) return skip("no report");
      const blocks = blocksOf(parsed.body);
      const first = blocks.findIndex((b) => b.kind !== "heading");
      if (blocks.length === 0) return judge(["the report is empty"]);
      if (first === -1) return judge(["the report has only headings"]);
      const problems =
        first > 1
          ? [
              `${first} headings before the first text: ${blocks
                .slice(0, first)
                .map((b) => b.text)
                .join(" / ")}`,
            ]
          : [];
      return judge(
        problems,
        `opens: "${short(blocks[first]?.text ?? "", 80)}"`,
      );
    },
  },
  {
    id: "report.uncited",
    requirement: "R3",
    measures:
      "Heuristic: sentences outside the source list that carry no citation mark. A human or an agent judges whether each states a fact (R4).",
    run(ctx) {
      const { parsed } = ctx;
      if (!parsed || ctx.report?.writtenBy === "code") {
        return skip(
          parsed ? "the no-claims report states no facts (R6)" : "no report",
        );
      }
      const sentences = blocksOf(parsed.body)
        .filter((b) => b.kind !== "heading")
        .flatMap((b) => sentencesOf(b.text));
      const bare = sentences.filter((s) => !/\[\^\d+\]/.test(s));
      return {
        status: bare.length > 0 ? "warn" : "pass",
        evidence: [
          `${bare.length} of ${sentences.length} sentences carry no citation (heuristic sentence split)`,
          ...bare.map((s) => `uncited: ${short(s, 110)}`),
        ],
      };
    },
  },
  {
    id: "visible.pages",
    requirement: "F1",
    measures:
      "Every granted read ends as read or failed, a failed page has a reason, and every read page has stored text.",
    run(ctx) {
      const { stored } = ctx;
      const reads = readsOf(stored);
      const granted = reads.flatMap((r) => r.attempted);
      const skipped = reads.flatMap((r) => r.skipped);
      const read = eventsOf(stored, "page.read");
      const failed = eventsOf(stored, "page.failed");
      const ended = new Map<string, number>();
      for (const p of [...read, ...failed])
        ended.set(p.url, (ended.get(p.url) ?? 0) + 1);
      const problems: string[] = [];
      const unfinished = granted.filter((u) => !ended.has(u));
      if (unfinished.length > 0 && ctx.status !== "CANCELLED") {
        problems.push(
          `${unfinished.length} granted pages have no read or failed state`,
        );
      }
      for (const [url, n] of ended)
        if (n > 1) problems.push(`${n} end states for ${url}`);
      for (const f of failed) {
        if (!f.failure?.kind || !f.failure.detail) {
          problems.push(`failed page without a reason: ${f.url}`);
        }
      }
      for (const r of read) {
        if (!stored.pages.has(r.url))
          problems.push(`no stored page text for ${r.url}`);
      }
      const found = new Set(
        eventsOf(stored, "search.finished").flatMap((s) =>
          s.outcome.status === "ok" ? s.outcome.results.map((r) => r.url) : [],
        ),
      );
      const skippedUrls = new Set(skipped.map((p) => p.url));
      const notChosen = [...found].filter(
        (u) => !granted.includes(u) && !skippedUrls.has(u),
      );
      const reasons = [...countBy(skipped, (p) => p.reason)]
        .map(([reason, n]) => `${n} ${reason}`)
        .join(", ");
      const kinds = [...countBy(failed, (f) => f.failure?.kind ?? "?")]
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      return judge(
        problems,
        `read ${read.length}, failed ${failed.length}${kinds ? ` (${kinds})` : ""}, skipped ${notChosen.length} found but not chosen${reasons ? ` and ${reasons}` : ""}`,
        ...(unfinished.length > 0
          ? [`${plural(unfinished.length, "read")} still open at the cancel`]
          : []),
      );
    },
  },
  {
    id: "visible.searches",
    requirement: "F2",
    measures:
      "Every search request has a result in the log, including a failed or empty one, and a failed search has a reason.",
    run(ctx) {
      const { stored } = ctx;
      const requested = eventsOf(stored, "decodo.requested").filter(
        (r) => r.endpoint === "google_search",
      );
      const finished = eventsOf(stored, "search.finished");
      const problems: string[] = [];
      const key = (round: number, query: string) => `${round}\u0001${query}`;
      const done = countBy(finished, (f) => key(f.round, f.query.query));
      const open = requested.filter((r) => !done.has(key(r.round, r.input)));
      if (open.length > 0 && ctx.status !== "CANCELLED") {
        problems.push(
          ...open.map(
            (r) => `no result for the search "${r.input}" in round ${r.round}`,
          ),
        );
      }
      let empty = 0;
      let failedN = 0;
      for (const f of finished) {
        if (f.outcome.status === "failed") {
          failedN += 1;
          if (!f.outcome.failure?.kind || !f.outcome.failure.detail) {
            problems.push(`failed search without a reason: "${f.query.query}"`);
          }
        } else if (f.outcome.results.length === 0) empty += 1;
      }
      return judge(
        problems,
        `searches ${finished.length} of ${requested.length} requested: failed ${failedN}, empty ${empty}`,
        ...(open.length > 0 && ctx.status === "CANCELLED"
          ? [
              `${plural(open.length, "search", "searches")} still open at the cancel`,
            ]
          : []),
      );
    },
  },
  {
    id: "visible.claims",
    requirement: "F3, V3",
    measures:
      "Every dropped claim names the failed check (V1 or V2), a reason and its quote; verified claim numbers are unique and come from read pages.",
    run(ctx) {
      const { stored } = ctx;
      const dropped = eventsOf(stored, "claim.dropped");
      const verified = eventsOf(stored, "claim.verified");
      const readUrls = new Set(eventsOf(stored, "page.read").map((p) => p.url));
      const problems: string[] = [];
      for (const d of dropped) {
        if (d.failed !== "V1" && d.failed !== "V2") {
          problems.push(
            `dropped claim with the check "${d.failed}": ${short(d.statement, 50)}`,
          );
        }
        if (!d.reason)
          problems.push(
            `dropped claim without a reason: ${short(d.statement, 50)}`,
          );
        if (!d.quote)
          problems.push(
            `dropped claim without a quote: ${short(d.statement, 50)}`,
          );
      }
      const numbers = countBy(verified, (v) => String(v.number));
      for (const [n, k] of numbers)
        if (k > 1) problems.push(`claim number ${n} is used ${k} times`);
      for (const v of verified) {
        if (!readUrls.has(v.url))
          problems.push(
            `[^${v.number}] quotes a page the run did not read: ${v.url}`,
          );
      }
      const byCheck = countBy(dropped, (d) => d.failed);
      return judge(
        problems,
        `verified ${verified.length}, dropped ${dropped.length} (V1 ${byCheck.get("V1") ?? 0}, V2 ${byCheck.get("V2") ?? 0})`,
      );
    },
  },
  {
    id: "v1.stored",
    requirement: "V1",
    measures:
      "Independent check: each verified quote appears word for word on the stored page text. Markup, whitespace and punctuation do not count; letters, digits and case do.",
    run(ctx) {
      const cited = new Set(ctx.parsed?.bodyCitations ?? []);
      const claims = [...ctx.verified.values()];
      if (claims.length === 0) return skip("no verified claims");
      const problems: string[] = [];
      let found = 0;
      for (const claim of claims) {
        const page = ctx.pageWords(claim.url);
        if (!page) {
          problems.push(
            `[^${claim.number}] has no stored page text: ${claim.url}`,
          );
          continue;
        }
        const verdict = page.find(claim.quote);
        if (verdict.found) found += 1;
        else if (verdict.reason === "empty-quote") {
          problems.push(`[^${claim.number}] has an empty quote`);
        } else {
          problems.push(
            `[^${claim.number}] not on ${claim.url}: quote "${short(claim.quote, 120)}"; closest page text (${verdict.closest.matched} of ${verdict.closest.of} words): "${short(verdict.closest.pageText, 120)}"`,
          );
        }
      }
      const citedFound = claims.filter(
        (c) => cited.has(c.number) && ctx.pageWords(c.url)?.find(c.quote).found,
      ).length;
      return judge(
        problems,
        `${found} of ${claims.length} verified quotes found; ${citedFound} of ${cited.size} cited quotes found, on ${new Set(claims.map((c) => c.url)).size} pages`,
      );
    },
  },
  {
    id: "v1.drops",
    requirement: "V1, V3",
    measures:
      "Information: quotes that the app dropped for V1 but that this check finds on the stored page. They fail closed (no bad quote gets through) but lose sources.",
    run(ctx) {
      const drops = eventsOf(ctx.stored, "claim.dropped").filter(
        (d) => d.failed === "V1",
      );
      if (drops.length === 0) return pass("no V1 drops");
      const onPage = drops.filter(
        (d) => ctx.pageWords(d.url)?.find(d.quote).found,
      );
      return {
        status: onPage.length > 0 ? "warn" : "pass",
        evidence: [
          `${onPage.length} of ${drops.length} V1 drops are on the stored page by this check`,
          ...onPage.map(
            (d) =>
              `on page but dropped: ${short(d.url, 50)} "${short(d.quote, 80)}"`,
          ),
        ],
      };
    },
  },
];

export function runChecks(stored: StoredRun): Check[] {
  const ctx = contextOf(stored);
  return CHECKS.map(({ run, ...spec }) => {
    try {
      return { ...spec, ...run(ctx) };
    } catch (error) {
      return {
        ...spec,
        status: "fail",
        evidence: [
          `the check crashed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  });
}

export function overall(checks: readonly Check[]): "pass" | "fail" | "warn" {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

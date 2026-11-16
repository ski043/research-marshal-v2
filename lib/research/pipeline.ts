import {
  BUDGET,
  FatalRunError,
  type MeteredWeb,
  type ReadOutcome,
  type Round,
  RunCancelled,
} from "./budget";
import {
  ClaimNumber,
  type PageUrl,
  type PipelineEvent,
  type RoundNo,
  type RunEnd,
  type SiteUrl,
  type StoppedBy,
  siteOf,
} from "./events";
import {
  MalformedAnswer,
  type ModelSteps,
  QUOTE_MAX_CHARS,
} from "./model-config";
import { numberItems, pickByNumber } from "./numbered";
import { QuotablePage } from "./quote-check";
import {
  checkCitations,
  finalizeReport,
  liveReport,
  noClaimsReport,
} from "./report";
import {
  candidatesOf,
  lastGap,
  type PageView,
  type RunView,
  subQuestionsOf,
} from "./run-view";

function nextClaimNumber(view: RunView): ClaimNumber {
  return ClaimNumber.parse(view.verified.length + 1);
}

export const LIMITS = Object.freeze({
  extractChars: 80_000,
  claimsPerPage: 8,
  mapLinks: 100,
  mapPicks: 3,
});

export type PipelineLog = {
  readonly view: RunView;
  emit: (body: PipelineEvent) => void;
  seal: (end: RunEnd) => void;
  settled: () => Promise<void>;
};

export type PipelineDeps = {
  model: ModelSteps;
  web: MeteredWeb;
  log: PipelineLog;
  savePage: (url: PageUrl, markdown: string) => Promise<void>;
  signal: AbortSignal;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stepOf(error: unknown): string {
  return error instanceof FatalRunError || error instanceof MalformedAnswer
    ? error.step
    : "pipeline";
}

async function settleAll(tasks: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function finish(log: PipelineLog): Promise<RunEnd> {
  await log.settled();
  const { end } = log.view;
  if (end === null) throw new Error("the run ended without run.finished");
  return end;
}

export async function runPipeline(deps: PipelineDeps): Promise<RunEnd> {
  const { log, signal } = deps;
  const cancel = () => log.seal({ status: "cancelled" });
  if (signal.aborted) {
    cancel();
    return finish(log);
  }
  signal.addEventListener("abort", cancel, { once: true });

  try {
    log.emit({ type: "run.started", limits: BUDGET });
    let stoppedBy: StoppedBy;
    try {
      stoppedBy = await research(deps);
    } catch (error) {
      if (signal.aborted) return await finish(log);
      log.emit({
        type: "run.error",
        step: stepOf(error),
        message: messageOf(error),
      });
      stoppedBy = "error";
    }

    try {
      await report(deps, stoppedBy);
      log.seal({ status: "completed", stoppedBy });
    } catch (error) {
      log.seal({ status: "failed", message: messageOf(error) });
    }
    return await finish(log);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function research(
  deps: PipelineDeps,
): Promise<"answered" | "budget" | "dead-end"> {
  const { model, web, log } = deps;
  const question = log.view.question;
  const searched: string[] = [];
  let queries = await model.plan({ question });

  for (;;) {
    const round = web.openRound(queries);
    if (round === null) return "budget";
    searched.push(...round.searches.map((search) => search.query.query));

    await settleAll(
      round.searches.map(async ({ query, outcome }) => {
        log.emit({
          type: "search.finished",
          round: round.no,
          query,
          outcome: await outcome,
        });
      }),
    );

    const candidates = numberItems(candidatesOf(log.view));
    if (candidates.length > 0) {
      const mapAvailable = log.view.budget.maps < BUDGET.mapsPerRun;
      const answer = await model.select({
        question,
        queries: round.searches.map((search) => search.query),
        candidates,
        mapAvailable,
      });
      const picked = pickByNumber(candidates, answer.picks);
      const mapPick = answer.map
        ? pickByNumber(candidates, [answer.map.result])
        : null;
      const mapFrom = mapPick?.items[0];
      const mapRequest =
        mapFrom && answer.map
          ? { site: siteOf(mapFrom.url), need: answer.map.need }
          : null;
      log.emit({
        type: "select.finished",
        round: round.no,
        picked: picked.items.map((candidate) => candidate.url),
        unknownNumbers: [...picked.unknown, ...(mapPick?.unknown ?? [])],
        mapRequest,
      });

      const fromMap = mapRequest
        ? await mapStep(deps, round, mapRequest.site, mapRequest.need)
        : [];
      await round.read(
        [...fromMap.map((url) => ({ url })), ...picked.items],
        (item, outcome) => readAndVerify(deps, round.no, item.url, outcome),
      );
    }

    if (round.isLast) return "budget";
    const gap = await model.checkGaps({
      question,
      subQuestions: subQuestionsOf(log.view),
      searched,
      claims: log.view.verified,
    });
    log.emit({
      type: "gap.checked",
      round: round.no,
      answered: gap.answered,
      missing: [...gap.missing],
      nextQueries: [...gap.queries],
    });
    if (gap.answered) return "answered";
    if (gap.queries.length === 0) return "dead-end";
    queries = gap.queries;
  }
}

async function mapStep(
  deps: PipelineDeps,
  round: Round,
  site: SiteUrl,
  need: string,
): Promise<readonly PageUrl[]> {
  const { model, log } = deps;
  const pending = round.map(site, LIMITS.mapLinks);
  if (pending === null) return [];
  const outcome = await pending;
  if (outcome.status === "failed") {
    log.emit({ type: "map.finished", round: round.no, site, outcome });
    return [];
  }
  const urls = numberItems(outcome.urls);
  const { picks } =
    urls.length > 0
      ? await model.pickFromMap({ question: log.view.question, need, urls })
      : { picks: [] };
  const picked = pickByNumber(urls, picks);
  const chosen = picked.items.slice(0, LIMITS.mapPicks);
  log.emit({
    type: "map.finished",
    round: round.no,
    site,
    outcome: {
      status: "ok",
      listed: outcome.urls.length,
      picked: [...chosen],
      unknownNumbers: [...picked.unknown],
    },
  });
  return chosen;
}

function titleOf(page: PageView | undefined, markdown: string, url: PageUrl) {
  if (page?.via === "search" && page.title.trim() !== "") return page.title;
  const heading = /^#{1,2}[ \t]+(.+)$/m.exec(markdown)?.[1]?.trim();
  return heading || new URL(url).hostname;
}

async function readAndVerify(
  deps: PipelineDeps,
  round: RoundNo,
  url: PageUrl,
  outcome: ReadOutcome,
): Promise<void> {
  const { model, log, savePage } = deps;
  if (outcome.status === "failed") {
    log.emit({ type: "page.failed", round, url, failure: outcome.failure });
    return;
  }
  await savePage(url, outcome.markdown);
  const title = titleOf(log.view.pages[url], outcome.markdown, url);
  log.emit({
    type: "page.read",
    round,
    url,
    title,
    chars: outcome.markdown.length,
  });

  let extracted: Awaited<ReturnType<ModelSteps["extract"]>>;
  try {
    extracted = await model.extract({
      question: log.view.question,
      subQuestions: subQuestionsOf(log.view),
      title,
      markdown: outcome.markdown.slice(0, LIMITS.extractChars),
    });
  } catch (error) {
    if (!(error instanceof MalformedAnswer)) throw error;
    log.emit({ type: "page.extract-failed", url, message: error.message });
    return;
  }
  log.emit({
    type: "page.extracted",
    url,
    label: extracted.label,
    drafts: extracted.claims.length,
  });

  const drafts = extracted.claims.slice(0, LIMITS.claimsPerPage);
  const page = new QuotablePage(outcome.markdown);
  const v1 = drafts.map((draft) =>
    draft.quote.length > QUOTE_MAX_CHARS
      ? ({
          found: false,
          reason: `too-long: over ${QUOTE_MAX_CHARS} characters`,
        } as const)
      : page.contains(draft.quote),
  );
  const v2 = await Promise.allSettled(
    drafts.map((draft, i) =>
      v1[i]?.found
        ? model.supports({ statement: draft.statement, quote: draft.quote })
        : Promise.resolve(null),
    ),
  );

  let fatal: { error: unknown } | null = null;
  for (const [i, draft] of drafts.entries()) {
    const quote = v1[i];
    const support = v2[i];
    if (quote === undefined || support === undefined) continue;
    const drop = (failed: "V1" | "V2", reason: string) =>
      log.emit({ type: "claim.dropped", url, ...draft, failed, reason });
    if (!quote.found) {
      drop("V1", quote.reason);
    } else if (support.status === "rejected") {
      if (!(support.reason instanceof MalformedAnswer)) {
        fatal ??= { error: support.reason };
      }
      drop(
        "V2",
        `the support check did not complete: ${messageOf(support.reason)}`,
      );
    } else if (support.value !== null && !support.value.supported) {
      drop("V2", support.value.reason);
    } else if (support.value !== null) {
      log.emit({
        type: "claim.verified",
        number: nextClaimNumber(log.view),
        url,
        ...draft,
      });
    }
  }
  if (fatal) throw fatal.error;
}

async function report(deps: PipelineDeps, stoppedBy: StoppedBy): Promise<void> {
  const { model, log, signal } = deps;
  const verified = log.view.verified;
  if (verified.length === 0) {
    log.emit({
      type: "report.finished",
      writtenBy: "code",
      markdown: noClaimsReport(log.view),
      cited: [],
      removedCitations: [],
    });
    return;
  }

  let draft = "";
  const live = liveReport(verified);
  for await (const chunk of model.writeReport({
    question: log.view.question,
    stoppedBy,
    missing: lastGap(log.view)?.missing ?? [],
    claims: verified,
  })) {
    if (signal.aborted) throw new RunCancelled();
    draft += chunk;
    const text = live.push(chunk);
    if (text !== "") log.emit({ type: "report.delta", text });
  }
  const rest = live.end();
  if (rest !== "") log.emit({ type: "report.delta", text: rest });
  const checked = await checkCitations({
    draft,
    question: log.view.question,
    verified,
    model,
  });
  const final = finalizeReport(checked.draft, verified);
  log.emit({ type: "report.checked", ...checked.check });
  log.emit({
    type: "report.finished",
    writtenBy: "model",
    markdown: final.markdown,
    cited: [...final.cited],
    removedCitations: [...checked.removedCitations],
  });
}

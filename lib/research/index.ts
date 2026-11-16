import { readEnv, readFakesPace } from "@/lib/env";
import { meterWeb, type WebActions } from "./budget";
import { createDecodoWeb, sdkPort } from "./decodo";
import type {
  ModelCall,
  ModelChoice,
  Question,
  RunEnd,
  RunEvent,
  RunId,
} from "./events";
import { createModelSteps } from "./model";
import type { ModelSteps } from "./model-config";
import { runPipeline } from "./pipeline";
import { createRunLog } from "./run-log";
import { createView, type RunView, replay } from "./run-view";
import { openStore, type RunSummary } from "./store";

export type { RunSummary } from "./store";

export type StartedRun = { runId: RunId; finished: Promise<RunEnd> };

/**
 * The web and the model a run talks to. `startRun` uses Decodo and Anthropic when none are
 * given, or the offline fakes when `RESEARCH_MARSHAL_FAKES` is set. Only the Anthropic model
 * records `model.called` events; a fake model makes no call.
 */
export type RunPorts = { web: WebActions; model: ModelSteps };

/** One stored run: its row, the view derived from its events, and the events themselves. */
export type RunRecord = {
  summary: RunSummary;
  view: RunView;
  events: readonly RunEvent[];
};

const POLL_MS = 200;

const globalForRuns = globalThis as typeof globalThis & {
  activeRuns?: Map<RunId, AbortController>;
};
// `next dev` re-evaluates this module, and a new map would lose the runs that are still going.
globalForRuns.activeRuns ??= new Map();
const activeRuns = globalForRuns.activeRuns;

const store = openStore();

// Reads the keys at once, so a missing key fails before the run is stored.
function livePorts(
  signal: AbortSignal,
  model: ModelChoice,
): (record: (call: ModelCall) => void) => RunPorts {
  const keys = readEnv(["ANTHROPIC_API_KEY", "DECODO_AUTH_TOKEN"]);
  return (record) => ({
    web: createDecodoWeb(sdkPort(keys.DECODO_AUTH_TOKEN)),
    model: createModelSteps({
      apiKey: keys.ANTHROPIC_API_KEY,
      model,
      signal,
      record,
    }),
  });
}

/** True when `RESEARCH_MARSHAL_FAKES` makes every run without ports run on the offline fakes. */
export function fakesEnabled(): boolean {
  return readFakesPace() !== null;
}

// The scenario whose name is the question, so a browser can pick one by typing it.
async function fakePorts(
  question: Question,
  paceMs: number,
): Promise<RunPorts> {
  const { SCENARIOS, offlinePorts } = await import("./offline");
  const scenario =
    SCENARIOS.get(question.trim().toLowerCase()) ?? SCENARIOS.get("completed");
  if (!scenario) throw new Error("the offline scenario completed is missing");
  return offlinePorts(scenario, paceMs);
}

export async function startRun(
  request: { question: Question; model: ModelChoice },
  ports?: RunPorts,
): Promise<StartedRun> {
  const { question, model: choice } = request;
  const controller = new AbortController();
  const { signal } = controller;
  const paceMs = ports ? null : readFakesPace();
  const given =
    ports ?? (paceMs === null ? null : await fakePorts(question, paceMs));
  const connect = given ? () => given : livePorts(signal, choice);
  const runId = await store.createRun({ question, model: choice });
  const log = createRunLog({
    runId,
    question,
    persist: (event) => store.appendEvent(runId, event),
    now: () => new Date(),
  });
  const { web: port, model } = connect(log.emit);
  const web = meterWeb({
    web: port,
    emit: log.emit,
    signal,
    now: () => performance.now(),
  });
  activeRuns.set(runId, controller);
  const finished = runPipeline({
    model,
    web,
    log,
    savePage: (url, markdown) => store.savePageText(runId, url, markdown),
    signal,
  }).finally(() => activeRuns.delete(runId));
  return { runId, finished };
}

export function cancelRun(runId: RunId): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export async function* followRun(
  runId: RunId,
  options: { after?: number; signal?: AbortSignal } = {},
): AsyncIterable<RunEvent> {
  let after = options.after ?? 0;
  let sealed = false;
  while (!options.signal?.aborted) {
    const events = await store.readEvents(runId, after);
    for (const event of events) {
      yield event;
      after = event.seq;
      if (event.type === "run.finished") return;
    }
    if (sealed) return;
    if (events.length === 0) {
      const run = await store.readRun(runId);
      sealed = run === null || run.status !== "running";
      // One more read, because the run may have sealed after the read above.
      if (sealed) continue;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export async function loadRun(runId: RunId): Promise<RunView | null> {
  return (await loadRunRecord(runId))?.view ?? null;
}

/** Throws when the stored events do not replay, for example after a gap in `seq`. */
export async function loadRunRecord(runId: RunId): Promise<RunRecord | null> {
  const summary = await store.readRun(runId);
  if (!summary) return null;
  const events = await store.readEvents(runId, 0);
  const view = replay(createView(runId, summary.question), events);
  return { summary, view, events };
}

/** The row of a run without its events: enough to tell whether the run has ended. */
export async function loadRunSummary(runId: RunId): Promise<RunSummary | null> {
  return store.readRun(runId);
}

export async function listRuns(): Promise<readonly RunSummary[]> {
  return store.listRuns();
}

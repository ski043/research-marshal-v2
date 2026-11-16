import { readEnv } from "@/lib/env";
import { meterWeb, type WebActions } from "./budget";
import { createDecodoWeb, sdkPort } from "./decodo";
import type { Question, RunEnd, RunEvent, RunId } from "./events";
import { createModelSteps } from "./model";
import type { ModelSteps } from "./model-config";
import { runPipeline } from "./pipeline";
import { createRunLog } from "./run-log";
import { createView, type RunView, replay } from "./run-view";
import { openStore, type RunSummary } from "./store";

export type { RunSummary } from "./store";

export type StartedRun = { runId: RunId; finished: Promise<RunEnd> };

/** The web and the model a run talks to. `startRun` uses Decodo and Anthropic when none are given. */
export type RunPorts = { web: WebActions; model: ModelSteps };

/** One stored run: its row, the view derived from its events, and the events themselves. */
export type RunRecord = {
  summary: RunSummary;
  view: RunView;
  events: readonly RunEvent[];
};

const POLL_MS = 200;

const activeRuns = new Map<RunId, AbortController>();

const store = openStore();

function livePorts(signal: AbortSignal): RunPorts {
  const keys = readEnv(["ANTHROPIC_API_KEY", "DECODO_AUTH_TOKEN"]);
  return {
    web: createDecodoWeb(sdkPort(keys.DECODO_AUTH_TOKEN)),
    model: createModelSteps({ apiKey: keys.ANTHROPIC_API_KEY, signal }),
  };
}

export async function startRun(
  question: Question,
  ports?: RunPorts,
): Promise<StartedRun> {
  const controller = new AbortController();
  const { signal } = controller;
  const { web: port, model } = ports ?? livePorts(signal);
  const runId = await store.createRun(question);
  const log = createRunLog({
    runId,
    question,
    persist: (event) => store.appendEvent(runId, event),
    now: () => new Date(),
  });
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
  while (!options.signal?.aborted) {
    for (const event of await store.readEvents(runId, after)) {
      yield event;
      after = event.seq;
      if (event.type === "run.finished") return;
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

export async function listRuns(): Promise<readonly RunSummary[]> {
  return store.listRuns();
}

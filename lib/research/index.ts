import { env } from "@/lib/env";
import { meterWeb } from "./budget";
import { createDecodoWeb, sdkPort } from "./decodo";
import type { Question, RunEnd, RunEvent, RunId } from "./events";
import { createModelSteps } from "./model";
import { runPipeline } from "./pipeline";
import { createRunLog } from "./run-log";
import { createView, type RunView, replay } from "./run-view";
import { openStore, type RunSummary } from "./store";

export type { RunSummary } from "./store";

export type StartedRun = { runId: RunId; finished: Promise<RunEnd> };

const POLL_MS = 200;

const globalForRuns = globalThis as typeof globalThis & {
  activeRuns?: Map<RunId, AbortController>;
};
// Dev hot reloads re-evaluate this module; the active runs must survive them.
globalForRuns.activeRuns ??= new Map();
const activeRuns = globalForRuns.activeRuns;

const store = openStore();

// Resolves as soon as the Run row exists. The run goes on in this process.
export async function startRun(question: Question): Promise<StartedRun> {
  const runId = await store.createRun(question);
  const controller = new AbortController();
  const { signal } = controller;
  const log = createRunLog({
    runId,
    question,
    persist: (event) => store.appendEvent(runId, event),
    now: () => new Date(),
  });
  const web = meterWeb({
    web: createDecodoWeb(sdkPort(env.DECODO_AUTH_TOKEN)),
    emit: log.emit,
    signal,
    now: () => performance.now(),
  });
  const model = createModelSteps({ apiKey: env.ANTHROPIC_API_KEY, signal });
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

// U5. False when the run is not active in this process.
export function cancelRun(runId: RunId): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

// The stored events after `after`, then each new event as it is stored, until
// run.finished. It polls SQLite, so a reader shares no memory with the pipeline.
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
  const run = await store.readRun(runId);
  if (!run) return null;
  return replay(
    createView(runId, run.question),
    await store.readEvents(runId, 0),
  );
}

export async function listRuns(): Promise<readonly RunSummary[]> {
  return store.listRuns();
}

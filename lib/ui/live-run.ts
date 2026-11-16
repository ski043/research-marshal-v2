import type { Question, RunEvent, RunId } from "@/lib/research/events";
import { applyEvent, createView, type RunView } from "@/lib/research/run-view";

export type LiveRun = { view: RunView; events: readonly RunEvent[] };

export function startLiveRun(
  runId: RunId,
  question: Question,
  events: readonly RunEvent[],
): LiveRun {
  return addEvents({ view: createView(runId, question), events: [] }, events);
}

/**
 * Folds a batch of events into the run with the reducer of the store. An event that the
 * run already has is dropped, so a resumed stream cannot repeat a step. The batch stops
 * at a gap in `seq`: the stream resumes after the last event that was applied.
 */
export function addEvents(run: LiveRun, batch: readonly RunEvent[]): LiveRun {
  let { view } = run;
  const added: RunEvent[] = [];
  for (const event of batch) {
    if (event.seq <= view.lastSeq) continue;
    if (event.seq !== view.lastSeq + 1 || view.status !== "running") break;
    view = applyEvent(view, event);
    added.push(event);
  }
  return added.length === 0 ? run : { view, events: [...run.events, ...added] };
}

import type {
  EmittableEvent,
  Question,
  RunEnd,
  RunEvent,
  RunEventBody,
  RunId,
} from "./events";
import { applyEvent, createView, type RunView } from "./run-view";

export type RunLog = {
  readonly view: RunView;
  emit(body: EmittableEvent): void;
  // The first seal wins. After it, emit and seal do nothing, so whatever still runs
  // after a cancel writes into a sealed log (U5).
  seal(end: RunEnd): void;
  settled(): Promise<void>;
};

// The single writer of a run. emit is synchronous, so parallel page tasks never race
// on seq or on the next claim number.
export function createRunLog(deps: {
  runId: RunId;
  question: Question;
  persist: (event: RunEvent) => Promise<void>;
  now: () => Date;
}): RunLog {
  let view = createView(deps.runId, deps.question);
  let sealed = false;
  let queue: Promise<void> = Promise.resolve();
  let failure: { error: unknown } | null = null;

  function append(body: RunEventBody): void {
    const event: RunEvent = {
      ...body,
      seq: view.lastSeq + 1,
      at: deps.now().toISOString(),
    };
    view = applyEvent(view, event);
    queue = queue
      .then(() => deps.persist(event))
      .catch((error: unknown) => {
        failure ??= { error };
      });
  }

  return {
    get view() {
      return view;
    },
    emit(body) {
      if (!sealed) append(body);
    },
    seal(end) {
      if (sealed) return;
      append({ type: "run.finished", end });
      sealed = true;
    },
    async settled() {
      await queue;
      if (failure) throw failure.error;
    },
  };
}

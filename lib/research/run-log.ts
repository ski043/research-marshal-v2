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
  seal(end: RunEnd): void;
  settled(): Promise<void>;
};

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
    // After one failed write nothing more is stored. A later event would leave a gap in
    // seq, and replay rejects a log with a gap.
    queue = queue
      .then(() => (failure ? undefined : deps.persist(event)))
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

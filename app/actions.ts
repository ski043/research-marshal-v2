"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelRun, loadRunSummary, startRun } from "@/lib/research";
import { ModelChoice, Question, RunId } from "@/lib/research/events";

export type StartState = { error: string | null };
export type CancelResult = { message: string | null };

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "The run could not start.";

async function start(request: {
  question: Question;
  model: ModelChoice;
}): Promise<StartState> {
  let runId: RunId;
  try {
    const run = await startRun(request);
    runId = run.runId;
    // The run goes on after this action returns. Its end is stored by the run itself.
    run.finished.catch((error: unknown) => {
      console.error(`run ${runId} did not settle`, error);
    });
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/runs/${runId}`);
}

export async function startRunAction(
  _previous: StartState,
  formData: FormData,
): Promise<StartState> {
  const text = formData.get("question");
  const question = Question.safeParse(text);
  if (!question.success) {
    return {
      error:
        typeof text === "string" && text.trim() !== ""
          ? "The question is too long. Keep it under 2,000 characters."
          : "Type a question first.",
    };
  }
  const model = ModelChoice.safeParse(formData.get("model"));
  if (!model.success) return { error: "Choose one of the four models." };
  return start({ question: question.data, model: model.data });
}

/** Starts a new run with the question and the model of `runId` (U10, M4). The old run stays as it is. */
export async function rerunAction(
  runId: string,
  _previous: StartState,
): Promise<StartState> {
  const id = RunId.safeParse(runId);
  const summary = id.success ? await loadRunSummary(id.data) : null;
  if (!summary) return { error: "This run is not stored any more." };
  return start({ question: summary.question, model: summary.model });
}

export async function cancelRunAction(runId: string): Promise<CancelResult> {
  const id = RunId.safeParse(runId);
  if (!id.success) return { message: "This run is not stored." };
  if (cancelRun(id.data)) return { message: null };
  const summary = await loadRunSummary(id.data);
  if (summary?.status !== "running") return { message: null };
  return {
    message:
      "This run is not running in this app process, so it cannot be cancelled here.",
  };
}

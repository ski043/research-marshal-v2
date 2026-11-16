import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RunScreen } from "@/components/run/run-screen";
import { loadRunRecord, loadRunSummary, type RunRecord } from "@/lib/research";
import { RunId } from "@/lib/research/events";
import { MODELS } from "@/lib/research/model-config";

type StoredRun = {
  createdAt: string;
  events: RunRecord["events"];
};

async function readRun(runId: RunId): Promise<StoredRun | null> {
  const record = await loadRunRecord(runId);
  if (!record) return null;
  return {
    createdAt: record.summary.createdAt.toISOString(),
    events: record.events,
  };
}

// A run that has ended is read-only (U9), so its record never goes out of date.
async function readEndedRun(runId: RunId): Promise<StoredRun | null> {
  "use cache";
  return readRun(runId);
}

async function summaryOf(params: Promise<{ runId: string }>) {
  const { runId } = await params;
  const id = RunId.safeParse(runId);
  if (!id.success) return null;
  // The status of a run changes while it runs, so the row is read on every request.
  await connection();
  return loadRunSummary(id.data);
}

export async function generateMetadata({
  params,
}: PageProps<"/runs/[runId]">): Promise<Metadata> {
  const summary = await summaryOf(params);
  return { title: summary ? summary.question : "Run not found" };
}

async function Run({ params }: { params: Promise<{ runId: string }> }) {
  const summary = await summaryOf(params);
  if (!summary) notFound();
  const run =
    summary.status === "running"
      ? await readRun(summary.runId)
      : await readEndedRun(summary.runId);
  if (!run) notFound();
  return (
    <RunScreen
      key={summary.runId}
      runId={summary.runId}
      question={summary.question}
      modelName={MODELS[summary.model].name}
      createdAt={run.createdAt}
      events={run.events}
    />
  );
}

function RunFallback() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:border lg:shadow-xs"
    >
      <div className="h-13 shrink-0 border-b" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-6">
        <div className="ms-auto h-10 w-2/3 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
      <span className="sr-only">Loading the run</span>
    </main>
  );
}

export default function RunPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <Suspense fallback={<RunFallback />}>
      <Run params={params} />
    </Suspense>
  );
}

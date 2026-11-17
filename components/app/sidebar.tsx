import { FlaskConicalIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark, Wordmark } from "@/components/app/brand-mark";
import { HistoryList } from "@/components/app/history-list";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
import { fakesEnabled, listRuns } from "@/lib/research";
import { MODELS } from "@/lib/research/model-config";

// The history changes with every run, so it is read at request time and never cached.
async function History() {
  await connection();
  const runs = await listRuns();
  return (
    <HistoryList
      now={new Date().toISOString()}
      runs={runs.map((run) => ({
        runId: run.runId,
        question: run.question,
        status: run.status,
        model: MODELS[run.model].name,
        createdAt: run.createdAt.toISOString(),
      }))}
    />
  );
}

function HistoryFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2" aria-hidden>
      <div className="h-9" />
      <div className="flex flex-col gap-4 px-2.5 pt-9">
        {[72, 88, 64, 80].map((width) => (
          <div
            key={width}
            className="h-4 animate-pulse rounded-md bg-sidebar-accent motion-reduce:animate-none"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}

async function FakesBadge() {
  await connection();
  if (!fakesEnabled()) return null;
  return (
    <span
      title="RESEARCH_MARSHAL_FAKES is set: runs use the offline fakes and send no paid request."
      className="ms-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <FlaskConicalIcon aria-hidden className="size-3.5" />
      Offline fakes
    </span>
  );
}

export function Sidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-13 shrink-0 items-center px-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        >
          <BrandMark />
          <Wordmark />
        </Link>
      </div>
      <div className="px-2 pt-1">
        <Link
          href="/"
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring active:bg-sidebar-accent"
        >
          <SquarePenIcon aria-hidden className="size-4" />
          New question
        </Link>
      </div>
      <Suspense fallback={<HistoryFallback />}>
        <History />
      </Suspense>
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <ThemeSwitcher />
        <Suspense fallback={null}>
          <FakesBadge />
        </Suspense>
      </div>
    </div>
  );
}

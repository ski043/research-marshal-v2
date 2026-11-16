import { FlaskConicalIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark } from "@/components/app/brand-mark";
import { HistoryList } from "@/components/app/history-list";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { fakesEnabled, listRuns } from "@/lib/research";
import { MODELS } from "@/lib/research/model-config";
import { cn } from "@/lib/utils";

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
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3" aria-hidden>
      <div className="h-8 rounded-lg bg-sidebar-accent" />
      {[72, 88, 64, 80].map((width) => (
        <div
          key={width}
          className="h-5 animate-pulse rounded-md bg-sidebar-accent motion-reduce:animate-none"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

async function FakesBadge() {
  await connection();
  if (!fakesEnabled()) return null;
  return (
    <span
      title="RESEARCH_MARSHAL_FAKES is set: runs use the offline fakes and send no paid request."
      className="ms-auto inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-input px-2 text-xs font-medium text-muted-foreground"
    >
      <FlaskConicalIcon aria-hidden className="size-3" />
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
          className="flex items-center gap-2 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        >
          <BrandMark />
          <span className="font-semibold tracking-tight">Research Marshal</span>
        </Link>
      </div>
      <div className="px-3 pb-2">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-start bg-background",
          )}
        >
          <SquarePenIcon aria-hidden />
          New question
        </Link>
      </div>
      <Suspense fallback={<HistoryFallback />}>
        <History />
      </Suspense>
      <div className="flex shrink-0 items-center gap-2 p-3">
        <ThemeSwitcher />
        <Suspense fallback={null}>
          <FakesBadge />
        </Suspense>
      </div>
    </div>
  );
}

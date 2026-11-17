import { FlaskConicalIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark, Wordmark } from "@/components/app/brand-mark";
import { HistoryList } from "@/components/app/history-list";
import {
  ICON_BUTTON,
  LABEL,
  RAIL_ONLY,
  ROW,
  WIDE_ONLY,
} from "@/components/app/sidebar-classes";
import { SidebarToggle } from "@/components/app/sidebar-rail";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
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
  const title =
    "RESEARCH_MARSHAL_FAKES is set: runs use the offline fakes and send no paid request.";
  return (
    <>
      <span
        title={title}
        className={cn(
          "ms-auto inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground",
          WIDE_ONLY,
        )}
      >
        <FlaskConicalIcon aria-hidden className="size-3.5" />
        Offline fakes
      </span>
      <span
        role="img"
        aria-label={`Offline fakes. ${title}`}
        title={title}
        className={cn(
          ICON_BUTTON,
          RAIL_ONLY,
          "absolute bottom-13 left-2 text-muted-foreground hover:bg-transparent",
        )}
      >
        <FlaskConicalIcon aria-hidden className="size-4" />
      </span>
    </>
  );
}

export function Sidebar() {
  return (
    // From 1024px up the content keeps its full width while the rail clips it, so no
    // label wraps during the change. Every icon sits 26px from the left in both states.
    <div className="relative flex h-full min-h-0 flex-col lg:w-[260px]">
      <div className="flex h-13 shrink-0 items-center px-3">
        {/* On the rail the label is gone and the title names the icon. */}
        <Link
          href="/"
          title="Research Marshal"
          className="flex max-w-56 items-center gap-2.5 overflow-hidden rounded-lg transition-[max-width] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none rail:max-w-7"
        >
          <BrandMark />
          <Wordmark className={LABEL} />
        </Link>
      </div>
      <SidebarToggle />
      {/* On the rail the toggle moves into the row under the mark; this makes room. */}
      <div
        aria-hidden
        className="h-0 shrink-0 transition-[height] duration-200 ease-out motion-reduce:transition-none rail:h-10"
      />
      <div className="px-2 pt-1">
        <Link href="/" title="New question" className={ROW}>
          <SquarePenIcon aria-hidden className="size-4 shrink-0" />
          <span className={LABEL}>New question</span>
        </Link>
      </div>
      <Suspense fallback={<HistoryFallback />}>
        <History />
      </Suspense>
      <div className="relative flex h-12 shrink-0 items-center gap-2 px-3">
        <ThemeSwitcher />
        <Suspense fallback={null}>
          <FakesBadge />
        </Suspense>
      </div>
    </div>
  );
}

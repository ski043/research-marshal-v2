"use client";

import {
  CircleAlertIcon,
  PanelRightIcon,
  RotateCwIcon,
  SquareIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { cancelRunAction, rerunAction, type StartState } from "@/app/actions";
import { SidebarTrigger } from "@/components/app/app-shell";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import { Elapsed } from "@/components/run/elapsed";
import { ProgressPanel } from "@/components/run/progress-panel";
import { Report } from "@/components/run/report";
import { RunNotice } from "@/components/run/run-notice";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Question, RunEvent, RunId } from "@/lib/research/events";
import type { RunView } from "@/lib/research/run-view";
import { activityOf, currentAction } from "@/lib/ui/activity";
import { formatDateTime } from "@/lib/ui/format";
import { useStored } from "@/lib/ui/storage";
import { PANEL_KEY } from "@/lib/ui/theme";
import { useFollow } from "@/lib/ui/use-follow";
import { useLiveRun } from "@/lib/ui/use-live-run";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { cn } from "@/lib/utils";

const NO_ERROR: StartState = { error: null };
const PANEL = { default: 380, min: 320, max: 560 } as const;
const DOCKED = "(min-width: 1024px)";

type Panel = { open: boolean; width: number };

function readPanel(stored: string | null): Panel {
  try {
    const value = JSON.parse(stored ?? "{}");
    return {
      open: value.open !== false,
      width:
        typeof value.width === "number"
          ? Math.min(PANEL.max, Math.max(PANEL.min, value.width))
          : PANEL.default,
    };
  } catch {
    return { open: true, width: PANEL.default };
  }
}

// The dock reads both values in CSS, so the page looks right before React has loaded.
function showPanel(panel: Panel): void {
  const root = document.documentElement;
  if (panel.open) delete root.dataset.panel;
  else root.dataset.panel = "closed";
  root.style.setProperty("--panel-width", `${panel.width}px`);
}

const ANNOUNCE: Readonly<Record<RunView["status"], string>> = {
  running: "The run has started.",
  completed: "The run has finished. The report is ready.",
  cancelled: "The run was cancelled. It wrote no report.",
  failed: "The run failed.",
};

function RerunButton({
  runId,
  onError,
  quiet = false,
}: {
  runId: RunId;
  onError: (message: string) => void;
  // Beside the question it repeats, not as the one action of a notice.
  quiet?: boolean;
}) {
  const [state, action, pending] = useActionState(
    rerunAction.bind(null, runId),
    NO_ERROR,
  );
  useEffect(() => {
    if (state.error) onError(state.error);
  }, [state, onError]);
  return (
    <form action={action}>
      <Button
        type="submit"
        variant={quiet ? "ghost" : "default"}
        size={quiet ? "xs" : "sm"}
        className={quiet ? "text-muted-foreground" : undefined}
        disabled={pending}
      >
        {pending ? <GlyphSpinner /> : <RotateCwIcon aria-hidden />}
        Re-run
      </Button>
    </form>
  );
}

export function RunScreen({
  runId,
  question,
  modelName,
  createdAt,
  events,
}: {
  runId: RunId;
  question: Question;
  modelName: string;
  createdAt: string;
  events: readonly RunEvent[];
}) {
  const run = useLiveRun({ runId, question, events });
  const { view } = run;
  const { status } = view;
  const running = status === "running";

  const groups = useMemo(
    () => activityOf(view, run.events),
    [view, run.events],
  );
  const action = currentAction(groups);
  const startedAt = run.events[0]?.at ?? null;
  const endedAt = running ? null : (run.events.at(-1)?.at ?? null);
  const totalMs =
    startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null;

  const [actionNotice, setNotice] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();
  const cancel = () =>
    startCancel(async () => {
      const result = await cancelRunAction(runId);
      setNotice(result.message);
    });
  const notice =
    actionNotice ??
    (run.connectionLost
      ? "The live connection to this run was lost. The app keeps trying to reconnect; the run itself goes on."
      : null);

  const [stored, store] = useStored(PANEL_KEY);
  const panel = readPanel(stored);
  // From 1024px up the panel is docked beside the run. Below that it is a sheet.
  const docked = useMediaQuery(DOCKED, true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelShown = docked ? panel.open : sheetOpen;
  const savePanel = (next: Panel) => {
    showPanel(next);
    store(JSON.stringify(next));
  };
  const togglePanel = () => {
    if (docked) savePanel({ ...panel, open: !panel.open });
    else setSheetOpen(true);
  };
  const closePanel = () => {
    setSheetOpen(false);
    if (docked) savePanel({ ...panel, open: false });
  };

  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (width: number) =>
    Math.round(
      Math.min(
        PANEL.max,
        Math.max(PANEL.min, Math.min(width, window.innerWidth - 700)),
      ),
    );
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: panel.width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const width = clamp(drag.current.width + drag.current.x - event.clientX);
    showPanel({ open: true, width });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const width = clamp(drag.current.width + drag.current.x - event.clientX);
    drag.current = null;
    setDragging(false);
    savePanel({ open: true, width });
  };
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const widths: Partial<Record<string, number>> = {
      ArrowLeft: panel.width + step,
      ArrowRight: panel.width - step,
      Home: PANEL.max,
      End: PANEL.min,
      Enter: PANEL.default,
    };
    const width = widths[event.key];
    if (width === undefined) return;
    event.preventDefault();
    savePanel({ open: true, width: clamp(width) });
  };

  // Announces a change of the status, not the status a stored run already had.
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef<RunView["status"] | null>(null);
  useEffect(() => {
    const first = announced.current === null;
    if (announced.current === status) return;
    announced.current = status;
    if (!first || running) setAnnouncement(ANNOUNCE[status]);
  }, [status, running]);

  const reportLength = view.report?.markdown.length ?? 0;
  const thread = useFollow<HTMLDivElement>(reportLength, running);

  const progress = (
    <ProgressPanel
      view={view}
      groups={groups}
      startedAt={startedAt}
      totalMs={totalMs}
      onClose={closePanel}
    />
  );

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:border lg:shadow-xs">
        <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3 lg:px-4">
          <SidebarTrigger />
          <h1
            title={question}
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            {question}
          </h1>
          {running && (
            <>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <GlyphSpinner className="text-sm" />
                <span className="sr-only sm:not-sr-only">Running</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                disabled={cancelling}
              >
                <SquareIcon aria-hidden className="size-3 fill-current" />
                Cancel
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Progress panel"
            aria-label={
              panelShown ? "Hide the progress panel" : "Show the progress panel"
            }
            aria-expanded={panelShown}
            onClick={togglePanel}
          >
            <PanelRightIcon />
          </Button>
        </header>

        <div
          ref={thread}
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 lg:px-6">
            <div className="flex flex-col items-end gap-1.5">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-pretty break-words whitespace-pre-wrap">
                {question}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <p>
                  {modelName} · {formatDateTime(new Date(createdAt))}
                </p>
                {view.report && !running && (
                  <RerunButton runId={runId} onError={setNotice} quiet />
                )}
              </div>
            </div>

            {notice && (
              <p
                role="alert"
                className="flex animate-in items-start gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive duration-200 fade-in motion-reduce:animate-none"
              >
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 break-words">{notice}</span>
              </p>
            )}

            {view.report ? (
              <Report report={view.report} verified={view.verified} />
            ) : running ? (
              <div
                data-slot="report-placeholder"
                className="flex flex-col gap-2.5 rounded-xl border border-dashed p-4"
              >
                <p className="flex min-h-5 items-center gap-2 text-sm">
                  <GlyphSpinner />
                  <span
                    key={action}
                    className="min-w-0 animate-in duration-200 fade-in motion-reduce:animate-none"
                  >
                    {action ?? "Starting the run"}
                  </span>
                  <Elapsed
                    since={startedAt}
                    className="ms-auto font-mono text-xs tabular-nums text-muted-foreground"
                  />
                </p>
                {[92, 78, 85, 52].map((width) => (
                  <span
                    key={width}
                    aria-hidden
                    className="h-2 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
                    style={{ width: `${width}%` }}
                  />
                ))}
                <p className="text-xs text-muted-foreground">
                  The report appears here while the run writes it.
                </p>
              </div>
            ) : status === "cancelled" ? (
              <RunNotice
                variant="cancelled"
                title="This run was cancelled"
                action={<RerunButton runId={runId} onError={setNotice} />}
              >
                <p>
                  A cancelled run writes no report. Every step it took before
                  the cancel is kept in the progress panel.
                </p>
              </RunNotice>
            ) : (
              <RunNotice
                variant="failed"
                title="This run failed"
                action={<RerunButton runId={runId} onError={setNotice} />}
              >
                <p>The run ended without a report. The store holds this:</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2 text-left font-mono text-xs">
                  <dt>status</dt>
                  <dd className="text-foreground">{status}</dd>
                  {view.error && (
                    <>
                      <dt>step</dt>
                      <dd className="text-foreground">{view.error.step}</dd>
                    </>
                  )}
                  <dt>message</dt>
                  <dd className="break-words text-foreground">
                    {view.end?.status === "failed"
                      ? view.end.message
                      : (view.error?.message ?? "none")}
                  </dd>
                </dl>
              </RunNotice>
            )}
          </div>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </main>

      <div
        data-dragging={dragging || undefined}
        className="hidden w-[calc(var(--panel-width,380px)+0.5rem)] shrink-0 overflow-hidden transition-[width,opacity,visibility] duration-200 ease-out data-dragging:transition-none motion-reduce:transition-none lg:flex [[data-panel=closed]_&]:invisible [[data-panel=closed]_&]:w-0 [[data-panel=closed]_&]:opacity-0"
      >
        {/* biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable separator with a value, which <hr> cannot be */}
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize the progress panel"
          aria-orientation="vertical"
          aria-valuemin={PANEL.min}
          aria-valuemax={PANEL.max}
          aria-valuenow={panel.width}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => savePanel({ open: true, width: PANEL.default })}
          onKeyDown={onHandleKey}
          className="group/handle relative flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none before:absolute before:inset-y-0 before:-inset-x-1"
        >
          <span
            className={cn(
              "h-8 w-1 rounded-full bg-border transition-[background-color,height] duration-150 group-hover/handle:bg-input group-focus-visible/handle:h-14 group-focus-visible/handle:bg-ring",
              dragging && "h-14 bg-ring",
            )}
          />
        </div>
        <section
          aria-label="Progress"
          className="min-w-0 shrink-0 overflow-hidden rounded-2xl border bg-background shadow-xs"
          style={{ width: "var(--panel-width, 380px)" }}
        >
          {progress}
        </section>
      </div>

      <Sheet open={sheetOpen && !docked} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 bg-background p-0 data-[side=right]:w-[min(400px,calc(100%-2.5rem))] data-[side=right]:sm:max-w-none lg:hidden"
        >
          <SheetTitle className="sr-only">Progress</SheetTitle>
          <SheetDescription className="sr-only">
            The budget, every action, every source and every claim of this run.
          </SheetDescription>
          {progress}
        </SheetContent>
      </Sheet>
    </>
  );
}

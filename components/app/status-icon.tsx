import { BanIcon, CheckIcon, TriangleAlertIcon } from "lucide-react";
import { GlyphSpinner } from "@/components/asciicn/glyph-spinner";
import type { RunView } from "@/lib/research/run-view";
import { cn } from "@/lib/utils";

export type RunStatus = RunView["status"];

export const STATUS_LABEL: Readonly<Record<RunStatus, string>> = {
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** The state of a run as an icon. The shape differs per state, so colour is not the only cue. */
export function StatusIcon({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  const size = cn("size-3.5 shrink-0", className);
  switch (status) {
    case "running":
      return <GlyphSpinner className={cn("text-sm", className)} />;
    case "completed":
      return <CheckIcon aria-hidden className={cn(size, "text-success")} />;
    case "cancelled":
      return (
        <BanIcon aria-hidden className={cn(size, "text-muted-foreground")} />
      );
    case "failed":
      return (
        <TriangleAlertIcon
          aria-hidden
          className={cn(size, "text-destructive")}
        />
      );
  }
}

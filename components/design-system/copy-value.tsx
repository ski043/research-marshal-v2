"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type State = "idle" | "copied" | "failed";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API on a page served over plain http from another machine.
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const done = document.execCommand("copy");
    field.remove();
    return done;
  }
}

/** A value of the design system. A click or Enter copies it and says so. */
export function CopyValue({
  value,
  children,
  className,
}: {
  value: string;
  children?: ReactNode;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(timer);
  }, [state]);

  const Icon = state === "copied" ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      title={`Copy ${value}`}
      data-copy={value}
      data-copied={state === "copied" ? "" : undefined}
      onClick={async () => setState((await copy(value)) ? "copied" : "failed")}
      className={cn(
        "group/copy relative -mx-1 inline-flex max-w-full cursor-copy items-center gap-1 rounded-sm px-1 text-left font-mono text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="min-w-0 break-words">{children ?? value}</span>
      <Icon
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-opacity duration-150",
          state === "copied"
            ? "text-success"
            : "opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100",
        )}
      />
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Not copied" : ""}
      </span>
      {state !== "idle" && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-6 left-0 z-10 animate-in rounded-md px-1.5 py-0.5 font-sans text-xs font-medium whitespace-nowrap duration-150 fade-in motion-reduce:animate-none",
            state === "copied"
              ? "bg-foreground text-background"
              : "bg-destructive-soft text-destructive",
          )}
        >
          {state === "copied" ? "Copied" : "Not copied"}
        </span>
      )}
    </button>
  );
}

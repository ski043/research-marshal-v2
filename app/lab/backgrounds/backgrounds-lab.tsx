"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ModelOption } from "@/components/app/model-select";
import { type Budget, StartScreen } from "@/components/app/start-screen";
import {
  DEFAULT_START_VARIANT,
  isStartVariant,
  START_VARIANTS,
  startVariantSpec,
} from "@/components/asciicn/start-background";
import { cn } from "@/lib/utils";

export function BackgroundsLab(props: {
  models: readonly ModelOption[];
  defaultModel: string;
  budget: Budget;
}) {
  const param = useSearchParams().get("variant");
  const current = isStartVariant(param) ? param : DEFAULT_START_VARIANT;
  return (
    <>
      {/* The key remounts the screen, so each variant starts from its own first frame. */}
      <StartScreen key={current} variant={current} {...props} />
      <nav
        aria-label="Background variants"
        className="fixed right-3 bottom-3 z-40 flex max-w-[calc(100%-1.5rem)] gap-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {START_VARIANTS.map((variant) => {
          const { label, name } = startVariantSpec(variant);
          const active = variant === current;
          return (
            <Link
              key={variant}
              href={`?variant=${variant}`}
              replace
              scroll={false}
              aria-current={active ? "page" : undefined}
              title={name}
              className={cn(
                "flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active &&
                  "bg-primary text-primary-foreground hover:text-primary-foreground",
              )}
            >
              <span className="tabular-nums">{label}</span>
              <span className={cn(active ? "inline" : "hidden xl:inline")}>
                {name}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

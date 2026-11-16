import type { ReactNode } from "react";
import {
  DitherGlyph,
  type DitherVariant,
} from "@/components/asciicn/dither-glyph";

/** A run with no report to show: cancelled, failed, or not stored. */
export function RunNotice({
  variant,
  title,
  children,
  action,
}: {
  variant: DitherVariant;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-in flex-col items-center px-4 py-10 text-center duration-300 fade-in motion-reduce:animate-none">
      <DitherGlyph variant={variant} />
      <h2 className="mt-7 text-xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      <div className="mt-2 flex max-w-md flex-col gap-2 text-sm text-pretty text-muted-foreground">
        {children}
      </div>
      {action && <div className="mt-6 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

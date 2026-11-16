"use client";

import { formatClock } from "@/lib/ui/format";
import { useNow } from "@/lib/ui/use-now";

/** A clock that counts up from `since` while something runs. Empty until the page is live. */
export function Elapsed({
  since,
  className,
}: {
  since: string | null;
  className?: string;
}) {
  const now = useNow();
  if (since === null || now === null) return null;
  return (
    <span className={className}>{formatClock(now - Date.parse(since))}</span>
  );
}

"use client";

import { useId, useState } from "react";
import { SourceLabelBadge } from "@/components/run/source-label";
import { domainOf } from "@/lib/research/domain";
import type { DroppedClaim, VerifiedClaim } from "@/lib/research/run-view";
import { cn } from "@/lib/utils";

export const CHECK_NAME = {
  V1: "the quote is not on the page word for word",
  V2: "the quote does not support the claim",
} as const;

export function Quote({ children }: { children: string }) {
  return (
    <blockquote className="border-s-2 border-input ps-2.5 text-xs/relaxed text-pretty break-words text-muted-foreground">
      “{children}”
    </blockquote>
  );
}

export function VerifiedItem({ claim }: { claim: VerifiedClaim }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-md bg-primary-soft px-1 font-mono text-[0.6875rem] font-medium tabular-nums text-primary-ink">
        <span className="sr-only">Claim </span>
        {claim.number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm text-pretty">{claim.statement}</p>
        <Quote>{claim.quote}</Quote>
      </div>
    </div>
  );
}

export function DroppedItem({ claim }: { claim: DroppedClaim }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-4.5 shrink-0 items-center justify-center rounded-md bg-destructive-soft px-1 font-mono text-[0.6875rem] font-medium text-destructive">
        <span className="sr-only">Dropped, failed </span>
        {claim.failed}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm text-pretty text-muted-foreground line-through decoration-muted-foreground/60">
          {claim.statement}
        </p>
        <Quote>{claim.quote}</Quote>
        <p className="text-xs text-pretty break-words">
          <span className="font-medium text-destructive">
            Failed {claim.failed}
          </span>
          <span className="text-muted-foreground">
            : {CHECK_NAME[claim.failed]}. {claim.reason}
          </span>
        </p>
      </div>
    </div>
  );
}

/** Every claim of the run: the verified ones, and the dropped ones with the check they failed (F3). */
export function ClaimsList({
  verified,
  dropped,
}: {
  verified: readonly VerifiedClaim[];
  dropped: readonly DroppedClaim[];
}) {
  const name = useId();
  const [show, setShow] = useState<"verified" | "dropped">("verified");
  const options = [
    { value: "verified", label: "Verified", count: verified.length },
    { value: "dropped", label: "Dropped", count: dropped.length },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex gap-1 rounded-lg bg-muted p-0.5">
        <legend className="sr-only">Which claims to show</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring",
              show === option.value &&
                "bg-background text-foreground shadow-xs",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={show === option.value}
              onChange={() => setShow(option.value)}
              className="sr-only"
            />
            {option.label}
            <span className="font-mono tabular-nums text-muted-foreground">
              {option.count}
            </span>
          </label>
        ))}
      </fieldset>

      {show === "verified" ? (
        verified.length === 0 ? (
          <p className="px-2 py-4 text-sm text-pretty text-muted-foreground">
            No verified claim. A claim is verified when its quote is on the page
            word for word (V1) and supports the claim (V2).
          </p>
        ) : (
          <ul className="flex flex-col gap-4 px-2">
            {verified.map((claim) => (
              <li key={claim.number} className="flex flex-col gap-1.5">
                <VerifiedItem claim={claim} />
                <div className="ms-7 flex flex-wrap items-center gap-2">
                  <a
                    href={claim.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate rounded-sm font-mono text-xs text-muted-foreground underline-offset-3 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {claim.source.domain}
                    <span className="sr-only">
                      : {claim.source.title} (opens in a new tab)
                    </span>
                  </a>
                  <SourceLabelBadge label={claim.source.label} />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : dropped.length === 0 ? (
        <p className="px-2 py-4 text-sm text-pretty text-muted-foreground">
          No dropped claim. A claim is dropped when it fails V1 or V2, and it
          stays listed here.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 px-2">
          {dropped.map((claim, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a dropped claim has no id; the list only grows at its end
            <li key={i} className="flex flex-col gap-1.5">
              <DroppedItem claim={claim} />
              <span className="ms-7 font-mono text-xs text-muted-foreground">
                {domainOf(claim.url)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

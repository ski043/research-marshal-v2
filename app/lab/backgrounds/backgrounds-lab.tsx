"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ModelOption } from "@/components/app/model-select";
import { type Budget, StartScreen } from "@/components/app/start-screen";
import {
  DEFAULT_START_VARIANT,
  isStartVariant,
  START_VARIANTS,
  type StartVariant,
  startVariantSpec,
} from "@/components/asciicn/start-background";
import { cn } from "@/lib/utils";

type Section = { group?: string; variants: StartVariant[] };

// Neighbours of one group share a section, so the bar names the group once.
const SECTIONS = START_VARIANTS.reduce<Section[]>((sections, variant) => {
  const { group } = startVariantSpec(variant);
  const last = sections.at(-1);
  if (group && last?.group === group) last.variants.push(variant);
  else sections.push({ group, variants: [variant] });
  return sections;
}, []);

export function BackgroundsLab(props: {
  models: readonly ModelOption[];
  defaultModel: string;
  budget: Budget;
}) {
  const param = useSearchParams().get("variant");
  const current = isStartVariant(param) ? param : DEFAULT_START_VARIANT;
  const link = (variant: StartVariant) => {
    const active = variant === current;
    return (
      <Link
        key={variant}
        href={`?variant=${variant}`}
        replace
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-8 items-center rounded-lg px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active &&
            "bg-primary text-primary-foreground hover:text-primary-foreground",
        )}
      >
        {startVariantSpec(variant).name}
      </Link>
    );
  };
  return (
    <>
      {/* The key remounts the screen, so each variant starts from its own first frame. */}
      <StartScreen key={current} variant={current} {...props} />
      <nav
        aria-label="Background variants"
        className="fixed right-3 bottom-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-x-2 gap-y-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {SECTIONS.map(({ group, variants }) =>
          group ? (
            <fieldset key={group} className="flex items-center gap-0.5">
              <legend className="float-start ps-2 pe-1 text-xs/8 text-muted-foreground">
                {group}
              </legend>
              {variants.map(link)}
            </fieldset>
          ) : (
            variants.map(link)
          ),
        )}
      </nav>
    </>
  );
}

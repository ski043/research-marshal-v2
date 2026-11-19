import type { CSSProperties, ReactNode } from "react";
import type { DesignSystem, ThemeName } from "@/lib/ui/design-system";
import { cn } from "@/lib/utils";

export const SECTIONS = [
  { id: "idea", title: "Idea" },
  { id: "colour", title: "Colour" },
  { id: "typography", title: "Typography" },
  { id: "shape", title: "Shape and depth" },
  { id: "brand", title: "Brand" },
  { id: "ascii", title: "ASCII art" },
  { id: "components", title: "Components" },
  { id: "motion", title: "Motion and accessibility" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

/** One numbered section of the page. Its heading is a link to itself. */
export function Section({
  id,
  lead,
  children,
}: {
  id: SectionId;
  lead: ReactNode;
  children: ReactNode;
}) {
  const at = SECTIONS.findIndex((section) => section.id === id);
  const title = SECTIONS[at]?.title;
  return (
    <section
      id={id}
      data-section
      aria-labelledby={`${id}-title`}
      className="border-t py-12 first:border-t-0 sm:py-16"
    >
      <header className="mb-8 flex max-w-2xl flex-col gap-2">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {String(at + 1).padStart(2, "0")}
        </p>
        <h2
          id={`${id}-title`}
          className="text-2xl font-semibold tracking-tight text-balance"
        >
          <a
            href={`#${id}`}
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {title}
          </a>
        </h2>
        <div className="flex flex-col gap-3 text-[0.9375rem]/7 text-pretty text-muted-foreground">
          {lead}
        </div>
      </header>
      {children}
    </section>
  );
}

/** A part of a section, with an anchor of its own. */
export function Part({
  id,
  title,
  rule,
  children,
  className,
}: {
  id: string;
  title: string;
  rule?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("mt-10 first:mt-0", className)}
    >
      <h3
        id={`${id}-title`}
        className="text-lg font-semibold tracking-tight text-balance"
      >
        <a
          href={`#${id}`}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {title}
        </a>
      </h3>
      {rule && (
        <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">
          {rule}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A rule of the system, stated as a sentence a person can follow. */
export function Rules({ children }: { children: ReactNode }) {
  return (
    <ul className="flex max-w-2xl list-disc flex-col gap-1.5 ps-5 text-sm text-pretty marker:text-muted-foreground">
      {children}
    </ul>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

/**
 * A block that shows one theme whatever theme the page is in: it sets every colour
 * token to its value in `theme`. The `dark:` variants of a component still follow the
 * page, so it is for marks and plain text, not for whole components.
 */
export function ThemeScope({
  system,
  theme,
  className,
  children,
}: {
  system: DesignSystem;
  theme: ThemeName;
  className?: string;
  children: ReactNode;
}) {
  const style = Object.fromEntries([
    ...system.colors.map((color) => [color.token, color.value[theme].css]),
    ["colorScheme", theme],
  ]) as CSSProperties;
  return (
    <div
      data-theme-scope={theme}
      style={style}
      className={cn("text-foreground", className)}
    >
      {children}
    </div>
  );
}

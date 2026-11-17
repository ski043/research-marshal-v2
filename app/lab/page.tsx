import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { Instrument_Serif, Newsreader } from "next/font/google";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { ICON_DIR, iconType } from "@/app/lab/icons";
import { Wordmark } from "@/components/app/brand-mark";
import { cn } from "@/lib/utils";

// A prototype route: the product owner compares the options here, and the page goes
// once he has chosen.
export const metadata: Metadata = { title: "Lab" };

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const newsreader = Newsreader({ subsets: ["latin"] });

const ICON_SIZES = [28, 64, 256] as const;

// The app has no class for a light surface inside a dark page. This copies the light
// tokens of globals.css onto `.lab-light`, so both themes sit side by side from one source.
function lightTokens(): string {
  const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  const root = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? "";
  return `.lab-light{${root}color-scheme:light}`;
}

type Variant = { id: string; note: string; mark: ReactNode };

const VARIANTS: readonly Variant[] = [
  {
    id: "W1",
    note: "Geist Semibold, tight tracking, one ink. The wordmark before this page.",
    mark: (
      <span className="font-semibold tracking-tight">Research Marshal</span>
    ),
  },
  {
    id: "W2",
    note: "Geist Semibold, two-tone: Research in the primary ink, Marshal in the foreground.",
    mark: (
      <span className="font-semibold tracking-tight">
        <span className="text-primary-ink">Research</span> Marshal
      </span>
    ),
  },
  {
    id: "W3",
    note: "Geist Semibold, two-tone reversed: Research in the foreground, Marshal in the primary ink.",
    mark: (
      <span className="font-semibold tracking-tight">
        Research <span className="text-primary-ink">Marshal</span>
      </span>
    ),
  },
  {
    id: "W4",
    note: "Geist, weight contrast: Research Light 300, Marshal Bold 700, set closed up.",
    mark: (
      <span className="tracking-tight">
        <span className="font-light">Research</span>
        <span className="font-bold">Marshal</span>
      </span>
    ),
  },
  {
    id: "W5",
    note: "Geist, weight contrast reversed: Research Bold, Marshal Regular in the muted ink.",
    mark: (
      <span className="tracking-tight">
        <span className="font-bold">Research</span>{" "}
        <span className="text-muted-foreground">Marshal</span>
      </span>
    ),
  },
  {
    id: "W6",
    note: "Geist Semibold, all caps at 0.72em, tracking 0.16em, two-tone.",
    mark: (
      <span className="text-[0.72em] font-semibold tracking-[0.16em] uppercase">
        <span className="text-primary-ink">Research</span> Marshal
      </span>
    ),
  },
  {
    id: "W7",
    note: "Geist Mono Medium, lower case, a slash in the primary ink.",
    mark: (
      <span className="font-mono text-[0.9em] font-medium tracking-tight">
        research<span className="text-primary-ink">/</span>marshal
      </span>
    ),
  },
  {
    id: "W8",
    note: "Instrument Serif Italic for Research at 1.3em, Geist Semibold for Marshal.",
    mark: (
      <span className="leading-none whitespace-nowrap">
        <span
          className={cn(
            instrumentSerif.className,
            "text-[1.3em] text-primary-ink italic",
          )}
        >
          Research
        </span>{" "}
        <span className="font-semibold tracking-tight">Marshal</span>
      </span>
    ),
  },
  {
    id: "W9",
    note: "Stacked: RESEARCH in tracked caps and the primary ink over Marshal in Geist Bold.",
    mark: (
      <span className="flex flex-col leading-none">
        <span className="text-[0.56em] font-semibold tracking-[0.2em] text-primary-ink uppercase">
          Research
        </span>
        <span className="mt-[0.2em] text-[1.06em] font-bold tracking-tight">
          Marshal
        </span>
      </span>
    ),
  },
  {
    id: "W10",
    note: "Geist Medium with a dot in the primary colour between the words.",
    mark: (
      <span className="inline-flex items-center gap-[0.4em] font-medium tracking-tight">
        Research
        <span className="size-[0.28em] rounded-full bg-primary" />
        Marshal
      </span>
    ),
  },
  {
    id: "W11",
    note: "Geist with a hairline divider: Research Semibold, Marshal Regular in the muted ink.",
    mark: (
      <span className="inline-flex items-center gap-[0.55em] tracking-tight">
        <span className="font-semibold">Research</span>
        <span className="h-[1em] w-px bg-input" />
        <span className="text-muted-foreground">Marshal</span>
      </span>
    ),
  },
  {
    id: "W12",
    note: "Newsreader Medium, a text serif, at 1.12em, one ink.",
    mark: (
      <span
        className={cn(
          newsreader.className,
          "text-[1.12em] leading-none font-medium tracking-tight",
        )}
      >
        Research Marshal
      </span>
    ),
  },
  {
    id: "W13",
    note: "Instrument Serif for both words at 1.35em, Research in italic.",
    mark: (
      <span
        className={cn(instrumentSerif.className, "text-[1.35em] leading-none")}
      >
        <span className="italic">Research</span> Marshal
      </span>
    ),
  },
];

function Lockup({ size, children }: { size: number; children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-[0.625em] text-foreground"
      style={{ fontSize: size }}
    >
      <span
        aria-hidden
        className="size-[1.75em] shrink-0 rounded-[0.625em] bg-primary"
      />
      {children}
    </div>
  );
}

function Surface({
  theme,
  className,
  children,
}: {
  theme: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        theme === "dark" ? "dark" : "lab-light",
        "bg-sidebar text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

async function IconCandidates() {
  await connection();
  const files = (await readdir(ICON_DIR).catch(() => [] as string[]))
    .filter((file) => iconType(file) !== undefined)
    .sort();
  if (files.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No icon candidate yet. An image file in{" "}
        <code className="font-mono text-foreground">public/lab/icons/</code>{" "}
        shows up here at 28, 64 and 256 pixels.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {files.map((file) => (
        <li key={file} className="overflow-hidden rounded-xl border">
          <p className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">
            {file}
          </p>
          <div className="grid sm:grid-cols-2">
            {(["light", "dark"] as const).map((theme) => (
              <Surface
                key={theme}
                theme={theme}
                className="flex flex-wrap items-end gap-6 p-4"
              >
                {ICON_SIZES.map((size) => (
                  <figure key={size} className="flex flex-col gap-2">
                    {/* biome-ignore lint/performance/noImgElement: a candidate file as it is, in any format, without the image optimizer */}
                    <img
                      src={`/lab/icon/${encodeURIComponent(file)}`}
                      alt={`${file} at ${size} pixels`}
                      width={size}
                      height={size}
                    />
                    <figcaption className="text-xs text-muted-foreground tabular-nums">
                      {size}px
                    </figcaption>
                  </figure>
                ))}
              </Surface>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LabPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background lg:rounded-2xl lg:border lg:shadow-xs">
      <style>{lightTokens()}</style>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium tracking-tight">Lab</h1>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Options to compare, not decisions. Each one is on the sidebar
            surface in the light and in the dark theme.
          </p>
        </header>

        <section id="icons" aria-labelledby="icons-heading">
          <h2 id="icons-heading" className="mb-4 text-lg font-medium">
            Icon candidates
          </h2>
          <Suspense fallback={null}>
            <IconCandidates />
          </Suspense>
        </section>

        <section id="wordmarks" aria-labelledby="wordmarks-heading">
          <h2 id="wordmarks-heading" className="mb-1 text-lg font-medium">
            Wordmark variants
          </h2>
          <p className="mb-4 max-w-prose text-sm text-pretty text-muted-foreground">
            Each variant at the size of the sidebar, next to a 28 pixel square
            in place of the icon, and once larger. The sidebar uses{" "}
            <a href="#W8" className="text-primary-ink underline">
              W8
            </a>{" "}
            now.
          </p>
          <ul className="flex flex-col gap-4">
            {VARIANTS.map((variant) => (
              <li
                key={variant.id}
                id={variant.id}
                className="overflow-hidden rounded-xl border"
              >
                <p className="flex items-baseline gap-3 border-b px-4 py-2 text-sm">
                  <span className="font-mono font-medium">{variant.id}</span>
                  <span className="text-muted-foreground">{variant.note}</span>
                </p>
                <div className="grid sm:grid-cols-2">
                  {(["light", "dark"] as const).map((theme) => (
                    <Surface
                      key={theme}
                      theme={theme}
                      className="flex flex-col gap-6 px-3 py-4"
                    >
                      <Lockup size={16}>{variant.mark}</Lockup>
                      <Lockup size={36}>{variant.mark}</Lockup>
                    </Surface>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="applied" aria-labelledby="applied-heading">
          <h2 id="applied-heading" className="mb-4 text-lg font-medium">
            In the sidebar now: W8
          </h2>
          <div className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
            {(["light", "dark"] as const).map((theme) => (
              <Surface key={theme} theme={theme} className="px-3 py-4">
                <Lockup size={16}>
                  <Wordmark />
                </Lockup>
              </Surface>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
